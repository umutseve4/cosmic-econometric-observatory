# Cosmic Econometric Observatory

A deterministic, provenance-first world engine that compiles versioned academic catalogs into a knowledge graph, renderer-neutral Scene IR, and accessible projections.

This is a clean successor project. [`umutseve4/eko-rasathane`](https://github.com/umutseve4/eko-rasathane) remains an immutable legacy/reference repository; its application code and history are never imported or executed here.

## Architecture

`source snapshot → explicit assertions/anomalies → curriculum compiler → stable anchors/routes → domain graph → Scene IR → projections`

| Entity | Meaning | Must not contain |
|---|---|---|
| `Course` | Persistent canonical academic entity | semester, instructor, room |
| `CurriculumRelation` | A course's placement/status/credits in one curriculum version | section, instructor, schedule |
| `Offering` | A time-bound delivery of a course | copied canonical title/credits |

Human-facing course codes are assignments, never identity. Raw source values are never silently corrected. Every accepted or rejected assertion remains traceable to a content-addressed snapshot.

## M1 — Source-backed BUÜ snapshot

M1 pins the 2025–2026 BUÜ Economics curriculum and timetable at legacy commit `db8d52f0b29d712c34e8b7487e2299ce9f75c266`.

- `144` curriculum relations: `41` required and `103` elective.
- `164` source offerings: `83` spring, `81` fall, `108` first education, `56` second education.
- Reconciliation: `129` mapped, `15` mapped-with-anomaly, `0` ambiguous, `20` unmatched.
- Unmatched offerings receive timetable-derived `Course` identities; no fake curriculum relation is invented.
- Duplicate codes, suspicious spellings, the `241` versus `240` ECTS conflict, and printed-code mismatches remain explicit anomalies.
- Fixture lengths and SHA-256 values are checked against the committed manifest.

## M2a — Deterministic curriculum graph core

M2a compiles the source-backed institution, Econometrics program, 2025–2026 curriculum, and its curriculum courses into versioned artifacts.

- Every `144` `CurriculumRelation` record is projected exactly once with semester, status, ECTS, optional pool, and provenance.
- Insertion-only evolution accepts a complete previous `CurriculumCompilation`; the previous graph, `AnchorManifestV1`, and `RouteManifestV1` are hash-bound and must have exact node-set parity.
- Retained anchors, slots, coordinates, and canonical `/v1/nodes/{persistent-id}` URLs remain stable. Prior course-assignment records are immutable and cumulative; aliases are derived exactly and deterministically from that cumulative assignment history.
- `RouteManifestV1` derives canonical `/v1/nodes/{persistent-id}` URLs from stable identity; course codes are aliases only.
- Input ordering and locale cannot alter canonical output.
- Duplicate/dangling identities, malformed or mixed provenance, unknown anomaly references, silent relation drift, prior-node removal, internally inconsistent predecessor state, and enforceable continuity violations are fatal. The compiler validates continuity relative to the supplied predecessor; without an external trust anchor it does not authenticate that predecessor or detect a coordinated full-bundle rewrite.
- Known offering-only anomalies remain valid snapshot evidence but are excluded from the M2a curriculum graph.
- Topics and laboratories are intentionally deferred until pinned evidence exists; renderer and deployment remain outside M2a.

See [`docs/adr/0002-m2a-curriculum-graph-core.md`](docs/adr/0002-m2a-curriculum-graph-core.md) for the exact boundary.

## Verify

Requires Node.js 22 or newer. The dependency graph is locked.

```sh
npm ci --ignore-scripts
npm run verify
```

The standard verification gate includes type checking, build, M0/M1/M2 domain tests, materializer safety tests, fixture integrity, environment determinism, and legacy-isolation tests.

A production WebGL renderer, scraping, databases, user accounts, and LLM/RAG integration are not yet implemented.
