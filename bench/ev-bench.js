#!/usr/bin/env node
'use strict'
/**
 * EV Image Engine bench CLI.
 *
 *   node bench/ev-bench.js estimate --matrix default
 *   node bench/ev-bench.js run --matrix smoke
 *   node bench/ev-bench.js run --matrix default [--stage branding|scene] [--filter logo=apex-wordmark,preset=P2]
 *                              [--concurrency 3] [--resume <runId>] [--no-score]
 *   node bench/ev-bench.js score --run <runId>
 *   node bench/ev-bench.js compare <runIdA> <runIdB>
 */
const path = require('path')
const fs = require('fs')
const { loadBenchEnv } = require('./env')
loadBenchEnv()
const { loadEngineConfig, BrandedEvCache } = require('../src/ev-engine')
const { runBrandingStage } = require('../src/ev-engine/pipeline/branding-stage')
const { runSceneStage } = require('../src/ev-engine/pipeline/scene-stage')
const { providerAvailable } = require('../src/ev-engine/providers')
const { priceFor } = require('../src/ev-engine/providers/provider')
const { getMatrix } = require('./matrix')
const { scoreRun } = require('./scorer')
const { writeContactSheet, writeCompareSheet } = require('./report')

const RUNS_DIR = path.join(__dirname, 'runs')

function parseArgs(argv) {
  const [, , command, ...rest] = argv
  const args = { command, positional: [] }
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (a === '--no-score') args.noScore = true
    else if (a.startsWith('--')) args[a.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = rest[++i]
    else args.positional.push(a)
  }
  return args
}

function applyFilter(cases, filterStr, stage) {
  let out = cases
  if (stage) out = out.filter(c => c.stage === stage)
  if (filterStr) {
    for (const pair of filterStr.split(',')) {
      const [k, v] = pair.split('=')
      out = out.filter(c => {
        if (k === 'logo') return c.logo.id === v
        if (k === 'preset') return c.presetId === v
        if (k === 'zoneset') return c.zoneSetName === v
        if (k === 'model') return c.candidate.model.includes(v)
        if (k === 'provider') return c.candidate.provider === v
        throw new Error(`Unknown filter key "${k}" (valid: logo, preset, zoneset, model, provider)`)
      })
    }
  }
  return out
}

function skipUnavailableProviders(cases) {
  const skipped = []
  const runnable = cases.filter(c => {
    if (providerAvailable(c.candidate.provider)) return true
    skipped.push(c)
    return false
  })
  if (skipped.length) {
    const providers = [...new Set(skipped.map(c => c.candidate.provider))]
    console.log(`⚠ skipping ${skipped.length} case(s) — provider(s) unavailable (missing API key): ${providers.join(', ')}`)
  }
  return { runnable, skipped }
}

async function pool(items, concurrency, worker) {
  const queue = [...items]
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift()
      await worker(item)
    }
  })
  await Promise.all(workers)
}

// Scene cases need a branded EV input: generated once per logo with the DEFAULT branding
// config ('all' zones), shared via cache across presets and scene candidates.
async function ensureBrandedEv({ logo, configs, cache, brandedMetaByLogo }) {
  const result = await runBrandingStage({
    companyName: logo.companyName,
    logoSource: logo.absPath,
    zones: 'all',
    cache,
    ...configs,
  })
  if (!result.cached) brandedMetaByLogo[logo.id] = result.meta
  return result
}

async function cmdRun(args) {
  const matrixName = args.matrix || 'smoke'
  const configs = loadEngineConfig()
  const allCases = applyFilter(getMatrix(matrixName), args.filter, args.stage)
  const { runnable } = skipUnavailableProviders(allCases)
  if (!runnable.length) throw new Error('No runnable cases after filters/provider availability')

  const runId = args.resume || `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}_${configs.engineConfig.configVersion}`
  const runDir = path.join(RUNS_DIR, runId)
  const imagesDir = path.join(runDir, 'images')
  fs.mkdirSync(imagesDir, { recursive: true })
  const cache = new BrandedEvCache({ mode: 'local', dir: path.join(runDir, 'branded-cache') })

  const runFile = path.join(runDir, 'run.json')
  const existing = args.resume && fs.existsSync(runFile) ? JSON.parse(fs.readFileSync(runFile, 'utf8')) : null
  const doneCases = new Map((existing?.cases || []).filter(c => c.imagePath && !c.error).map(c => [c.caseId, c]))

  const records = []
  const brandedMetaByLogo = {}
  const concurrency = parseInt(args.concurrency || '3', 10)
  let done = 0

  console.log(`run ${runId} — ${runnable.length} case(s), concurrency ${concurrency}`)

  await pool(runnable, concurrency, async c => {
    if (doneCases.has(c.caseId)) {
      records.push(doneCases.get(c.caseId))
      console.log(`↷ resume-skip ${c.caseId}`)
      return
    }
    const record = {
      caseId: c.caseId, stage: c.stage, logoId: c.logo.id, companyName: c.logo.companyName,
      zoneSetName: c.zoneSetName || null, theme: c.theme || null, venue: c.venue || null,
      provider: c.candidate.provider, model: c.candidate.model,
    }
    const t0 = Date.now()
    try {
      let buffer, meta
      if (c.stage === 'branding') {
        ;({ buffer, meta } = await runBrandingStage({
          companyName: c.logo.companyName,
          logoSource: c.logo.absPath,
          zones: c.zones,
          providerOverride: c.candidate,
          ...configs,
        }))
      } else {
        const branded = await ensureBrandedEv({ logo: c.logo, configs, cache, brandedMetaByLogo })
        const brandedEvBuffer = branded.buffer
        record.brandedCacheKey = branded.cacheKey
        ;({ buffer, meta } = await runSceneStage({
          companyName: c.logo.companyName,
          brandedEvBuffer,
          logoSource: c.logo.absPath,
          theme: c.theme,
          venue: c.venue,
          providerOverride: c.candidate,
          ...configs,
        }))
      }
      const imagePath = path.join('images', `${c.caseId}.png`)
      fs.writeFileSync(path.join(runDir, imagePath), buffer)
      Object.assign(record, {
        imagePath, latencyMs: Date.now() - t0,
        costUsd: meta.costUsd ?? 0, promptChars: meta.prompt?.length,
      })
      console.log(`✔ ${c.caseId} (${((Date.now() - t0) / 1000).toFixed(1)}s, $${(meta.costUsd ?? 0).toFixed(3)})`)
    } catch (e) {
      record.error = e.message
      record.latencyMs = Date.now() - t0
      console.log(`✘ ${c.caseId} — ${e.message.slice(0, 200)}`)
    }
    records.push(record)
    done++
    if (done % 10 === 0) console.log(`— progress ${done}/${runnable.length}`)
  })

  const brandingPrereqCost = Object.values(brandedMetaByLogo).reduce((s, m) => s + (m.costUsd ?? 0), 0)
  const runMeta = {
    runId, matrix: matrixName, startedAt: existing?.startedAt || new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    configSnapshot: {
      engine: configs.engineConfig,
      zonesVersion: configs.zonesConfig.version,
      presetsVersion: configs.presetsConfig.version,
      correctionsVersion: configs.correctionsConfig.version,
    },
    filters: { stage: args.stage || null, filter: args.filter || null },
    totals: {
      cases: records.length,
      ok: records.filter(r => !r.error).length,
      failed: records.filter(r => r.error).length,
      costUsd: +(records.reduce((s, r) => s + (r.costUsd || 0), 0) + brandingPrereqCost).toFixed(3),
      brandingPrereqCostUsd: +brandingPrereqCost.toFixed(3),
    },
    cases: records.sort((a, b) => a.caseId.localeCompare(b.caseId)),
  }
  fs.writeFileSync(runFile, JSON.stringify(runMeta, null, 2))
  console.log(`\nrun complete: ${runMeta.totals.ok} ok, ${runMeta.totals.failed} failed, $${runMeta.totals.costUsd}`)

  if (!args.noScore) {
    console.log('\nscoring…')
    await scoreRun(runDir, configs)
  }
  const sheet = writeContactSheet(runDir)
  console.log(`\ncontact sheet: ${sheet}`)
  return runDir
}

function cmdEstimate(args) {
  const matrixName = args.matrix || 'default'
  const configs = loadEngineConfig()
  const cases = applyFilter(getMatrix(matrixName), args.filter, args.stage)
  let total = 0
  const byModel = {}
  for (const c of cases) {
    const stageCfg = configs.engineConfig.stages[c.stage]
    const cost = priceFor(c.candidate.model, stageCfg.resolution)
    total += cost
    byModel[c.candidate.model] = (byModel[c.candidate.model] || 0) + cost
  }
  // Scene prerequisites: 1 branded EV per distinct logo among scene cases (default branding config)
  const sceneLogos = [...new Set(cases.filter(c => c.stage === 'scene').map(c => c.logo.id))]
  const b = configs.engineConfig.stages.branding
  const prereq = sceneLogos.length * priceFor(b.model, b.resolution)
  const scoring = cases.length * 0.01

  console.log(`matrix "${matrixName}": ${cases.length} cases`)
  for (const [m, c] of Object.entries(byModel)) console.log(`  ${m}: $${c.toFixed(2)}`)
  console.log(`  branded-EV prerequisites (${sceneLogos.length} logos): $${prereq.toFixed(2)}`)
  console.log(`  auto-QA scoring (~$0.01/img): $${scoring.toFixed(2)}`)
  console.log(`TOTAL ≈ $${(total + prereq + scoring).toFixed(2)}`)
}

async function cmdScore(args) {
  if (!args.run) throw new Error('score requires --run <runId>')
  const runDir = path.join(RUNS_DIR, args.run)
  const configs = loadEngineConfig()
  await scoreRun(runDir, configs)
  console.log(`contact sheet: ${writeContactSheet(runDir)}`)
}

function cmdCompare(args) {
  const [a, b] = args.positional
  if (!a || !b) throw new Error('compare requires two run ids')
  const out = writeCompareSheet(path.join(RUNS_DIR, a), path.join(RUNS_DIR, b))
  console.log(`compare sheet: ${out}`)
}

async function main() {
  const args = parseArgs(process.argv)
  switch (args.command) {
    case 'run': return cmdRun(args)
    case 'estimate': return cmdEstimate(args)
    case 'score': return cmdScore(args)
    case 'compare': return cmdCompare(args)
    default:
      console.log('Usage: ev-bench.js <run|estimate|score|compare> [options] — see file header')
      process.exit(args.command ? 1 : 0)
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
