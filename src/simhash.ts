import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'

/**
   "SimHash is a locality-sensitive hashing algorithm that maps similar inputs to similar hash values. It operates on inputs that can be represented as a vector of numerical features. The algorithm computes a 256-bit hash value for each input by performing the following steps:

   1. Compute the feature vector of the input.
   2. For each feature, compute its hash value using a standard hash function (e.g., SHA-256).
   3. For each bit position in the resulting 256-bit hash, sum the hash values of all the features whose corresponding bit is set in that position, and subtract the hash values of all the features whose corresponding bit is not set in that position.
   4. Set the bit to 1 if the resulting sum is positive, and 0 otherwise.

   The resulting hash value is a 256-bit binary string that encodes the similarity of the input to other inputs that have been hashed using the same algorithm. Inputs that are more similar to each other will have hash values that differ by fewer bits than inputs that are less similar."
 */

export function simhash(text: string) {
  const features: string[] = extractFeatures(text)

  const featureHashes: Uint8Array[] = features.map((v) => sha256(v))

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
