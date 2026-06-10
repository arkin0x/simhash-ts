import { describe, test, expect } from '@jest/globals'
import { simhash, simhashHardened, simhashEquality, minhashEquality, hammingDistance } from '../simhash'

describe('simhash', () => {
  test('explores how word-level changes affect simhash', () => {
    const baseText = 'the quick brown fox jumps over the lazy dog'.repeat(8);
    const results = [];
    
    // Test cases with increasing levels of word changes
    const testCases = [
      {
        desc: '1 word changed',
        text: baseText.replace('fox', 'cat')
      },
      {
        desc: '2 words changed',
        text: baseText.replace('fox', 'cat').replace('dog', 'rabbit')
      },
      {
        desc: '4 words changed',
        text: baseText.replace('fox', 'cat')
                     .replace('dog', 'rabbit')
                     .replace('quick', 'slow')
                     .replace('lazy', 'active')
      },
      {
        desc: '8 words changed (different words each time)',
        text: 'a quick red fox runs past the busy cat'.repeat(8)
      }
    ];
    
    for (const testCase of testCases) {
      const hash1 = simhash(baseText);
      const hash2 = simhash(testCase.text);
      const distance = hammingDistance(hash1.bin, hash2.bin);
      
      // Calculate what percentage of words were changed
      const baseWords = baseText.split(' ').length;
      const diffWords = baseText.split(' ')
        .filter((w, i) => w !== testCase.text.split(' ')[i])
        .length;
      const diffPercent = (diffWords / baseWords * 100).toFixed(2);
      
      const result = {
        desc: testCase.desc,
        diffWords,
        diffPercent,
        distance,
        hashesEqual: hash1.hex === hash2.hex
      };
      results.push(result);
      
      process.stdout.write(`\n${testCase.desc} (${diffPercent}% words different):\n`);
      process.stdout.write(`Base text preview: ${baseText.slice(0, 50)}...\n`);
      process.stdout.write(`Modified text preview: ${testCase.text.slice(0, 50)}...\n`);
      process.stdout.write(`Hash 1: ${hash1.hex}\n`);
      process.stdout.write(`Hash 2: ${hash2.hex}\n`);
      process.stdout.write(`Hamming distance: ${distance}\n`);
    }
    
    // Find smallest change that caused hash difference
    const firstDiff = results.find(r => !r.hashesEqual);
    if (firstDiff) {
      process.stdout.write(`\nSmallest change that caused hash difference: ${firstDiff.desc} (${firstDiff.diffPercent}% words)\n`);
    }
    
    // We expect word-level changes to affect the hash
    expect(results.some(r => !r.hashesEqual)).toBe(true);
  });
  test('generates consistent hashes for identical inputs', () => {
    const text = 'The quick brown fox jumps over the lazy dog'
    const hash1 = simhash(text)
    const hash2 = simhash(text)

    process.stdout.write('\nIdentical inputs test:\n')
    process.stdout.write(`Input text: ${text}\n`)
    process.stdout.write(`Hash 1: ${hash1.hex}\n`)
    process.stdout.write(`Hash 2: ${hash2.hex}\n`)
    process.stdout.write(`Hamming distance: ${hammingDistance(hash1.bin, hash2.bin)}\n`)

    expect(hash1.hex).toBe(hash2.hex)
    expect(hammingDistance(hash1.bin, hash2.bin)).toBe(0)
  })

  test('generates different hashes for different inputs', () => {
    const text1 = 'The quick brown fox jumps over the lazy dog'
    const text2 = 'The quick brown cat jumps over the lazy dog'
    const hash1 = simhash(text1)
    const hash2 = simhash(text2)
    const distance = hammingDistance(hash1.bin, hash2.bin)

    process.stdout.write('\nDifferent inputs test:\n')
    process.stdout.write(`Text 1: ${text1}\n`)
    process.stdout.write(`Text 2: ${text2}\n`)
    process.stdout.write(`Hash 1: ${hash1.hex}\n`)
    process.stdout.write(`Hash 2: ${hash2.hex}\n`)
    process.stdout.write(`Hamming distance: ${distance}\n`)

    expect(hash1.hex).not.toBe(hash2.hex)
    expect(distance).toBeGreaterThan(0)
  })

  test('similar texts have closer hamming distances than dissimilar texts', () => {
    const text1 = 'The quick brown fox jumps over the lazy dog'
    const text2 = 'The quick brown fox jumps over the lazy cat' // Small change
    const text3 = 'The slow green turtle crawls under the active rabbit' // Very different

    const hash1 = simhash(text1)
    const hash2 = simhash(text2)
    const hash3 = simhash(text3)

    const distance12 = hammingDistance(hash1.bin, hash2.bin)
    const distance13 = hammingDistance(hash1.bin, hash3.bin)

    process.stdout.write('\nSimilarity comparison test:\n')
    process.stdout.write(`Text 1: ${text1}\n`)
    process.stdout.write(`Text 2: ${text2}\n`)
    process.stdout.write(`Text 3: ${text3}\n`)
    process.stdout.write(`Hash 1: ${hash1.hex}\n`)
    process.stdout.write(`Hash 2: ${hash2.hex}\n`)
    process.stdout.write(`Hash 3: ${hash3.hex}\n`)
    process.stdout.write(`Distance between similar texts (1-2): ${distance12}\n`)
    process.stdout.write(`Distance between dissimilar texts (1-3): ${distance13}\n`)

    expect(distance12).toBeLessThan(distance13)
  })

  test('handles empty string input', () => {
    const hash = simhash('')

    process.stdout.write('\nEmpty string test:\n')
    process.stdout.write(`Empty string hash: ${hash.hex}\n`)
    process.stdout.write(`Binary length: ${hash.bin.length}\n`)

    expect(hash.hex).toBeTruthy()
    expect(hash.bin instanceof Uint8Array).toBe(true)
    expect(hash.bin.length).toBe(32) // 256 bits = 32 bytes
  })

  test('handles unicode characters', () => {
    const text1 = '👋 Hello, 世界!'
    const text2 = '👋 Hello, 世界!' // Identical
    const hash1 = simhash(text1)
    const hash2 = simhash(text2)

    process.stdout.write('\nUnicode test:\n')
    process.stdout.write(`Text: ${text1}\n`)
    process.stdout.write(`Hash 1: ${hash1.hex}\n`)
    process.stdout.write(`Hash 2: ${hash2.hex}\n`)
    process.stdout.write(`Hamming distance: ${hammingDistance(hash1.bin, hash2.bin)}\n`)

    expect(hash1.hex).toBe(hash2.hex)
    expect(hammingDistance(hash1.bin, hash2.bin)).toBe(0)
  })
})

describe('simhashHardened', () => {
  test('normalizes canonical unicode equivalents to the same hash', () => {
    const composed = 'café'
    const decomposed = 'cafe\u0301'
    const hash1 = simhashHardened(composed)
    const hash2 = simhashHardened(decomposed)

    expect(hash1.hex).toBe(hash2.hex)
    expect(hammingDistance(hash1.bin, hash2.bin)).toBe(0)
  })

  test('normalizes case and punctuation noise', () => {
    const text1 = 'Hello, WORLD! This is Nostr.'
    const text2 = 'hello world this is nostr'
    const hash1 = simhashHardened(text1)
    const hash2 = simhashHardened(text2)

    expect(hash1.hex).toBe(hash2.hex)
  })

  test('does not collapse short inputs into the same hash', () => {
    const emptyHash = simhashHardened('')
    const aHash = simhashHardened('a')
    const bHash = simhashHardened('b')

    expect(emptyHash.hex).not.toBe(aHash.hex)
    expect(aHash.hex).not.toBe(bHash.hex)
    expect(emptyHash.bin.length).toBe(32)
  })

  test('is less sensitive to appended boilerplate than legacy simhash', () => {
    const base = (
      'The quick brown fox jumps over the lazy dog while the curious raven watches from above. '
    ).repeat(20)
    const padded = `${base} ${(
      'Subscribe now click here breaking update sponsored content repeat repeat repeat. '
    ).repeat(20)}`

    const legacyDistance = hammingDistance(simhash(base).bin, simhash(padded).bin)
    const hardenedDistance = hammingDistance(simhashHardened(base).bin, simhashHardened(padded).bin)

    expect(hardenedDistance).toBeLessThan(legacyDistance)
  })
})

describe('simhashEquality', () => {
  const articleOriginal =
    'The night market opened at dusk under red lanterns, and every vendor called out prices in a different rhythm. ' +
    'I walked the narrow path between tea stalls and repair benches, collecting stories as much as food. ' +
    'A mechanic with silver gloves said he could rebuild any drone if given enough time and silence. ' +
    'A bookseller traded me a thin atlas for a promise: return when I had mapped one road that did not yet exist.'

  const articleLightEdit =
    'The night market opened at dusk beneath red lanterns, and each vendor called out prices in a different rhythm. ' +
    'I walked the narrow lane between tea stalls and repair benches, collecting stories as much as food. ' +
    'A mechanic with silver gloves said he could rebuild any drone if given enough time and quiet. ' +
    'A bookseller traded me a thin atlas for one promise: return when I had mapped one road that did not yet exist.'

  const articlePadding =
    `${articleOriginal} ` +
    'Breaking update subscribe now daily bonus credits click here to follow the latest signal and trending relay bulletin. ' +
    'Breaking update subscribe now daily bonus credits click here to follow the latest signal and trending relay bulletin.'

  const articleUnrelated =
    'Orbital weather arrays recalibrated at noon after a week of magnetosphere turbulence. ' +
    'Engineers replaced two damaged sensor packs and rerouted power through a backup lattice to stabilize data collection. ' +
    'The operations log notes a temporary bandwidth loss during the handoff, but no permanent gaps in telemetry.'

  test('maps light edits and boilerplate padding to the same exact hash', () => {
    const base = simhashEquality(articleOriginal)
    const edited = simhashEquality(articleLightEdit)
    const padded = simhashEquality(articlePadding)

    expect(base.hex).toBe(edited.hex)
    expect(base.hex).toBe(padded.hex)
  })

  test('keeps unrelated content on a different exact hash', () => {
    const base = simhashEquality(articleOriginal)
    const unrelated = simhashEquality(articleUnrelated)

    expect(base.hex).not.toBe(unrelated.hex)
  })

  test('normalizes unicode/case/punctuation for exact equality', () => {
    const a = simhashEquality('CAFÉ -- Hello, WORLD!!!')
    const b = simhashEquality('cafe hello world')

    expect(a.hex).toBe(b.hex)
  })
})

describe('minhashEquality', () => {
  const articleOriginal =
    'The night market opened at dusk under red lanterns, and every vendor called out prices in a different rhythm. ' +
    'I walked the narrow path between tea stalls and repair benches, collecting stories as much as food. ' +
    'A mechanic with silver gloves said he could rebuild any drone if given enough time and silence. ' +
    'A bookseller traded me a thin atlas for a promise: return when I had mapped one road that did not yet exist.'

  const articleUnrelated =
    'Orbital weather arrays recalibrated at noon after a week of magnetosphere turbulence. ' +
    'Engineers replaced two damaged sensor packs and rerouted power through a backup lattice to stabilize data collection. ' +
    'The operations log notes a temporary bandwidth loss during the handoff, but no permanent gaps in telemetry.'

  // A longer, vocabulary-rich article; with 8 bins minhash-equality needs enough
  // distinct tokens for the bucketed minimums to be stable under small edits.
  const longArticle =
    'Researchers studying coastal erosion published a detailed survey describing how shifting sediment patterns reshape estuaries over decades. ' +
    'Their fieldwork combined satellite imagery with sediment cores collected from a dozen river mouths along the northern shoreline. ' +
    'The team argued that traditional models underestimate the influence of seasonal storms, which redistribute sand far more aggressively than gradual tidal action. ' +
    'By tracking individual grains tagged with luminescent markers, they reconstructed transport pathways that previous studies had missed entirely. ' +
    'One surprising finding involved a submerged ridge that funnels currents toward a fragile marsh, accelerating its retreat. ' +
    'The authors recommend rebuilding wetland buffers and restoring oyster reefs to dissipate wave energy before it reaches vulnerable banks. ' +
    'Local fishermen, interviewed throughout the project, confirmed that familiar channels have migrated noticeably within a single generation.'

  test('is deterministic for identical inputs', () => {
    expect(minhashEquality(articleOriginal).hex).toBe(minhashEquality(articleOriginal).hex)
  })

  test('retains edit durability on long articles (most single-word edits preserve the hash)', () => {
    // minhash-equality (8 bins) is more specific than the legacy 2-bin algorithm
    // and therefore less edit-durable on short text, but on a vocabulary-rich
    // article the majority of single-word deletions still map to the same exact
    // hash. This is the FP/durability dial documented in kb-private ADR-005.
    const baseHex = minhashEquality(longArticle).hex
    const words = longArticle.split(/\s+/)
    let preserved = 0
    let total = 0
    for (let i = 0; i < words.length; i += 2) {
      const variant = words.slice(0, i).concat(words.slice(i + 1)).join(' ')
      if (minhashEquality(variant).hex === baseHex) preserved++
      total++
    }
    expect(preserved / total).toBeGreaterThan(0.6)
  })

  test('keeps unrelated content on a different exact hash', () => {
    expect(minhashEquality(articleOriginal).hex).not.toBe(minhashEquality(articleUnrelated).hex)
  })

  test('normalizes unicode/case/punctuation for exact equality', () => {
    expect(minhashEquality('CAFÉ -- Hello, WORLD!!!').hex).toBe(minhashEquality('cafe hello world').hex)
  })

  test('is not bit-for-bit compatible with v2 (distinct version)', () => {
    expect(minhashEquality(articleOriginal).hex).not.toBe(simhashEquality(articleOriginal).hex)
  })

  test('produces a 256-bit result', () => {
    const h = minhashEquality(articleOriginal)
    expect(h.bin.length).toBe(32)
    expect(h.hex).toHaveLength(64)
  })

  test('handles degenerate input via the empty fallback', () => {
    // punctuation-only inputs canonicalize to "" and intentionally share the
    // empty-path hash; a single short token is distinct from that empty hash.
    const punctA = minhashEquality('!!! ')
    const punctB = minhashEquality('   ###')
    const oneToken = minhashEquality('gm')
    expect(punctA.bin.length).toBe(32)
    expect(punctA.hex).toBe(punctB.hex)
    expect(oneToken.hex).not.toBe(punctA.hex)
  })
})

describe('hammingDistance', () => {
  test('returns 0 for identical hashes', () => {
    const text = 'test string'
    const hash = simhash(text)

    process.stdout.write('\nIdentical hash distance test:\n')
    process.stdout.write(`Text: ${text}\n`)
    process.stdout.write(`Hash: ${hash.hex}\n`)
    process.stdout.write(`Distance with itself: ${hammingDistance(hash.bin, hash.bin)}\n`)

    expect(hammingDistance(hash.bin, hash.bin)).toBe(0)
  })

  test('returns same distance regardless of order', () => {
    const text1 = 'first string'
    const text2 = 'second string'
    const hash1 = simhash(text1)
    const hash2 = simhash(text2)

    const distance1 = hammingDistance(hash1.bin, hash2.bin)
    const distance2 = hammingDistance(hash2.bin, hash1.bin)

    process.stdout.write('\nSymmetric distance test:\n')
    process.stdout.write(`Text 1: ${text1}\n`)
    process.stdout.write(`Text 2: ${text2}\n`)
    process.stdout.write(`Hash 1: ${hash1.hex}\n`)
    process.stdout.write(`Hash 2: ${hash2.hex}\n`)
    process.stdout.write(`Distance 1->2: ${distance1}\n`)
    process.stdout.write(`Distance 2->1: ${distance2}\n`)

    expect(distance1).toBe(distance2)
  })
})
