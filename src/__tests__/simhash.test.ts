import { describe, test, expect } from '@jest/globals'
import { simhash, hammingDistance } from '../simhash'

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
