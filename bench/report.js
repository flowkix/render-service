'use strict'
// Self-contained HTML contact sheet + run comparison. No dependencies — pure string templating.
const path = require('path')
const fs = require('fs')

function loadRun(runDir) {
  const run = JSON.parse(fs.readFileSync(path.join(runDir, 'run.json'), 'utf8'))
  const qaDir = path.join(runDir, 'qa')
  const qa = {}
  if (fs.existsSync(qaDir)) {
    for (const f of fs.readdirSync(qaDir)) {
      if (f.endsWith('.json')) qa[f.replace(/\.json$/, '')] = JSON.parse(fs.readFileSync(path.join(qaDir, f), 'utf8'))
    }
  }
  return { run, qa }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

const CSS = `
  body{font-family:system-ui,sans-serif;background:#111;color:#eee;margin:20px}
  h1,h2{font-weight:600} a{color:#7dd3fc}
  table{border-collapse:collapse;margin:12px 0} td,th{border:1px solid #333;padding:4px 10px;font-size:13px}
  th{background:#1c1c1c} .pass{color:#4ade80} .fail{color:#f87171} .warn{color:#fbbf24}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}
  .card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:10px}
  .card img{width:100%;border-radius:4px;cursor:zoom-in}
  .badges{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
  .badge{font-size:10px;padding:2px 6px;border-radius:8px;background:#052e16;color:#4ade80}
  .badge.f{background:#450a0a;color:#f87171}
  .meta{font-size:11px;color:#999;margin-top:4px}
  .caseid{font-size:12px;color:#ddd;word-break:break-all;font-weight:600}
`

function summaryTable(run, qa) {
  const models = [...new Set(run.cases.map(c => `${c.provider}/${c.model}`))]
  const rows = []
  for (const stage of ['branding', 'scene']) {
    for (const m of models) {
      const cases = run.cases.filter(c => c.stage === stage && `${c.provider}/${c.model}` === m)
      if (!cases.length) continue
      const ok = cases.filter(c => !c.error)
      const scoredCases = ok.map(c => qa[c.caseId]).filter(q => q && !q.error)
      const passed = scoredCases.filter(q => q.verdict === 'pass').length
      const cost = cases.reduce((s, c) => s + (c.costUsd || 0), 0)
      const avgLat = ok.length ? ok.reduce((s, c) => s + c.latencyMs, 0) / ok.length / 1000 : 0
      const avgRealism = scoredCases.length
        ? (scoredCases.reduce((s, q) => s + (q.photorealism || 0), 0) / scoredCases.length).toFixed(1)
        : '—'
      rows.push(`<tr><td>${stage}</td><td>${esc(m)}</td><td>${ok.length}/${cases.length}</td>
        <td class="${passed === scoredCases.length && scoredCases.length ? 'pass' : 'warn'}">${passed}/${scoredCases.length}</td>
        <td>${avgRealism}</td><td>${avgLat.toFixed(1)}s</td><td>$${cost.toFixed(2)}</td></tr>`)
    }
  }
  return `<table><tr><th>Stage</th><th>Model</th><th>Generated</th><th>QA pass</th><th>Realism ø</th><th>Latency ø</th><th>Cost</th></tr>${rows.join('')}</table>`
}

function failedChecksTable(run, qa) {
  const counts = {}
  for (const c of run.cases) {
    const q = qa[c.caseId]
    if (!q?.checks) continue
    for (const [id, r] of Object.entries(q.checks)) {
      if (!r.pass) {
        counts[id] = counts[id] || { n: 0, examples: [] }
        counts[id].n++
        if (counts[id].examples.length < 3) counts[id].examples.push(c.caseId)
      }
    }
  }
  const rows = Object.entries(counts).sort((a, b) => b[1].n - a[1].n)
    .map(([id, v]) => `<tr><td>${esc(id)}</td><td class="fail">${v.n}</td><td>${v.examples.map(esc).join('<br>')}</td></tr>`)
  if (!rows.length) return '<p class="pass">No failed checks 🎉</p>'
  return `<table><tr><th>Failed check</th><th>Count</th><th>Examples</th></tr>${rows.join('')}</table>`
}

function card(c, q) {
  const badges = q?.checks
    ? Object.entries(q.checks).map(([id, r]) => `<span class="badge${r.pass ? '' : ' f'}" title="${esc(r.note)}">${esc(id)}</span>`).join('')
    : '<span class="badge f">not scored</span>'
  const body = c.error
    ? `<p class="fail">ERROR: ${esc(c.error)}</p>`
    : `<a href="${esc(c.imagePath)}" target="_blank"><img loading="lazy" src="${esc(c.imagePath)}"></a>`
  return `<div class="card">
    <div class="caseid">${esc(c.caseId)} ${q ? `<span class="${q.verdict === 'pass' ? 'pass' : 'fail'}">[${q.verdict || 'err'}]</span>` : ''}</div>
    ${body}
    <div class="badges">${badges}</div>
    <div class="meta">${esc(c.provider)}/${esc(c.model)} · ${((c.latencyMs || 0) / 1000).toFixed(1)}s · $${(c.costUsd || 0).toFixed(3)} ${q?.photorealism ? `· realism ${q.photorealism}/5` : ''}</div>
  </div>`
}

function writeContactSheet(runDir) {
  const { run, qa } = loadRun(runDir)
  const groups = {}
  for (const c of run.cases) {
    const key = `${c.logoId} — ${c.stage}`
    ;(groups[key] = groups[key] || []).push(c)
  }
  const sections = Object.entries(groups)
    .map(([title, cases]) => `<h2>${esc(title)}</h2><div class="grid">${cases.map(c => card(c, qa[c.caseId])).join('')}</div>`)
    .join('')
  const html = `<!doctype html><meta charset="utf-8"><title>EV bench — ${esc(run.runId)}</title><style>${CSS}</style>
    <h1>EV Engine bench — ${esc(run.runId)}</h1>
    <p>matrix <b>${esc(run.matrix)}</b> · config <b>${esc(run.configSnapshot.engine.configVersion)}</b> ·
       ${run.totals.ok} ok / ${run.totals.failed} failed · total $${run.totals.costUsd}</p>
    ${summaryTable(run, qa)}
    <h2>Failure modes</h2>${failedChecksTable(run, qa)}
    ${sections}`
  const out = path.join(runDir, 'contact-sheet.html')
  fs.writeFileSync(out, html)
  return out
}

function writeCompareSheet(runDirA, runDirB) {
  const A = loadRun(runDirA)
  const B = loadRun(runDirB)
  const checkRates = ({ run, qa }) => {
    const rates = {}
    for (const c of run.cases) {
      const q = qa[c.caseId]
      if (!q?.checks) continue
      for (const [id, r] of Object.entries(q.checks)) {
        rates[id] = rates[id] || { pass: 0, total: 0 }
        rates[id].total++
        if (r.pass) rates[id].pass++
      }
    }
    return rates
  }
  const ra = checkRates(A), rb = checkRates(B)
  const ids = [...new Set([...Object.keys(ra), ...Object.keys(rb)])].sort()
  const pct = r => (r ? `${((r.pass / r.total) * 100).toFixed(0)}% (${r.pass}/${r.total})` : '—')
  const delta = id => {
    if (!ra[id] || !rb[id]) return ''
    const d = rb[id].pass / rb[id].total - ra[id].pass / ra[id].total
    const cls = d > 0 ? 'pass' : d < 0 ? 'fail' : ''
    return `<span class="${cls}">${d > 0 ? '+' : ''}${(d * 100).toFixed(0)}pp</span>`
  }
  const rows = ids.map(id => `<tr><td>${esc(id)}</td><td>${pct(ra[id])}</td><td>${pct(rb[id])}</td><td>${delta(id)}</td></tr>`).join('')
  const verdictRate = ({ run, qa }) => {
    const scored = run.cases.map(c => qa[c.caseId]).filter(q => q && !q.error)
    return scored.length ? `${((scored.filter(q => q.verdict === 'pass').length / scored.length) * 100).toFixed(0)}%` : '—'
  }
  const html = `<!doctype html><meta charset="utf-8"><title>EV bench compare</title><style>${CSS}</style>
    <h1>Compare: ${esc(A.run.runId)} → ${esc(B.run.runId)}</h1>
    <p>Overall pass rate: ${verdictRate(A)} → ${verdictRate(B)}</p>
    <table><tr><th>Check</th><th>${esc(A.run.runId)}</th><th>${esc(B.run.runId)}</th><th>Δ</th></tr>${rows}</table>`
  const out = path.join(runDirB, `compare_vs_${path.basename(runDirA)}.html`)
  fs.writeFileSync(out, html)
  return out
}

module.exports = { writeContactSheet, writeCompareSheet }
