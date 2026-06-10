#!/usr/bin/env node
// Collision study for the equality fingerprints over a large real-world corpus.
//
// THIS IS NOT A TEST. It is an opt-in maintainer tool. It is statistical and,
// when fed a freshly pulled corpus, non-deterministic. Never wire it into
// `npm test` or CI. Use it to characterize a NEW or RETUNED equality variant
// before shipping it (this is exactly how minhash-equality-v1's 8-bucket,
// low-bit parameters were chosen; see kb-private ADR-005).
//
// Usage:
//   npm run build
//   node research/collision-study.js <corpus.jsonl> [--examples N]
// Corpus format: one JSON object per line, with a string field `c` (the text).
// Get one with research/pull-corpus.sh (requires `nak` and relay access).

const fs = require('node:fs')
const crypto = require('node:crypto')
const { simhashEquality, minhashEquality } = require('../dist/simhash.js')

// ---- independent reimplementation of the equality pipeline (for Jaccard + config sweeps) ----
// Tokenization must match the library; this is verified by the self-validation below.
const STOPWORDS = new Set(
  'a an the and or but if to of in on for with at by from up down out over under into about between after before through during without within is are was were be been being it its that this these those as not can could should would will may might do does did done have has had i you he she we they them our your their'.split(
    /\s+/
  )
)
function canonicalize(input) {
  return input
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/\r\n?/g, '\n')
    .replace(/https?:\/\/\S+/giu, ' url ')
    .replace(/[​-‍﻿]/g, '')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/[\p{N}]+/gu, ' num ')
    .replace(/\s+/gu, ' ')
    .trim()
}
function stem(t) {
  if (t.length > 5 && t.endsWith('ing')) return t.slice(0, -3)
  if (t.length > 4 && t.endsWith('ed')) return t.slice(0, -2)
  if (t.length > 4 && t.endsWith('es')) return t.slice(0, -2)
  if (t.length > 3 && t.endsWith('s')) return t.slice(0, -1)
  return t
}
function tokenize(input) {
  const canonical = canonicalize(input)
  const raw = canonical.match(/[\p{L}\p{N}]+/gu) || []
  const normalized = raw.map(stem)
  const filtered = normalized.filter((t) => t.length >= 4 && !STOPWORDS.has(t))
  return filtered.length ? filtered : normalized.filter((t) => t.length > 0)
}
const eqsCache = new Map()
function eqs(t) {
  let v = eqsCache.get(t)
  if (v === undefined) {
    v = crypto.createHash('sha256').update('eqs:' + t, 'utf8').digest('hex')
    eqsCache.set(t, v)
  }
  return v
}
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex')
// Reconstructed fingerprint under an arbitrary config {B, k, end:'high'|'low'},
// so the tool can sweep candidate variants the library does not (yet) expose.
function reconstruct(tokens, { B, k, end }) {
  const mins = Array(B).fill(null)
  const seen = new Set()
  for (const t of tokens) {
    if (seen.has(t)) continue
    seen.add(t)
    const h = eqs(t)
    const b = parseInt(h.slice(0, 2), 16) % B
    if (mins[b] === null || h < mins[b]) mins[b] = h
  }
  const ver = end === 'low' ? 'minhash-equality-v1' : 'simhash-equality-v2'
  const parts = mins.map((h, i) => (h === null ? `b${i}:x` : `b${i}:${end === 'low' ? h.slice(-k) : h.slice(0, k)}`))
  return sha(`${ver}|n=1|b=${B}|k=${k}|m=4|${parts.join('|')}`)
}
function jaccard(a, b) {
  const A = new Set(a), Bs = new Set(b)
  if (A.size === 0 && Bs.size === 0) return 1
  let inter = 0
  for (const x of A) if (Bs.has(x)) inter++
  return inter / (A.size + Bs.size - inter)
}
function collisionPairs(hexes) {
  const g = new Map()
  for (const h of hexes) g.set(h, (g.get(h) || 0) + 1)
  let p = 0
  for (const c of g.values()) p += (c * (c - 1)) / 2
  return { pairs: p, distinct: g.size }
}

// ---- load corpus ----
const corpusPath = process.argv[2]
if (!corpusPath) {
  console.error('usage: node research/collision-study.js <corpus.jsonl> [--examples N]')
  process.exit(1)
}
const exFlag = process.argv.indexOf('--examples')
const exampleCount = exFlag >= 0 ? Number(process.argv[exFlag + 1] || 3) : 3
const texts = [
  ...new Set(
    fs
      .readFileSync(corpusPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l).c
        } catch {
          return null
        }
      })
      .filter((t) => typeof t === 'string' && t.length > 0)
  ),
]
const tok = texts.map(tokenize)
console.log(`corpus: ${texts.length} distinct texts from ${corpusPath}\n`)

// ---- self-validation: reconstruction must reproduce the library partition ----
;(function selfValidate() {
  const s = texts.slice(0, Math.min(1500, texts.length))
  const okV1 = new Set(s.map((t) => minhashEquality(t).hex)).size === new Set(s.map((t) => reconstruct(tokenize(t), { B: 8, k: 3, end: 'low' }))).size
  const okV2 = new Set(s.map((t) => simhashEquality(t).hex)).size === new Set(s.map((t) => reconstruct(tokenize(t), { B: 2, k: 3, end: 'high' }))).size
  console.log(`[self-validation] reconstruction partition == library (n=${s.length})  v1:${okV1}  v2:${okV2}`)
  if (!okV1 || !okV2) console.log('  WARNING: reconstruction diverged; sweep rows below are untrustworthy.')
  console.log('')
})()

// ---- collision report: shipped library algorithms + a config sweep ----
const CONFIGS = [
  { name: 'legacy v2 (lib)', fn: (t) => simhashEquality(t).hex },
  { name: 'v1 minhash  (lib)', fn: (t) => minhashEquality(t).hex },
  { name: 'sweep B4 low', fn: (t) => reconstruct(tokenize(t), { B: 4, k: 3, end: 'low' }) },
  { name: 'sweep B8 low', fn: (t) => reconstruct(tokenize(t), { B: 8, k: 3, end: 'low' }) },
  { name: 'sweep B16 low', fn: (t) => reconstruct(tokenize(t), { B: 16, k: 3, end: 'low' }) },
]
const totalPairs = (texts.length * (texts.length - 1)) / 2
console.log(`pairwise classification by token-Jaccard (FP = unrelated J<0.2 that collide; nearDup = J>0.8 that collide)`)
console.log('config'.padEnd(18), 'unique%'.padStart(8), 'collPairs'.padStart(10), 'falsePos'.padStart(9), 'nearDup'.padStart(8))
for (const cfg of CONFIGS) {
  const hexes = texts.map(cfg.fn)
  const { pairs, distinct } = collisionPairs(hexes)
  const groups = new Map()
  hexes.forEach((h, i) => {
    if (!groups.has(h)) groups.set(h, [])
    groups.get(h).push(i)
  })
  let fp = 0, dup = 0
  for (const idxs of groups.values()) {
    if (idxs.length < 2) continue
    for (let a = 0; a < idxs.length; a++)
      for (let b = a + 1; b < idxs.length; b++) {
        const j = jaccard(tok[idxs[a]], tok[idxs[b]])
        if (j < 0.2) fp++
        else if (j >= 0.8) dup++
      }
  }
  console.log(cfg.name.padEnd(18), ((100 * distinct) / texts.length).toFixed(1).padStart(8), String(pairs).padStart(10), String(fp).padStart(9), String(dup).padStart(8))
}
console.log(`\n(total pairs compared: ${totalPairs.toLocaleString()})`)

// ---- caught red-handed: unrelated pairs that share a legacy v2 fingerprint ----
;(function examples() {
  const groups = new Map()
  texts.forEach((t, i) => {
    const h = simhashEquality(t).hex
    if (!groups.has(h)) groups.set(h, [])
    groups.get(h).push(i)
  })
  const found = []
  for (const idxs of groups.values()) {
    if (idxs.length < 2) continue
    for (let a = 0; a < idxs.length && found.length < exampleCount; a++)
      for (let b = a + 1; b < idxs.length && found.length < exampleCount; b++) {
        if (jaccard(tok[idxs[a]], tok[idxs[b]]) < 0.12 && tok[idxs[a]].length > 40 && tok[idxs[b]].length > 40) found.push([idxs[a], idxs[b]])
      }
    if (found.length >= exampleCount) break
  }
  if (!found.length) return
  const snip = (t) => t.replace(/\s+/g, ' ').trim().slice(0, 120)
  console.log(`\nunrelated pairs sharing a legacy v2 fingerprint (and separated by v1):`)
  found.forEach(([a, b], n) => {
    console.log(`  [${n + 1}] A: "${snip(texts[a])}..."`)
    console.log(`      B: "${snip(texts[b])}..."`)
    console.log(`      v2 same? ${simhashEquality(texts[a]).hex === simhashEquality(texts[b]).hex}   v1 same? ${minhashEquality(texts[a]).hex === minhashEquality(texts[b]).hex}`)
  })
})()
