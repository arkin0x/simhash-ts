import { describe, test, expect } from '@jest/globals'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { simhashEquality, minhashEquality } from '../simhash'

// Frozen conformance vectors. Regenerate intentionally with
// `node scripts/generate-vectors.js` only after a deliberate algorithm change.
type Vector = { name: string; input: string; hex: string }
const vectors = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'vectors', 'equality-vectors.json'), 'utf8')
) as Record<string, Vector[]>

const byName = (algo: string, name: string) => {
  const v = vectors[algo].find((x) => x.name === name)
  if (!v) throw new Error(`missing vector: ${algo} / ${name}`)
  return v
}

describe('conformance vectors', () => {
  test('minhash-equality-v1 reproduces every frozen vector', () => {
    for (const v of vectors['minhash-equality-v1']) {
      expect({ name: v.name, hex: minhashEquality(v.input).hex }).toEqual({ name: v.name, hex: v.hex })
    }
  })

  test('simhash-equality-v2 (legacy, frozen) reproduces every frozen vector', () => {
    for (const v of vectors['simhash-equality-v2']) {
      expect({ name: v.name, hex: simhashEquality(v.input).hex }).toEqual({ name: v.name, hex: v.hex })
    }
  })

  test('the two algorithms never share a fingerprint for the same input', () => {
    for (const v of vectors['minhash-equality-v1']) {
      expect(v.hex).not.toBe(byName('simhash-equality-v2', v.name).hex)
    }
  })

  // Property checks the vectors encode, asserted explicitly for clarity.
  test('cosmetic variant (case/punctuation) maps to the same v1 fingerprint', () => {
    const a = byName('minhash-equality-v1', 'longform article paragraph').hex
    const b = byName('minhash-equality-v1', 'cosmetic variant of the longform paragraph (case/punctuation only, must equal)').hex
    expect(a).toBe(b)
  })

  test('unrelated content maps to a different v1 fingerprint', () => {
    const a = byName('minhash-equality-v1', 'longform article paragraph').hex
    const c = byName('minhash-equality-v1', 'unrelated longform paragraph').hex
    expect(a).not.toBe(c)
  })

  test('case and diacritics are normalized under v1', () => {
    expect(byName('minhash-equality-v1', 'single short token (filter fallback)').hex)
      .toBe(byName('minhash-equality-v1', 'single short token, different case (equals gm)').hex)
    expect(byName('minhash-equality-v1', 'diacritics fold to base letters').hex)
      .toBe(byName('minhash-equality-v1', 'diacritics stripped (equals the accented form)').hex)
  })
})
