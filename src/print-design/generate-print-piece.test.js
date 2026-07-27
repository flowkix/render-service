// src/print-design/generate-print-piece.test.js
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { computeSheetDimensions, TEMPLATE_REGISTRY, generatePrintPiece } = require('./generate-print-piece')

test('computeSheetDimensions adds bleed on both sides for the bi-fold', () => {
  const { sheetWIn, sheetHIn } = computeSheetDimensions(TEMPLATE_REGISTRY['snacket-bifold-v2'])
  assert.ok(Math.abs(sheetWIn - 11.11) < 0.001, `expected ~11.11, got ${sheetWIn}`)
  assert.ok(Math.abs(sheetHIn - 8.63) < 0.001, `expected ~8.63, got ${sheetHIn}`)
})

test('computeSheetDimensions matches the real VistaPrint business card sheet size', () => {
  const { sheetWIn, sheetHIn } = computeSheetDimensions(TEMPLATE_REGISTRY['snacket-business-card'])
  assert.ok(Math.abs(sheetWIn - 3.62) < 0.001, `expected ~3.62, got ${sheetWIn}`)
  assert.ok(Math.abs(sheetHIn - 2.12) < 0.001, `expected ~2.12, got ${sheetHIn}`)
})

test('generatePrintPiece rejects an unknown template_key before touching the filesystem', async () => {
  await assert.rejects(
    () => generatePrintPiece({ template_key: 'not-a-real-template', content: {}, palette: {}, photo_urls: {}, client_id: 'c1' }),
    /Unknown template_key/
  )
})
