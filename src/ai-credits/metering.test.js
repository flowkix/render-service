'use strict'
const test = require('node:test')
const assert = require('node:assert')
const { meterGeneration, InsufficientCreditsError } = require('./metering')
const { recordImageUsage } = require('./usage-recorder')

const CONFIG = { baseUrl: 'https://hub.test', secret: 's3cret' }

function fakeHttp(handlers = {}) {
  const calls = []
  return {
    calls,
    post: async (url, body, opts) => {
      calls.push({ url, body, opts })
      const h = handlers[url.replace(CONFIG.baseUrl, '')]
      if (h instanceof Error) throw h
      return { data: h ?? { ok: true } }
    },
  }
}

// Mirrors the real @supabase/postgrest-js builder shape: `.single()` returns a
// thenable that also exposes `.abortSignal()` (which returns the same
// thenable) rather than a plain Promise — production code chains
// `.single().abortSignal(...)`, so the fake must support that chain.
// `hang: true` makes the thenable never settle on its own, only rejecting
// once the abort signal fires — used to test the insert timeout.
function fakeDb({ insertError = null, hang = false } = {}) {
  const inserts = []
  return {
    inserts,
    from: () => ({
      insert: (row) => ({
        select: () => ({
          single: () => {
            let signal = null
            let settled = false
            const builder = {
              abortSignal(s) {
                signal = s
                return builder
              },
              then(resolve, reject) {
                if (hang) {
                  const rejectOnAbort = () => {
                    if (settled) return
                    settled = true
                    reject(new Error('This operation was aborted'))
                  }
                  if (signal) {
                    if (signal.aborted) return rejectOnAbort()
                    signal.addEventListener('abort', rejectOnAbort)
                  }
                  return
                }
                inserts.push(row)
                settled = true
                resolve(insertError ? { data: null, error: { message: insertError } } : { data: { id: 'outbox-1' }, error: null })
              },
              catch(onRejected) {
                return builder.then(undefined, onRejected)
              },
            }
            return builder
          },
        }),
      }),
    }),
  }
}

const flush = () => new Promise(r => setImmediate(r))
const gen = (stages = 1) => async () => {
  for (let i = 0; i < stages; i++) recordImageUsage({ stage: `s${i}`, model: 'gemini-3-pro-image', resolution: '2K' })
  return 'image'
}

test('best-effort: no precheck, writes one outbox row, kicks with the outbox id', async () => {
  const http = fakeHttp(); const db = fakeDb()
  const out = await meterGeneration({ source: 'business-card-capture' }, gen(2), { http, getDb: () => db, config: CONFIG })
  await flush()
  assert.strictEqual(out, 'image')
  assert.strictEqual(db.inserts.length, 1)
  assert.strictEqual(db.inserts[0].source, 'business-card-capture')
  assert.strictEqual(db.inserts[0].request_status, 'succeeded')
  assert.strictEqual(db.inserts[0].stages.length, 2)
  assert.match(db.inserts[0].idempotency_key, /^[0-9a-f-]{36}$/)
  assert.deepStrictEqual(http.calls.map(c => c.url), ['https://hub.test/api/internal/ai-credits/render-charge'])
  assert.deepStrictEqual(http.calls[0].body, { outbox_id: 'outbox-1' })
  assert.strictEqual(http.calls[0].opts.headers['x-render-ai-credits-secret'], 's3cret')
})

test('blocking source with zero balance: 402 error, generation never runs, nothing written', async () => {
  const http = fakeHttp({ '/api/internal/ai-credits/render-precheck': { allowed: false, balanceCredits: 0 } })
  const db = fakeDb(); let ran = false
  await assert.rejects(
    meterGeneration({ source: 'pitch-elevator' }, async () => { ran = true }, { http, getDb: () => db, config: CONFIG }),
    InsufficientCreditsError,
  )
  assert.strictEqual(ran, false)
  assert.strictEqual(db.inserts.length, 0)
})

test('blocking source, precheck unreachable: fails open and still meters', async () => {
  const http = fakeHttp({ '/api/internal/ai-credits/render-precheck': new Error('ECONNREFUSED') })
  const db = fakeDb()
  const out = await meterGeneration({ source: 'hub-tools-ev-full' }, gen(1), { http, getDb: () => db, config: CONFIG })
  assert.strictEqual(out, 'image')
  assert.strictEqual(db.inserts.length, 1)
})

test('pipeline fails after a paid stage: records failed_partial and rethrows the original error', async () => {
  const http = fakeHttp(); const db = fakeDb(); const boom = new Error('scene failed')
  await assert.rejects(
    meterGeneration({ source: 'stage-a-review-regen' }, async () => { recordImageUsage({ stage: 'branding', model: 'gemini-3-pro-image', resolution: '2K' }); throw boom }, { http, getDb: () => db, config: CONFIG }),
    boom,
  )
  assert.strictEqual(db.inserts[0].request_status, 'failed_partial')
})

test('pipeline fails before any paid stage: nothing written', async () => {
  const http = fakeHttp(); const db = fakeDb()
  await assert.rejects(meterGeneration({ source: 'business-card-capture' }, async () => { throw new Error('bad logo') }, { http, getDb: () => db, config: CONFIG }))
  assert.strictEqual(db.inserts.length, 0)
  assert.strictEqual(http.calls.length, 0)
})

test('outbox insert fails: sends the full row as fallback, generation still succeeds', async () => {
  const http = fakeHttp(); const db = fakeDb({ insertError: 'db down' })
  const out = await meterGeneration({ source: 'clt-alliance-public' }, gen(1), { http, getDb: () => db, config: CONFIG })
  await flush()
  assert.strictEqual(out, 'image')
  assert.strictEqual(http.calls.length, 1)
  assert.strictEqual(http.calls[0].body.fallback.source, 'clt-alliance-public')
  assert.strictEqual(http.calls[0].body.fallback.stages.length, 1)
})

test('source longer than 64 chars is capped for both the direct insert and the fallback payload', async () => {
  const longSource = 'x'.repeat(100)

  const http1 = fakeHttp(); const db1 = fakeDb()
  await meterGeneration({ source: longSource }, gen(1), { http: http1, getDb: () => db1, config: CONFIG })
  await flush()
  assert.strictEqual(db1.inserts[0].source.length, 64)
  assert.strictEqual(db1.inserts[0].source, longSource.slice(0, 64))

  const http2 = fakeHttp(); const db2 = fakeDb({ insertError: 'db down' })
  await meterGeneration({ source: longSource }, gen(1), { http: http2, getDb: () => db2, config: CONFIG })
  await flush()
  assert.strictEqual(http2.calls[0].body.fallback.source.length, 64)
  assert.strictEqual(http2.calls[0].body.fallback.source, longSource.slice(0, 64))
})

test('getDb throwing (env missing) is treated like an insert failure, never breaks the response', async () => {
  const http = fakeHttp()
  const out = await meterGeneration({ source: 'clt-alliance-public' }, gen(1), { http, getDb: () => { throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY required') }, config: CONFIG })
  await flush()
  assert.strictEqual(out, 'image')
  assert.ok(http.calls[0].body.fallback)
})

test('kick failure is swallowed (cron retries)', async () => {
  const http = fakeHttp({ '/api/internal/ai-credits/render-charge': new Error('timeout') }); const db = fakeDb()
  const out = await meterGeneration({ source: 'business-card-capture' }, gen(1), { http, getDb: () => db, config: CONFIG })
  await flush()
  assert.strictEqual(out, 'image')
})

test('missing HUB config: skips precheck and kick but still writes the outbox row', async () => {
  const http = fakeHttp(); const db = fakeDb()
  const out = await meterGeneration({ source: 'pitch-elevator' }, gen(1), { http, getDb: () => db, config: { baseUrl: undefined, secret: undefined } })
  await flush()
  assert.strictEqual(out, 'image')
  assert.strictEqual(http.calls.length, 0)
  assert.strictEqual(db.inserts.length, 1)
})

test('blocking source with precheck allowed: correct precheck call, then insert + charge kick in order', async () => {
  const http = fakeHttp({ '/api/internal/ai-credits/render-precheck': { allowed: true, balanceCredits: 100 } })
  const db = fakeDb()
  const out = await meterGeneration({ source: 'pitch-elevator' }, gen(1), { http, getDb: () => db, config: CONFIG })
  await flush()
  assert.strictEqual(out, 'image')
  assert.strictEqual(http.calls[0].url, 'https://hub.test/api/internal/ai-credits/render-precheck')
  assert.deepStrictEqual(http.calls[0].body, { source: 'pitch-elevator' })
  assert.strictEqual(http.calls[0].opts.headers['x-render-ai-credits-secret'], 's3cret')
  assert.strictEqual(http.calls[0].opts.timeout, 3000)
  assert.strictEqual(db.inserts.length, 1)
  assert.strictEqual(http.calls.length, 2)
  assert.strictEqual(http.calls[1].url, 'https://hub.test/api/internal/ai-credits/render-charge')
})

test('fallback carries the same idempotency_key as the attempted insert row', async () => {
  const http = fakeHttp(); const db = fakeDb({ insertError: 'db down' })
  await meterGeneration({ source: 'clt-alliance-public' }, gen(1), { http, getDb: () => db, config: CONFIG })
  await flush()
  assert.strictEqual(db.inserts.length, 1)
  assert.strictEqual(http.calls[0].body.fallback.idempotency_key, db.inserts[0].idempotency_key)
})

test('insert timeout: falls back within the timeout and generation still returns the image', async () => {
  const http = fakeHttp(); const db = fakeDb({ hang: true })
  const out = await meterGeneration({ source: 'clt-alliance-public' }, gen(1), { http, getDb: () => db, config: CONFIG, insertTimeoutMs: 20 })
  await flush()
  assert.strictEqual(out, 'image')
  assert.strictEqual(db.inserts.length, 0)
  assert.strictEqual(http.calls.length, 1)
  assert.ok(http.calls[0].body.fallback)
})

test('insert failure with missing HUB config logs CHARGE LOST', async (t) => {
  const errorSpy = t.mock.method(console, 'error')
  const http = fakeHttp(); const db = fakeDb({ insertError: 'db down' })
  const out = await meterGeneration({ source: 'clt-alliance-public' }, gen(1), { http, getDb: () => db, config: { baseUrl: undefined, secret: undefined } })
  await flush()
  assert.strictEqual(out, 'image')
  const messages = errorSpy.mock.calls.map(c => c.arguments[0])
  assert.ok(messages.some(m => typeof m === 'string' && m.startsWith('[ai-credits] CHARGE LOST')))
})

test('fallback kick rejects logs CHARGE LOST — fallback kick failed', async (t) => {
  const errorSpy = t.mock.method(console, 'error')
  const http = fakeHttp({ '/api/internal/ai-credits/render-charge': new Error('timeout') })
  const db = fakeDb({ insertError: 'db down' })
  const out = await meterGeneration({ source: 'clt-alliance-public' }, gen(1), { http, getDb: () => db, config: CONFIG })
  await flush()
  assert.strictEqual(out, 'image')
  const messages = errorSpy.mock.calls.map(c => c.arguments[0])
  assert.ok(messages.some(m => typeof m === 'string' && m.startsWith('[ai-credits] CHARGE LOST — fallback kick failed')))
})

test('kick: http.post throwing synchronously does not break the response', async () => {
  const syncThrowHttp = { calls: [], post: () => { throw new Error('sync boom') } }
  const db = fakeDb()
  const out = await meterGeneration({ source: 'business-card-capture' }, gen(1), { http: syncThrowHttp, getDb: () => db, config: CONFIG })
  await flush()
  assert.strictEqual(out, 'image')
})
