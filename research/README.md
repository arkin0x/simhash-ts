# research/

Opt-in maintainer tools for characterizing the equality fingerprints against
large, real-world corpora. **None of this is part of `npm test` or CI.** It is
statistical, it depends on the network and on [`nak`](https://github.com/fiatjaf/nak),
and a freshly pulled corpus is different every run. That is the right tradeoff
for a research study and the wrong one for a test, so it lives here, separately.

Determinism lives elsewhere: exact-output conformance is locked by
`vectors/equality-vectors.json` (asserted in `src/__tests__/vectors.test.ts`),
and the false-positive regression guard is `src/__tests__/false-positives.test.ts`
over the `false-positive-controls` family in `benchmark/corpus.json`.

## What it is for

Use this before shipping a **new or retuned** equality variant, to measure on
real content what unit tests cannot: the false-positive rate against unrelated
documents, near-duplicate retention, and how those trade off across candidate
parameters. This is exactly how `minhash-equality-v1` was chosen over the
defective 2-bucket `simhash-equality-v2` (see `kb-private` ADR-005): the 8-bucket,
low-order-hex parameters won a sweep run by this tool.

## Usage

```bash
npm run build                                   # collision-study.js reads ../dist
research/pull-corpus.sh research/articles.jsonl 30023 12   # long-form articles
node research/collision-study.js research/articles.jsonl --examples 3
```

`pull-corpus.sh [outfile] [kind] [pages]` paginates a corpus from public relays
into one-object-per-line JSON (`{"c": "..."}`). Use kind `30023` for long-form
articles (where the v2 defect lived) or kind `1` for short notes.

`collision-study.js <corpus.jsonl> [--examples N]`:

- **self-validates** the internal reimplementation against the real library
  (partition-identical) before trusting any sweep row;
- reports, for the shipped `simhash-equality-v2` and `minhash-equality-v1` plus a
  bucket-count sweep: distinct-fingerprint %, colliding pairs, false positives
  (token-Jaccard < 0.2), and near-duplicate matches (Jaccard > 0.8);
- with `--examples N`, prints unrelated document pairs that share a legacy v2
  fingerprint and separate under v1.

Pulled `*.jsonl` corpora are gitignored; do not commit them.
