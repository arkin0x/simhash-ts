# simhash-ts
A TypeScript toolkit of locality-sensitive hashing algorithms for near-duplicate detection and exact-match workflows.

> **Two different algorithm families live here.** `simhash` / `simhashHardened` are Charikar **SimHash** (sign-of-random-projections, compared by Hamming distance, approximates cosine similarity). `minhashEquality` is **MinHash**, not SimHash: it is b-bit one-permutation MinHash used as an exact-equality fingerprint (approximates Jaccard similarity). The package is named for the SimHash it ships, but pick the function by the algorithm you actually need.

## Hashing methods
### `simhash(text)`
- Baseline/original implementation.
- Uses character bigram features from raw text.
- Best when you want a simple classic SimHash baseline.

### `simhashHardened(text, params?)`
- Distance-oriented profile for better robustness than baseline.
- Adds deterministic canonicalization, mixed token/character features, TF capping, and optional window voting.
- Best when you still care about Hamming distance behavior and nearest-neighbor style similarity.

### `minhashEquality(text, params?)`  (recommended equality fingerprint)
- **This is MinHash, not SimHash.** b-bit one-permutation MinHash used as an exact-equality content fingerprint.
- Aggressive canonicalization + stemming + stopword filtering, then a bucketed-minimum (MinHash) sketch; near-identical texts collapse to the same exact hash, discoverable by an exact tag (`#X`) query.
- Wire identifier `minhash-equality-v1`. Default parameters: `shingleSize=1`, `bucketCount=8`, `keptHexCharsPerBucket=3`, `minTokenLength=4`.
- Keeps the **last** `k` hex chars of each bin minimum (the b-bit minwise rule). See kb-private ADR-005 for the collision study behind the 8-bin, low-bit choice.

### `simhashEquality(text, params?)`  (legacy, frozen)
- The original equality profile, wire identifier `simhash-equality-v2`. Despite the name it was already MinHash, not SimHash.
- **Frozen for backward compatibility; do not use for new content.** It has a long-content false-positive defect (ADR-005); `minhashEquality` is its corrected successor.
- Default parameters: `bucketCount=2`, `keptHexCharsPerBucket=3` (kept the *first* k hex), `minTokenLength=4`.

### Equality descriptor note
- The descriptor payload includes `n`, `b`, `k`, and `m` so independent implementations can produce the same `X` value deterministically.

## Install and run
### Install dependencies
`npm install`

### Build
`npm run build`

### Run unit tests
`npm test`

### Run benchmark on default corpus
`npm run benchmark`

### Run benchmark on a custom corpus file
`npm run benchmark -- path/to/corpus.json`

## Benchmark corpus format
The benchmark supports:
- Legacy shape: top-level `texts` array
- New shape: grouped `families` with expected equality pairs

Example (new shape):

```json
{
  "topNeighbors": 6,
  "families": [
    {
      "id": "my-family",
      "description": "Optional family note",
      "expectedEqualityPairs": [
        ["text-a", "text-b"]
      ],
      "texts": [
        { "id": "text-a", "text": "..." },
        { "id": "text-b", "text": "..." },
        { "id": "text-c", "text": "..." }
      ]
    }
  ]
}
```

`expectedEqualityPairs` are used for TP/FN/FP reporting under equality-mode scoring.

## Current benchmark families in `benchmark/corpus.json`
- `synthetic-article`: regression baseline
- `real-article`: populated with the provided regular-length article and variants
- `tweet-sized`: short-text stress tests
- `extra-long-article`: populated with your provided extra-long article and variants

## Recommended corpus maintenance
- Keep IDs stable over time so benchmark comparisons remain meaningful.
- For each family, include at least:
  - original
  - light edit
  - padded/noisy variant
  - unrelated control
- Update `expectedEqualityPairs` whenever you add or revise vectors.
