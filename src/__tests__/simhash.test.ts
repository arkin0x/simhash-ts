import { describe, test, expect } from '@jest/globals'
import { simhash, hammingDistance } from '../simhash'

describe('simhash', () => {
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
