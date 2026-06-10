import { describe, test, expect } from '@jest/globals'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { minhashEquality } from '../simhash'

// Deterministic regression guard for the long-content false-positive defect
// fixed in minhash-equality-v1 (kb-private ADR-005). The benchmark corpus carries
// a "false-positive-controls" family of mutually unrelated texts; a correct
// equality fingerprint MUST give each a distinct hash.
type Family = { id: string; texts: { id: string; text: string }[] }
const corpus = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'benchmark', 'corpus.json'), 'utf8')
) as { families: Family[] }

const controls = corpus.families.find((f) => f.id === 'false-positive-controls')

describe('false-positive controls', () => {
  test('the control family exists and has enough unrelated texts', () => {
    expect(controls).toBeDefined()
    expect(controls!.texts.length).toBeGreaterThanOrEqual(6)
  })

  test('minhash-equality-v1 gives every unrelated control a distinct fingerprint', () => {
    const byHash = new Map<string, string[]>()
    for (const t of controls!.texts) {
      const h = minhashEquality(t.text).hex
      if (!byHash.has(h)) byHash.set(h, [])
      byHash.get(h)!.push(t.id)
    }
    const collisions = [...byHash.values()].filter((ids) => ids.length > 1)
    // Surface the offending groups in the failure message if this ever regresses.
    expect({ collisions }).toEqual({ collisions: [] })
    expect(byHash.size).toBe(controls!.texts.length)
  })
})
