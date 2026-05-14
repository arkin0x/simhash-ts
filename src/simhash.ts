import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex } from '@noble/hashes/utils'

type SimhashResult = {
  bin: Uint8Array
  hex: string
}

type HardenedSimhashParams = {
  bitLength: number
  tokenUnigramWeight: number
  tokenBigramWeight: number
  tokenTrigramWeight: number
  charShingleSize: number
  charShingleWeight: number
  tfWeightCap: number
  minTokensForWindowing: number
  windowSizeTokens: number
  windowStepTokens: number
  shortTokenThreshold: number
}
type EqualitySimhashParams = {
  bitLength: number
  shingleSize: number
  bucketCount: number
  keptHexCharsPerBucket: number
  minTokenLength: number
}

type FeatureStats = {
  count: number
  baseWeight: number
}

export const HARDENED_SIMHASH_DEFAULTS: HardenedSimhashParams = {
  bitLength: 256,
  tokenUnigramWeight: 1.6,
  tokenBigramWeight: 0.5,
  tokenTrigramWeight: 0.45,
  charShingleSize: 2,
  charShingleWeight: 0.35,
  tfWeightCap: 3,
  minTokensForWindowing: 80,
  windowSizeTokens: 64,
  windowStepTokens: 32,
  shortTokenThreshold: 2,
}

export const EQUALITY_SIMHASH_DEFAULTS: EqualitySimhashParams = {
  bitLength: 256,
  shingleSize: 1,
  bucketCount: 2,
  keptHexCharsPerBucket: 3,
  minTokenLength: 4,
}

const EQUALITY_STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'if',
  'to',
  'of',
  'in',
  'on',
  'for',
  'with',
  'at',
  'by',
  'from',
  'up',
  'down',
  'out',
  'over',
  'under',
  'into',
  'about',
  'between',
  'after',
  'before',
  'through',
  'during',
  'without',
  'within',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'it',
  'its',
  'that',
  'this',
  'these',
  'those',
  'as',
  'not',
  'can',
  'could',
  'should',
  'would',
  'will',
  'may',
  'might',
  'do',
  'does',
  'did',
  'done',
  'have',
  'has',
  'had',
  'i',
  'you',
  'he',
  'she',
  'we',
  'they',
  'them',
  'our',
  'your',
  'their',
])

/**
   "SimHash is a locality-sensitive hashing algorithm that maps similar inputs to similar hash values. It operates on inputs that can be represented as a vector of numerical features. The algorithm computes a 256-bit hash value for each input by performing the following steps:

   1. Compute the feature vector of the input.
   2. For each feature, compute its hash value using a standard hash function (e.g., SHA-256).
   3. For each bit position in the resulting 256-bit hash, sum the hash values of all the features whose corresponding bit is set in that position, and subtract the hash values of all the features whose corresponding bit is not set in that position.
   4. Set the bit to 1 if the resulting sum is positive, and 0 otherwise.

   The resulting hash value is a 256-bit binary string that encodes the similarity of the input to other inputs that have been hashed using the same algorithm. Inputs that are more similar to each other will have hash values that differ by fewer bits than inputs that are less similar."
 */

export function simhash(text: string): SimhashResult {
  const features: string[] = extractFeatures(text)

  // Convert string to Uint8Array for hashing
  const encoder = new TextEncoder()
  const featureHashes: Uint8Array[] = features.map((v) => sha256(encoder.encode(v)))

  const BITLENGTH = 256
  const BYTELENGTH = BITLENGTH / 8

  const featureHashSum: number[] = Array(BITLENGTH).fill(0)
  for (let bitIndex = 0; bitIndex < BITLENGTH; bitIndex++) {
    for (const featureHash of featureHashes) {
      let currentBit = getBit(bitIndex, featureHash)
      featureHashSum[bitIndex] += currentBit === 1 ? 1 : -1
    }
  }

  const similarityHash = new Uint8Array(BYTELENGTH)
  for (let i = 0; i < BITLENGTH; i++) {
    if (featureHashSum[i] > 0) {
      const byteIndex = Math.floor(i / 8)
      const bitIndex = i % 8
      similarityHash[byteIndex] |= 1 << bitIndex
    }
  }

  return {
    bin: similarityHash,
    hex: bytesToHex(similarityHash),
  }
}

/**
   Hardened profile:
   - deterministic canonicalization for cross-platform consistency
   - blended token unigram/bigram/trigram features plus char 4-grams
   - capped log-TF weighting to reduce repetition/padding impact
   - short-text fallback to avoid low-feature collapse
   - optional windowed majority aggregation for long texts
 */
export function simhashHardened(
  text: string,
  params: Partial<HardenedSimhashParams> = {}
): SimhashResult {
  const cfg: HardenedSimhashParams = { ...HARDENED_SIMHASH_DEFAULTS, ...params }
  const canonicalText = canonicalizeText(text)
  const tokens = tokenize(canonicalText)

  if (tokens.length < cfg.shortTokenThreshold) {
    const shortStats = buildShortTextFeatureStats(canonicalText)
    return buildHashResult(
      simhashFromFeatureWeights(finalizeFeatureWeights(shortStats, cfg.tfWeightCap), cfg.bitLength)
    )
  }

  const baseStats = buildFeatureStats(tokens, cfg)
  const baseHash = simhashFromFeatureWeights(finalizeFeatureWeights(baseStats, cfg.tfWeightCap), cfg.bitLength)

  if (tokens.length < cfg.minTokensForWindowing) {
    return buildHashResult(baseHash)
  }

  const windows = buildTokenWindows(tokens, cfg.windowSizeTokens, cfg.windowStepTokens)
  const windowVotes = Array(cfg.bitLength).fill(0)

  for (const windowTokens of windows) {
    const windowStats = buildFeatureStats(windowTokens, cfg)
    const windowHash = simhashFromFeatureWeights(
      finalizeFeatureWeights(windowStats, cfg.tfWeightCap),
      cfg.bitLength
    )
    for (let bitIndex = 0; bitIndex < cfg.bitLength; bitIndex++) {
      windowVotes[bitIndex] += getBit(bitIndex, windowHash) === 1 ? 1 : -1
    }
  }

  const finalHash = new Uint8Array(cfg.bitLength / 8)
  for (let bitIndex = 0; bitIndex < cfg.bitLength; bitIndex++) {
    const byteIndex = Math.floor(bitIndex / 8)
    const offset = bitIndex % 8
    if (windowVotes[bitIndex] > 0 || (windowVotes[bitIndex] === 0 && getBit(bitIndex, baseHash) === 1)) {
      finalHash[byteIndex] |= 1 << offset
    }
  }

  return buildHashResult(finalHash)
}

/**
   Equality-first profile for exact-tag querying:
   - aggressive canonicalization + stemming + stopword filtering
   - coarse token shingle sketch (bucketed minimum hashes)
   - heavy quantization so light edits are more likely to map to the same exact hash
 */
export function simhashEquality(
  text: string,
  params: Partial<EqualitySimhashParams> = {}
): SimhashResult {
  const cfg: EqualitySimhashParams = { ...EQUALITY_SIMHASH_DEFAULTS, ...params }
  const tokens = tokenizeForEquality(text, cfg.minTokenLength)

  if (tokens.length === 0) {
    return hashStringToSimhashResult(`simhash-equality-v2|empty|${canonicalizeTextForEquality(text)}`, cfg.bitLength)
  }

  const shingles = buildEqualityShingles(tokens, cfg.shingleSize)
  const encoder = new TextEncoder()
  const bucketMins: Array<string | null> = Array(cfg.bucketCount).fill(null)

  for (const shingle of shingles) {
    const hashBytes = sha256(encoder.encode(`eqs:${shingle}`))
    const hashHex = bytesToHex(hashBytes)
    const bucket = hashBytes[0] % cfg.bucketCount
    const current = bucketMins[bucket]
    if (current === null || hashHex < current) {
      bucketMins[bucket] = hashHex
    }
  }

  const descriptor = bucketMins
    .map((hashHex, index) =>
      hashHex === null ? `b${index}:x` : `b${index}:${hashHex.slice(0, cfg.keptHexCharsPerBucket)}`
    )
    .join('|')

  return hashStringToSimhashResult(
    `simhash-equality-v2|n=${cfg.shingleSize}|b=${cfg.bucketCount}|k=${cfg.keptHexCharsPerBucket}|m=${cfg.minTokenLength}|${descriptor}`,
    cfg.bitLength
  )
}

function canonicalizeText(input: string): string {
  return input
    .normalize('NFC')
    .toLowerCase()
    .replace(/\r\n?/g, '\n')
    .replace(/https?:\/\/\S+/giu, ' <url> ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function tokenize(input: string): string[] {
  const tokens = input.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)
  return tokens ?? []
}

function canonicalizeTextForEquality(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/\r\n?/g, '\n')
    .replace(/https?:\/\/\S+/giu, ' url ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/[\p{N}]+/gu, ' num ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function tokenizeForEquality(input: string, minTokenLength: number): string[] {
  const canonical = canonicalizeTextForEquality(input)
  const rawTokens = canonical.match(/[\p{L}\p{N}]+/gu) ?? []
  const normalized = rawTokens.map(stemEqualityToken)
  const filtered = normalized.filter((token) => token.length >= minTokenLength && !EQUALITY_STOPWORDS.has(token))
  if (filtered.length > 0) {
    return filtered
  }
  return normalized.filter((token) => token.length > 0)
}

function stemEqualityToken(token: string): string {
  if (token.length > 5 && token.endsWith('ing')) {
    return token.slice(0, -3)
  }
  if (token.length > 4 && token.endsWith('ed')) {
    return token.slice(0, -2)
  }
  if (token.length > 4 && token.endsWith('es')) {
    return token.slice(0, -2)
  }
  if (token.length > 3 && token.endsWith('s')) {
    return token.slice(0, -1)
  }
  return token
}

function buildEqualityShingles(tokens: string[], shingleSize: number): string[] {
  if (tokens.length === 0) {
    return []
  }

  if (tokens.length < shingleSize) {
    return [tokens.join(' ')]
  }

  const shingles: string[] = []
  for (let i = 0; i <= tokens.length - shingleSize; i++) {
    shingles.push(tokens.slice(i, i + shingleSize).join(' '))
  }
  return shingles
}

function buildFeatureStats(tokens: string[], cfg: HardenedSimhashParams): Map<string, FeatureStats> {
  const features = new Map<string, FeatureStats>()
  addTokenShingles(features, tokens, 1, cfg.tokenUnigramWeight)
  addTokenShingles(features, tokens, 2, cfg.tokenBigramWeight)
  addTokenShingles(features, tokens, 3, cfg.tokenTrigramWeight)

  const charSource = tokens.join(' ')
  const chars = Array.from(charSource)
  if (chars.length >= cfg.charShingleSize) {
    for (let i = 0; i <= chars.length - cfg.charShingleSize; i++) {
      const shingle = chars.slice(i, i + cfg.charShingleSize).join('')
      addFeature(features, `c:${shingle}`, cfg.charShingleWeight)
    }
  }

  return features
}

function addTokenShingles(
  features: Map<string, FeatureStats>,
  tokens: string[],
  shingleSize: number,
  baseWeight: number
): void {
  if (baseWeight <= 0 || tokens.length < shingleSize) {
    return
  }
  for (let i = 0; i <= tokens.length - shingleSize; i++) {
    const shingle = tokens.slice(i, i + shingleSize).join(' ')
    addFeature(features, `t${shingleSize}:${shingle}`, baseWeight)
  }
}

function buildShortTextFeatureStats(text: string): Map<string, FeatureStats> {
  const features = new Map<string, FeatureStats>()
  const chars = Array.from(text)
  addFeature(features, `s:${text}`, 2)

  for (let n = 2; n <= 3; n++) {
    if (chars.length < n) {
      continue
    }
    for (let i = 0; i <= chars.length - n; i++) {
      const shingle = chars.slice(i, i + n).join('')
      addFeature(features, `sc${n}:${shingle}`, 1)
    }
  }

  return features
}

function addFeature(features: Map<string, FeatureStats>, feature: string, baseWeight: number): void {
  const existing = features.get(feature)
  if (existing) {
    existing.count += 1
    return
  }
  features.set(feature, { count: 1, baseWeight })
}

function finalizeFeatureWeights(
  featureStats: Map<string, FeatureStats>,
  tfWeightCap: number
): Array<[string, number]> {
  const weightedFeatures: Array<[string, number]> = []
  for (const [feature, stats] of featureStats.entries()) {
    const weight = Math.min(tfWeightCap, (1 + Math.log(stats.count)) * stats.baseWeight)
    weightedFeatures.push([feature, weight])
  }
  return weightedFeatures
}

function simhashFromFeatureWeights(
  weightedFeatures: Array<[string, number]>,
  bitLength: number
): Uint8Array {
  const byteLength = bitLength / 8
  const featureHashSum: number[] = Array(bitLength).fill(0)
  const encoder = new TextEncoder()

  for (const [feature, weight] of weightedFeatures) {
    const featureHash = sha256(encoder.encode(feature))
    for (let bitIndex = 0; bitIndex < bitLength; bitIndex++) {
      featureHashSum[bitIndex] += getBit(bitIndex, featureHash) === 1 ? weight : -weight
    }
  }

  const similarityHash = new Uint8Array(byteLength)
  for (let bitIndex = 0; bitIndex < bitLength; bitIndex++) {
    if (featureHashSum[bitIndex] > 0) {
      const byteIndex = Math.floor(bitIndex / 8)
      const offset = bitIndex % 8
      similarityHash[byteIndex] |= 1 << offset
    }
  }

  return similarityHash
}

function buildTokenWindows(tokens: string[], size: number, step: number): string[][] {
  const windows: string[][] = []
  const starts: number[] = []

  for (let start = 0; start + size <= tokens.length; start += step) {
    windows.push(tokens.slice(start, start + size))
    starts.push(start)
  }

  const lastStart = Math.max(0, tokens.length - size)
  if (starts[starts.length - 1] !== lastStart) {
    windows.push(tokens.slice(lastStart))
  }

  return windows
}

function hashStringToSimhashResult(value: string, bitLength: number): SimhashResult {
  const encoder = new TextEncoder()
  const digest = sha256(encoder.encode(value))
  const byteLength = bitLength / 8
  const bin = digest.length === byteLength ? digest : digest.slice(0, byteLength)
  return buildHashResult(bin)
}

function buildHashResult(bin: Uint8Array): SimhashResult {
  return {
    bin,
    hex: bytesToHex(bin),
  }
}

function getBit(bitIndex: number, binarray: Uint8Array) {
  const arrayIndex = Math.floor(bitIndex / 8)
  const bitPosition = bitIndex % 8
  return (binarray[arrayIndex] >> bitPosition) & 1
}

function extractFeatures(input: string): string[] {
  // Extract shingles from input. Also known as the feature vector.
  const shingles: string[] = []
  for (let i = 0; i < input.length - 1; i++) {
    const char1 = input[i]
    const char2 = input[i + 1]
    const shingle = `${char1}${char2}`
    shingles.push(shingle)
  }
  return shingles
}

export function hammingDistance(hash1: Uint8Array, hash2: Uint8Array): number {
  let distance = 0
  for (let i = 0; i < hash1.length; i++) {
    const xor = hash1[i] ^ hash2[i]
    // Count bits set in xor (Brian Kernighan's algorithm)
    let count = 0
    let v = xor
    while (v) {
      v &= v - 1
      count++
    }
    distance += count
  }
  return distance
}
