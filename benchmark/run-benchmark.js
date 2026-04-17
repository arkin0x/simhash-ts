const fs = require('node:fs')
const path = require('node:path')

const {
  simhash,
  simhashHardened,
  simhashEquality,
  hammingDistance,
  HARDENED_SIMHASH_DEFAULTS,
  EQUALITY_SIMHASH_DEFAULTS,
} = require('../dist/simhash.js')

const DEFAULT_TOP_NEIGHBORS = 5

function readCorpus(corpusPath) {
  const raw = fs.readFileSync(corpusPath, 'utf8')
  const parsed = JSON.parse(raw)

  const textsInput = Array.isArray(parsed) ? parsed : parsed.texts
  if (!Array.isArray(textsInput) || textsInput.length === 0) {
    throw new Error('Corpus must contain a non-empty "texts" array (or be an array itself).')
  }

  const seenIds = new Set()
  const texts = textsInput.map((entry, index) => normalizeTextEntry(entry, index, seenIds))
  const requestedTopNeighbors = Array.isArray(parsed) ? undefined : parsed.topNeighbors
  const topNeighbors = normalizeTopNeighbors(requestedTopNeighbors)

  return { texts, topNeighbors }
}

function normalizeTopNeighbors(value) {
  if (value === undefined) {
    return DEFAULT_TOP_NEIGHBORS
  }
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('"topNeighbors" must be an integer >= 1 when provided.')
  }
  return value
}

function normalizeTextEntry(entry, index, seenIds) {
  if (typeof entry === 'string') {
    const fallbackId = `text-${index + 1}`
    if (seenIds.has(fallbackId)) {
      throw new Error(`Duplicate text id "${fallbackId}"`)
    }
    seenIds.add(fallbackId)
    return {
      id: fallbackId,
      text: entry,
    }
  }

  if (!entry || typeof entry !== 'object') {
    throw new Error(`Invalid text entry at index ${index}; expected string or object.`)
  }

  const id = String(entry.id ?? `text-${index + 1}`).trim()
  const text = typeof entry.text === 'string' ? entry.text : ''

  if (id.length === 0) {
    throw new Error(`Invalid text entry at index ${index}; id cannot be empty.`)
  }
  if (seenIds.has(id)) {
    throw new Error(`Duplicate text id "${id}"`)
  }
  if (text.length === 0) {
    throw new Error(`Invalid text entry "${id}"; text cannot be empty.`)
  }

  seenIds.add(id)
  return {
    id,
    text,
  }
}

function computeMetrics(texts) {
  const records = texts.map((entry) => {
    const legacy = simhash(entry.text)
    const hardened = simhashHardened(entry.text)
    const equality = simhashEquality(entry.text)
    return {
      ...entry,
      legacy,
      hardened,
      equality,
      charCount: Array.from(entry.text).length,
      tokenCount: countTokens(entry.text),
    }
  })

  const perTextComparisons = new Map(records.map((record) => [record.id, []]))
  const pairResults = []

  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const left = records[i]
      const right = records[j]
      const legacyDistance = hammingDistance(left.legacy.bin, right.legacy.bin)
      const hardenedDistance = hammingDistance(left.hardened.bin, right.hardened.bin)
      const legacyExactMatch = left.legacy.hex === right.legacy.hex
      const hardenedExactMatch = left.hardened.hex === right.hardened.hex
      const equalityExactMatch = left.equality.hex === right.equality.hex

      const comparison = {
        leftId: left.id,
        rightId: right.id,
        legacyDistance,
        hardenedDistance,
        legacyExactMatch,
        hardenedExactMatch,
        equalityExactMatch,
      }
      pairResults.push(comparison)

      perTextComparisons.get(left.id).push({
        otherId: right.id,
        legacyDistance,
        hardenedDistance,
        legacyExactMatch,
        hardenedExactMatch,
        equalityExactMatch,
      })
      perTextComparisons.get(right.id).push({
        otherId: left.id,
        legacyDistance,
        hardenedDistance,
        legacyExactMatch,
        hardenedExactMatch,
        equalityExactMatch,
      })
    }
  }

  return { records, perTextComparisons, pairResults }
}

function countTokens(text) {
  const tokens = text
    .toLowerCase()
    .match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)
  return tokens ? tokens.length : 0
}

function summarizeDistances(values) {
  if (values.length === 0) {
    return { min: 0, max: 0, average: 0 }
  }

  let min = values[0]
  let max = values[0]
  let total = 0
  for (const value of values) {
    if (value < min) min = value
    if (value > max) max = value
    total += value
  }

  return {
    min,
    max,
    average: total / values.length,
  }
}

function formatDistanceSummary(label, values) {
  const summary = summarizeDistances(values)
  return `${label}: min=${summary.min}, avg=${summary.average.toFixed(2)}, max=${summary.max}`
}

function countExactMatches(values) {
  let count = 0
  for (const value of values) {
    if (value) {
      count++
    }
  }
  return count
}

function buildHashGroups(records, fieldName) {
  const groups = new Map()
  for (const record of records) {
    const hashHex = record[fieldName].hex
    if (!groups.has(hashHex)) {
      groups.set(hashHex, [])
    }
    groups.get(hashHex).push(record.id)
  }
  return Array.from(groups.values()).sort((a, b) => {
    if (b.length !== a.length) {
      return b.length - a.length
    }
    return a[0].localeCompare(b[0])
  })
}

function formatHashGroups(label, groups) {
  const collisionGroups = groups.filter((group) => group.length > 1)
  if (collisionGroups.length === 0) {
    return `${label}: no collisions (all hashes unique in corpus)`
  }
  const formatted = collisionGroups.map((group) => `[${group.join(', ')}]`).join(' ')
  return `${label}: ${formatted}`
}

function printBenchmarkReport(corpusPath, records, perTextComparisons, pairResults, topNeighbors) {
  const legacyAll = pairResults.map((pair) => pair.legacyDistance)
  const hardenedAll = pairResults.map((pair) => pair.hardenedDistance)
  const legacyExactPairCount = countExactMatches(pairResults.map((pair) => pair.legacyExactMatch))
  const hardenedExactPairCount = countExactMatches(pairResults.map((pair) => pair.hardenedExactMatch))
  const equalityExactPairCount = countExactMatches(pairResults.map((pair) => pair.equalityExactMatch))
  const legacyGroups = buildHashGroups(records, 'legacy')
  const hardenedGroups = buildHashGroups(records, 'hardened')
  const equalityGroups = buildHashGroups(records, 'equality')

  console.log('SimHash Benchmark Report')
  console.log('=======================')
  console.log(`corpusPath: ${corpusPath}`)
  console.log(`textCount: ${records.length}`)
  console.log(`pairCount: ${pairResults.length}`)
  console.log(`topNeighbors: ${topNeighbors}`)
  console.log(`hardenedDefaults: ${JSON.stringify(HARDENED_SIMHASH_DEFAULTS)}`)
  console.log(`equalityDefaults: ${JSON.stringify(EQUALITY_SIMHASH_DEFAULTS)}`)
  console.log(formatDistanceSummary('legacyDistanceSummary', legacyAll))
  console.log(formatDistanceSummary('hardenedDistanceSummary', hardenedAll))
  console.log(`legacyExactPairMatches: ${legacyExactPairCount}`)
  console.log(`hardenedExactPairMatches: ${hardenedExactPairCount}`)
  console.log(`equalityExactPairMatches: ${equalityExactPairCount}`)
  console.log(formatHashGroups('legacyCollisionGroups', legacyGroups))
  console.log(formatHashGroups('hardenedCollisionGroups', hardenedGroups))
  console.log(formatHashGroups('equalityCollisionGroups', equalityGroups))
  console.log('')

  for (const record of records) {
    const comparisons = perTextComparisons.get(record.id)
    const nearest = comparisons
      .slice()
      .sort((a, b) => {
        if (a.hardenedDistance !== b.hardenedDistance) {
          return a.hardenedDistance - b.hardenedDistance
        }
        if (a.legacyDistance !== b.legacyDistance) {
          return a.legacyDistance - b.legacyDistance
        }
        return a.otherId.localeCompare(b.otherId)
      })
      .slice(0, topNeighbors)

    console.log(`textId: ${record.id}`)
    console.log(`charCount: ${record.charCount}`)
    console.log(`tokenCount: ${record.tokenCount}`)
    console.log(`legacyHashHex: ${record.legacy.hex}`)
    console.log(`hardenedHashHex: ${record.hardened.hex}`)
    console.log(`equalityHashHex: ${record.equality.hex}`)

    if (comparisons.length === 0) {
      console.log('comparisons: none (add at least one more text to compute distances)')
      console.log('')
      continue
    }
    const equalityExactMatches = comparisons
      .filter((comparison) => comparison.equalityExactMatch)
      .map((comparison) => comparison.otherId)

    console.log(formatDistanceSummary('legacyDistanceFromThisText', comparisons.map((v) => v.legacyDistance)))
    console.log(formatDistanceSummary('hardenedDistanceFromThisText', comparisons.map((v) => v.hardenedDistance)))
    console.log(
      `exactMatchesByEqualityHash: ${equalityExactMatches.length > 0 ? equalityExactMatches.join(', ') : 'none'}`
    )
    console.log(`nearestNeighborsByHardenedDistance (top ${nearest.length}):`)
    for (const neighbor of nearest) {
      console.log(
        `  otherTextId=${neighbor.otherId}, hardenedDistance=${neighbor.hardenedDistance}, legacyDistance=${neighbor.legacyDistance}`
      )
    }
    console.log('')
  }
}

function main() {
  const requestedCorpusPath = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : path.resolve(__dirname, 'corpus.json')

  const { texts, topNeighbors } = readCorpus(requestedCorpusPath)
  const { records, perTextComparisons, pairResults } = computeMetrics(texts)
  printBenchmarkReport(requestedCorpusPath, records, perTextComparisons, pairResults, topNeighbors)
}

try {
  main()
} catch (error) {
  console.error(`Benchmark failed: ${error.message}`)
  process.exit(1)
}
