'use strict'
const test = require('node:test')
const assert = require('node:assert')
const { runWithUsageRecorder, recordImageUsage } = require('./usage-recorder')

test('collects every successful image across awaits inside the run', async () => {
  const out = await runWithUsageRecorder(async () => {
    recordImageUsage({ stage: 'branding', model: 'gemini-3-pro-image', resolution: '2K' })
    await new Promise(r => setTimeout(r, 5))
    recordImageUsage({ stage: 'scene', model: 'gemini-3-pro-image', resolution: '2k' })
    return 'img'
  })
  assert.strictEqual(out.result, 'img')
  assert.strictEqual(out.error, null)
  assert.deepStrictEqual(out.stages, [
    { stage: 'branding', model: 'gemini-3-pro-image', resolution: '2K', images: 1 },
    { stage: 'scene', model: 'gemini-3-pro-image', resolution: '2K', images: 1 },
  ])
})

test('keeps stages recorded before a failure and returns the error', async () => {
  const boom = new Error('scene failed')
  const out = await runWithUsageRecorder(async () => {
    recordImageUsage({ stage: 'branding', model: 'gemini-3-pro-image', resolution: '2K' })
    throw boom
  })
  assert.strictEqual(out.error, boom)
  assert.strictEqual(out.stages.length, 1)
})

test('concurrent runs do not see each other', async () => {
  const [a, b] = await Promise.all([
    runWithUsageRecorder(async () => { await new Promise(r => setTimeout(r, 10)); recordImageUsage({ stage: 'a', model: 'm', resolution: '1K' }) }),
    runWithUsageRecorder(async () => { recordImageUsage({ stage: 'b', model: 'm', resolution: '1K' }) }),
  ])
  assert.deepStrictEqual(a.stages.map(s => s.stage), ['a'])
  assert.deepStrictEqual(b.stages.map(s => s.stage), ['b'])
})

test('recordImageUsage outside a run is a no-op (bench/scripts)', () => {
  assert.doesNotThrow(() => recordImageUsage({ stage: 'x', model: 'm', resolution: '1K' }))
})
