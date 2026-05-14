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
const UNGROUPED_FAMILY_ID = 'ungrouped'

function readCorpus(corpusPath) {
  const raw = fs.readFileSync(corpusPath, 'utf8')
  const parsed = JSON.parse(raw)

  const topNeighbors = normalizeTopNeighbors(Array.isArray(parsed) ? undefined : parsed.topNeighbors)
  const seenIds = new Set()
  const texts = []
  const families = new Map()
  const expectedPairSpecs = []
  let fallbackIndex = 0

  const ensureFamily = (familyId, description = '') => {
    if (!families.has(familyId)) {
      families.set(familyId, {
        id: familyId,
        description,
        textIds: [],
      })
    } else if (description.length > 0 && families.get(familyId).description.length === 0) {
      families.get(familyId).description = description
    }
    return families.get(familyId)
  }

  const addTextEntry = (entry, familyId) => {
    const normalized = normalizeTextEntry(entry, fallbackIndex, seenIds)
    fallbackIndex += 1
    const family = ensureFamily(familyId)
    family.textIds.push(normalized.id)
    texts.push({
      ...normalized,
      familyId,
    })
  }

  if (Array.isArray(parsed)) {
    ensureFamily(UNGROUPED_FAMILY_ID, 'Top-level corpus entries')
    for (const entry of parsed) {
      addTextEntry(entry, UNGROUPED_FAMILY_ID)
    }
  } else if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.texts) && parsed.texts.length > 0) {
      ensureFamily(UNGROUPED_FAMILY_ID, 'Top-level corpus entries')
      for (const entry of parsed.texts) {
        addTextEntry(entry, UNGROUPED_FAMILY_ID)
      }
    }

    if (Array.isArray(parsed.families)) {
      for (let familyIndex = 0; familyIndex < parsed.families.length; familyIndex++) {
        const family = parsed.families[familyIndex]
        if (!family || typeof family !== 'object') {
          throw new Error(`Invalid family at index ${familyIndex}; expected object.`)
        }

        const familyId = normalizeFamilyId(family.id, familyIndex)
        if (families.has(familyId)) {
          throw new Error(`Duplicate family id "${familyId}"`)
        }

        const familyDescription =
          typeof family.description === 'string' ? family.description.trim() : ''
        ensureFamily(familyId, familyDescription)

        if (!Array.isArray(family.texts) || family.texts.length === 0) {
          throw new Error(`Family "${familyId}" must contain a non-empty "texts" array.`)
        }
        for (const entry of family.texts) {
          addTextEntry(entry, familyId)
        }

        expectedPairSpecs.push(
          ...normalizeExpectedPairSpecs(
            family.expectedEqualityPairs,
            `families[${familyIndex}].expectedEqualityPairs`
          )
        )
      }
    }

    expectedPairSpecs.push(...normalizeExpectedPairSpecs(parsed.expectedEqualityPairs, 'expectedEqualityPairs'))
  } else {
    throw new Error('Corpus root must be an object or array.')
  }

  if (texts.length === 0) {
    throw new Error('Corpus must contain at least one text entry.')
  }

  const expectedEqualityPairs = resolveExpectedPairs(expectedPairSpecs, seenIds)
  const sortedFamilies = Array.from(families.values()).sort((a, b) => a.id.localeCompare(b.id))

  return {
    texts,
    topNeighbors,
    expectedEqualityPairs,
    families: sortedFamilies,
  }
}

function normalizeFamilyId(value, index) {
  const familyId = String(value ?? `family-${index + 1}`).trim()
  if (familyId.length === 0) {
    throw new Error(`Invalid family id at index ${index}; id cannot be empty.`)
  }
  return familyId
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

function normalizeTextEntry(entry, fallbackIndex, seenIds) {
  if (typeof entry === 'string') {
    const fallbackId = `text-${fallbackIndex + 1}`
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
    throw new Error(`Invalid text entry at index ${fallbackIndex}; expected string or object.`)
  }

  const id = String(entry.id ?? `text-${fallbackIndex + 1}`).trim()
  const text = typeof entry.text === 'string' ? entry.text : ''

  if (id.length === 0) {
    throw new Error(`Invalid text entry at index ${fallbackIndex}; id cannot be empty.`)
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

function normalizeExpectedPairSpecs(value, sourceLabel) {
  if (value === undefined) {
    return []
  }
  if (!Array.isArray(value)) {
    throw new Error(`"${sourceLabel}" must be an array of [leftId, rightId] pairs.`)
  }

  const pairs = []
  for (let index = 0; index < value.length; index++) {
    const pair = value[index]
    if (!Array.isArray(pair) || pair.length !== 2) {
      throw new Error(`Invalid pair in ${sourceLabel}[${index}]; expected [leftId, rightId].`)
    }
    const leftId = String(pair[0]).trim()
    const rightId = String(pair[1]).trim()

    if (leftId.length === 0 || rightId.length === 0) {
      throw new Error(`Invalid pair in ${sourceLabel}[${index}]; ids cannot be empty.`)
    }
    if (leftId === rightId) {
      throw new Error(`Invalid pair in ${sourceLabel}[${index}]; ids must be different.`)
    }

    pairs.push({
      leftId,
      rightId,
      source: `${sourceLabel}[${index}]`,
    })
  }

  return pairs
}

function resolveExpectedPairs(expectedPairSpecs, knownIds) {
  const deduped = new Map()
  for (const spec of expectedPairSpecs) {
    if (!knownIds.has(spec.leftId)) {
      throw new Error(`Unknown text id "${spec.leftId}" referenced in ${spec.source}.`)
    }
    if (!knownIds.has(spec.rightId)) {
      throw new Error(`Unknown text id "${spec.rightId}" referenced in ${spec.source}.`)
    }

    const [leftId, rightId] = sortPairIds(spec.leftId, spec.rightId)
    const key = makePairKey(leftId, rightId)
    if (!deduped.has(key)) {
      deduped.set(key, { leftId, rightId, key })
    }
  }

  return Array.from(deduped.values()).sort((a, b) => {
    if (a.leftId !== b.leftId) {
      return a.leftId.localeCompare(b.leftId)
    }
    return a.rightId.localeCompare(b.rightId)
  })
}

function makePairKey(leftId, rightId) {
  return `${leftId}||${rightId}`
}

function sortPairIds(leftId, rightId) {
  return leftId < rightId ? [leftId, rightId] : [rightId, leftId]
}

function formatPair(leftId, rightId) {
  const [sortedLeftId, sortedRightId] = sortPairIds(leftId, rightId)
  return `${sortedLeftId}<->${sortedRightId}`
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
      const [sortedLeftId, sortedRightId] = sortPairIds(left.id, right.id)

      const comparison = {
        leftId: left.id,
        rightId: right.id,
        leftFamilyId: left.familyId,
        rightFamilyId: right.familyId,
        pairKey: makePairKey(sortedLeftId, sortedRightId),
        legacyDistance,
        hardenedDistance,
        legacyExactMatch,
        hardenedExactMatch,
        equalityExactMatch,
      }
      pairResults.push(comparison)

      perTextComparisons.get(left.id).push({
        otherId: right.id,
        otherFamilyId: right.familyId,
        legacyDistance,
        hardenedDistance,
        legacyExactMatch,
        hardenedExactMatch,
        equalityExactMatch,
      })
      perTextComparisons.get(right.id).push({
        otherId: left.id,
        otherFamilyId: left.familyId,
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

function buildExpectedPairSet(expectedEqualityPairs) {
  const pairSet = new Set()
  for (const pair of expectedEqualityPairs) {
    pairSet.add(pair.key)
  }
  return pairSet
}

function evaluateEqualityClassification(pairResults, expectedPairSet) {
  let tp = 0
  let fn = 0
  let fp = 0
  let tn = 0
  const falseNegatives = []
  const falsePositives = []

  for (const pair of pairResults) {
    const expected = expectedPairSet.has(pair.pairKey)
    const predicted = pair.equalityExactMatch
    if (expected && predicted) {
      tp += 1
      continue
    }
    if (expected && !predicted) {
      fn += 1
      falseNegatives.push(formatPair(pair.leftId, pair.rightId))
      continue
    }
    if (!expected && predicted) {
      fp += 1
      falsePositives.push(formatPair(pair.leftId, pair.rightId))
      continue
    }
    tn += 1
  }

  falseNegatives.sort((a, b) => a.localeCompare(b))
  falsePositives.sort((a, b) => a.localeCompare(b))

  return {
    tp,
    fn,
    fp,
    tn,
    precision: tp + fp > 0 ? tp / (tp + fp) : null,
    recall: tp + fn > 0 ? tp / (tp + fn) : null,
    falseNegatives,
    falsePositives,
  }
}

function formatRatio(value) {
  return value === null ? 'n/a' : value.toFixed(3)
}

function summarizeFamilyEquality(records, pairResults, families, expectedEqualityPairs) {
  const familyByTextId = new Map(records.map((record) => [record.id, record.familyId]))
  const expectedByFamily = new Map(families.map((family) => [family.id, new Set()]))
  const pairsByFamily = new Map(families.map((family) => [family.id, []]))

  for (const expectedPair of expectedEqualityPairs) {
    const leftFamilyId = familyByTextId.get(expectedPair.leftId)
    const rightFamilyId = familyByTextId.get(expectedPair.rightId)
    if (leftFamilyId && leftFamilyId === rightFamilyId) {
      expectedByFamily.get(leftFamilyId).add(expectedPair.key)
    }
  }

  for (const pair of pairResults) {
    if (pair.leftFamilyId === pair.rightFamilyId && pairsByFamily.has(pair.leftFamilyId)) {
      pairsByFamily.get(pair.leftFamilyId).push(pair)
    }
  }

  return families.map((family) => {
    const familyPairs = pairsByFamily.get(family.id) ?? []
    const familyExpectedSet = expectedByFamily.get(family.id) ?? new Set()
    const metrics = evaluateEqualityClassification(familyPairs, familyExpectedSet)
    const familyRecords = records.filter((record) => record.familyId === family.id)
    const equalityHashGroups = buildHashGroups(familyRecords, 'equality')

    return {
      id: family.id,
      description: family.description,
      textCount: family.textIds.length,
      pairCount: familyPairs.length,
      expectedPairCount: familyExpectedSet.size,
      equalityExactPairMatches: countExactMatches(familyPairs.map((pair) => pair.equalityExactMatch)),
      metrics,
      equalityHashGroups,
    }
  })
}

function formatCollisionGroupList(groups) {
  const collisions = groups.filter((group) => group.length > 1)
  if (collisions.length === 0) {
    return 'none'
  }
  return collisions.map((group) => `[${group.join(', ')}]`).join(' ')
}

function printBenchmarkReport(
  corpusPath,
  records,
  perTextComparisons,
  pairResults,
  topNeighbors,
  expectedEqualityPairs,
  families
) {
  const legacyAll = pairResults.map((pair) => pair.legacyDistance)
  const hardenedAll = pairResults.map((pair) => pair.hardenedDistance)
  const legacyExactPairCount = countExactMatches(pairResults.map((pair) => pair.legacyExactMatch))
  const hardenedExactPairCount = countExactMatches(pairResults.map((pair) => pair.hardenedExactMatch))
  const equalityExactPairCount = countExactMatches(pairResults.map((pair) => pair.equalityExactMatch))
  const legacyGroups = buildHashGroups(records, 'legacy')
  const hardenedGroups = buildHashGroups(records, 'hardened')
  const equalityGroups = buildHashGroups(records, 'equality')
  const expectedPairSet = buildExpectedPairSet(expectedEqualityPairs)
  const equalityMetrics = evaluateEqualityClassification(pairResults, expectedPairSet)
  const familySummaries = summarizeFamilyEquality(records, pairResults, families, expectedEqualityPairs)

  console.log('SimHash Benchmark Report')
  console.log('=======================')
  console.log(`corpusPath: ${corpusPath}`)
  console.log(`textCount: ${records.length}`)
  console.log(`pairCount: ${pairResults.length}`)
  console.log(`familyCount: ${families.length}`)
  console.log(`topNeighbors: ${topNeighbors}`)
  console.log(`hardenedDefaults: ${JSON.stringify(HARDENED_SIMHASH_DEFAULTS)}`)
  console.log(`equalityDefaults: ${JSON.stringify(EQUALITY_SIMHASH_DEFAULTS)}`)
  console.log(formatDistanceSummary('legacyDistanceSummary', legacyAll))
  console.log(formatDistanceSummary('hardenedDistanceSummary', hardenedAll))
  console.log(`legacyExactPairMatches: ${legacyExactPairCount}`)
  console.log(`hardenedExactPairMatches: ${hardenedExactPairCount}`)
  console.log(`equalityExactPairMatches: ${equalityExactPairCount}`)
  console.log(`expectedEqualityPairCount: ${expectedEqualityPairs.length}`)
  if (expectedEqualityPairs.length > 0) {
    console.log(
      `equalityExpectedMetrics: tp=${equalityMetrics.tp}, fn=${equalityMetrics.fn}, fp=${equalityMetrics.fp}, tn=${equalityMetrics.tn}, precision=${formatRatio(equalityMetrics.precision)}, recall=${formatRatio(equalityMetrics.recall)}`
    )
    console.log(
      `equalityFalseNegatives: ${equalityMetrics.falseNegatives.length > 0 ? equalityMetrics.falseNegatives.join(', ') : 'none'}`
    )
    console.log(
      `equalityFalsePositives: ${equalityMetrics.falsePositives.length > 0 ? equalityMetrics.falsePositives.join(', ') : 'none'}`
    )
  }
  console.log(formatHashGroups('legacyCollisionGroups', legacyGroups))
  console.log(formatHashGroups('hardenedCollisionGroups', hardenedGroups))
  console.log(formatHashGroups('equalityCollisionGroups', equalityGroups))
  console.log('familyEqualitySummaries:')
  for (const summary of familySummaries) {
    console.log(
      `  familyId=${summary.id}, textCount=${summary.textCount}, pairCount=${summary.pairCount}, expectedPairs=${summary.expectedPairCount}, equalityExactPairMatches=${summary.equalityExactPairMatches}, tp=${summary.metrics.tp}, fn=${summary.metrics.fn}, fp=${summary.metrics.fp}, precision=${formatRatio(summary.metrics.precision)}, recall=${formatRatio(summary.metrics.recall)}`
    )
    if (summary.description.length > 0) {
      console.log(`    description=${summary.description}`)
    }
    console.log(`    equalityCollisionGroups=${formatCollisionGroupList(summary.equalityHashGroups)}`)
    if (summary.metrics.falseNegatives.length > 0) {
      console.log(`    falseNegatives=${summary.metrics.falseNegatives.join(', ')}`)
    }
    if (summary.metrics.falsePositives.length > 0) {
      console.log(`    falsePositives=${summary.metrics.falsePositives.join(', ')}`)
    }
  }
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
    console.log(`familyId: ${record.familyId}`)
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
        `  otherTextId=${neighbor.otherId}, otherFamilyId=${neighbor.otherFamilyId}, hardenedDistance=${neighbor.hardenedDistance}, legacyDistance=${neighbor.legacyDistance}`
      )
    }
    console.log('')
  }
}

function main() {
  const requestedCorpusPath = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : path.resolve(__dirname, 'corpus.json')

  const { texts, topNeighbors, expectedEqualityPairs, families } = readCorpus(requestedCorpusPath)
  const { records, perTextComparisons, pairResults } = computeMetrics(texts)
  printBenchmarkReport(
    requestedCorpusPath,
    records,
    perTextComparisons,
    pairResults,
    topNeighbors,
    expectedEqualityPairs,
    families
  )
}

try {
  main()
} catch (error) {
  console.error(`Benchmark failed: ${error.message}`)
  process.exit(1)
}