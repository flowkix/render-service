const { test } = require('node:test')
const assert = require('node:assert/strict')
const { escapeHtml, escapeAttr } = require('./html-escape')

test('escapeHtml escapes &, <, > but leaves quotes alone', () => {
  assert.equal(escapeHtml(`<b>Tom & "Jerry"</b>`), '&lt;b&gt;Tom &amp; "Jerry"&lt;/b&gt;')
})

test('escapeAttr additionally escapes single and double quotes', () => {
  assert.equal(escapeAttr(`O'Brien & "Co"`), 'O&#39;Brien &amp; &quot;Co&quot;')
})
