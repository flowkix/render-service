'use strict'
const test = require('node:test')
const assert = require('node:assert')
const axios = require('axios')
const { GeminiProvider } = require('./gemini')
const { runWithUsageRecorder } = require('../../ai-credits/usage-recorder')

function fakeImageResponse() {
  return {
    data: {
      candidates: [
        { content: { parts: [{ inlineData: { mimeType: 'image/png', data: Buffer.from('fake-image').toString('base64') } }] } },
      ],
      usageMetadata: { totalTokenCount: 123 },
    },
  }
}

test('records one stage with the fixed prefix, dropping the prospect-data suffix', async (t) => {
  t.mock.method(axios, 'post', async () => fakeImageResponse())
  const provider = new GeminiProvider({ apiKey: 'test' })

  const out = await runWithUsageRecorder(() =>
    provider.generate({ images: [], prompt: 'p', opts: { label: 'branding:Acme Corp', resolution: '2K' } })
  )

  assert.strictEqual(out.error, null)
  assert.deepStrictEqual(out.stages, [
    { stage: 'branding', model: 'gemini-3-pro-image', resolution: '2K', images: 1 },
  ])
})

test('defaults resolution to 1K when opts.resolution is unset', async (t) => {
  t.mock.method(axios, 'post', async () => fakeImageResponse())
  const provider = new GeminiProvider({ apiKey: 'test' })

  const out = await runWithUsageRecorder(() =>
    provider.generate({ images: [], prompt: 'p', opts: { label: 'branding:Acme Corp' } })
  )

  assert.strictEqual(out.error, null)
  assert.strictEqual(out.stages.length, 1)
  assert.strictEqual(out.stages[0].resolution, '1K')
})

test('no stage recorded when the response has no image part', async (t) => {
  t.mock.method(axios, 'post', async () => ({
    data: { candidates: [{ content: { parts: [{ text: 'blocked — no image' }] } }] },
  }))
  const provider = new GeminiProvider({ apiKey: 'test' })

  const out = await runWithUsageRecorder(() =>
    provider.generate({ images: [], prompt: 'p', opts: { label: 'branding:Acme Corp' } })
  )

  assert.ok(out.error, 'expected generate() to throw when no image part is present')
  assert.strictEqual(out.stages.length, 0)
})

test('no stage recorded when axios.post rejects with a 400', async (t) => {
  const badRequest = new Error('Request failed with status code 400')
  badRequest.response = { status: 400 }
  t.mock.method(axios, 'post', async () => { throw badRequest })
  const provider = new GeminiProvider({ apiKey: 'test' })

  const out = await runWithUsageRecorder(() =>
    provider.generate({ images: [], prompt: 'p', opts: { label: 'branding:Acme Corp' } })
  )

  assert.strictEqual(out.error, badRequest)
  assert.strictEqual(out.stages.length, 0)
})
