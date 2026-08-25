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

## M3a — Semantic projection contract

M3a establishes a renderer-neutral parity gate before browser rendering begins.

- `project()` returns the versioned `ProjectionManifestV2`; the legacy `ProjectionManifest` construction shape remains source-compatible.
- Three.js payload, SVG projection and HTML fallback expose identical sorted semantic node/edge identifiers.
- A separate `focusOrderNodeIds` contract makes keyboard and screen-reader traversal deterministic even if Scene IR arrays arrive in a different order.
- HTML navigation links resolve to balanced node detail targets and relation endpoints remain traversable.
- SVG nodes expose ordered list semantics, position-aware accessible labels and keyboard focus without an ancestor `img` role hiding descendants from the accessibility tree.
- Duplicate node identifiers and invalid or duplicate focus orders fail closed before any projection is emitted.

## M3b — Injected browser preparation/mount boundary

M3b adds a dependency-free boundary between projection manifests and an injected browser host.

- HTML/SVG content is prepared off-target through an injected DOM port; Three JSON is parsed and validated before an injected Three preparation port is called.
- Schema, sorted/unique semantic membership, focus-order parity and prepared metadata are validated before target mutation.
- Pre-commit failures do not invoke the target. After all checks pass, the adapter makes exactly one `replaceChildren()` commit attempt.
- If the injected target mutates and then throws, rollback is outside the adapter contract.
- Port-produced root nodes remain a trusted-port boundary; their semantic metadata is runtime-validated.

## M3c–M3e — Concrete parsing and trusted semantic parity

- An allow-listed DOM adapter parses generated HTML/SVG into detached content and rejects active or unexpected structure before mount.
- A real headless Chromium smoke covers parser behavior, hostile-label escaping, namespace correctness, semantic parity and exact mutation counts.
- Manifest and prepared node/edge descriptors are independently reconstructed and compared before target mutation.

## M3f — Bounded Three.js/WebGL vertical slice

M3f adds an exact-pinned `three@0.185.1` adapter without claiming a production renderer.

- Canonical Three DTOs are validated and prepared off-target into a detached scene.
- A deterministic `320×240`, one-frame WebGL render preserves semantic node/edge descriptors and focus order.
- GPU geometries, materials and renderer resources are disposed on covered success and preparation-failure paths; disposal-throw resilience is not yet claimed.
- The canvas is `aria-hidden="true"`; accessible semantics remain the responsibility of the equivalent HTML/SVG surfaces.
- A real Chromium/SwiftShader smoke verifies `2` nodes, `1` edge, WebGL context health, `NO_ERROR`, forced-renderer rejection and `0` target mounts on preparation failure.

This is intentionally not a continuous render loop, camera controls, picking, responsive application shell, cross-browser/assistive-technology conformance, or deployment.

## Verify

Requires Node.js 22 or newer. The dependency graph is locked.

```sh
npm ci --ignore-scripts
npm run verify
npm run test:browser-smoke
```

The standard verification gate includes type checking, build, M0/M1/M2 domain tests, materializer safety tests, fixture integrity, environment determinism, legacy isolation, renderer regressions, and real-Chromium DOM/WebGL smoke tests.

A production interactive WebGL renderer, scraping, databases, user accounts, and LLM/RAG integration are not yet implemented.
