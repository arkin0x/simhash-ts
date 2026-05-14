# simhash-ts
A TypeScript implementation of SimHash variants for near-duplicate detection and exact-match workflows.

## Hashing methods
### `simhash(text)`
- Baseline/original implementation.
- Uses character bigram features from raw text.
- Best when you want a simple classic SimHash baseline.

### `simhashHardened(text, params?)`
- Distance-oriented profile for better robustness than baseline.
- Adds deterministic canonicalization, mixed token/character features, TF capping, and optional window voting.
- Best when you still care about Hamming distance behavior and nearest-neighbor style similarity.

### `simhashEquality(text, params?)`
- Equality-oriented profile designed for exact tag matching.
- Uses aggressive canonicalization + stemming + stopword filtering, then bucketed min-hash style sketching.
- Best when your query system can only do exact hash equality and not distance thresholds.
### Equality profile note
- Current default profile is `simhash-equality-v2`.
- Default parameters: `shingleSize=1`, `bucketCount=2`, `keptHexCharsPerBucket=3`, `minTokenLength=4`.
- Descriptor payload includes `n`, `b`, `k`, and `m` so independent implementations can produce the same `X` value deterministically.

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
