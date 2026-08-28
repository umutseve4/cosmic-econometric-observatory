# Cosmic Econometric Observatory

The Cosmic Econometric Observatory is an evidence-first econometrics graph platform. It models curriculum skills, methods, diagnostics, and evidence as explicit graph contracts so that later visual and analytical layers can be built on stable, testable foundations.

## Current Status

This repository is intentionally under active construction. The deterministic graph core, evidence lineage, structural validation, bounded layout projection, runtime-independent renderer plan, concrete Three.js adapter, injected fallback behavior, browser smoke paths, responsive application shell, and bounded GitHub Pages production verification are implemented and tested. The full production renderer remains deferred.

### Implemented and verified

- Explicit node roles:
  - `skill`
  - `method`
  - `diagnostic`
  - `evidence`
- Explicit edge relation kinds:
  - `prerequisite`
  - `applied_in`
  - `validated_by`
  - `supported_by`
- Deterministic graph validation and canonicalization.
- Deterministic topological ordering and stable graph hashing.
- Evidence lineage checks, including orphan evidence detection.
- Bounded overview and neighborhood projection contracts.
- Deterministic path computation and accessible report generation.
- Renderer plan generation with semantic labels, roles, and stable ordering.
- Runtime-independent WebGL adapter contract for scenes, nodes, edges, picking, lifecycle, and typed initialization failure.
- Concrete Three.js adapter contract implementation with injected runtime/document dependencies and deterministic lifecycle behavior.
- Production browser bridge from DOM surfaces to the concrete Three.js adapter, including stable draw-order object mapping, fail-closed overlay picking, resize, context loss/restore, and disposal.
- Deterministic fallback orchestration for initialization failure, `webglcontextlost`, restoration failure, and disposal-safe late-event suppression.
- Real browser smoke coverage for the WebGL success path and deterministic fallback path.
- Bounded keyboard interaction over ordered canvas nodes, with focus transfer to the deterministic DOM list.
- Responsive application shell, production artifact parity, and four canonical viewport/fallback cases verified through GitHub Actions at the exact deployed source SHA.
- Canonical visual acceptance: `4/4` states, responsive acceptance: `10/10`, rubric: `40/40`.
- Deterministic visual-CI font evidence under the intentional `system-fallback` policy; issue `#36` closed by PR `#45`.
- Repository issue backlog reconciled to exactly `0` open issues after PR `#45`.
- Verified built-in reference graph:
  - 5 nodes.
  - 4 relations.
  - 3 skill layers.
  - 2 evidence nodes with 2 distinct artifact links.
- Multi-layer automated verification covering valid graphs, invalid references, duplicates, self-loops, cycles, artifact validity, stable serialization, deterministic hashes, projection semantics, adapter planning, concrete adapter lifecycle behavior, browser smoke, site verification, and production verification.

## Quick Start

### Requirements

- Node.js `>=22`

### Install

```bash
npm ci
```

### Run the default verification suite

```bash
npm test
```

The default suite remains deterministic and does not require a browser, display server, GPU, or real WebGL context.

### Run browser smoke verification

Install Google Chrome, Chrome Stable, Chromium, or Chromium Browser, then run:

```bash
npm run test:browser-smoke
```

### Run the complete verification suite

```bash
npm run verify
```

This command runs deterministic source checks and, when a supported browser binary is available, the browser smoke suite.

## Project Structure

```text
.
├── .github/
│   └── workflows/
│       └── ci.yml
├── docs/
│   ├── adr/
│   │   └── 0002-m2a-curriculum-graph-core.md
│   ├── architecture.md
│   └── invariants.md
├── modules/
│   ├── browser-dom-adapter.js
│   ├── browser-fallback-orchestrator.js
│   ├── browser-node-selection.js
│   ├── browser-renderer.js
│   ├── browser-three-adapter.js
│   ├── canonical.js
│   └── projections.js
├── scripts/
│   ├── run-browser-smoke.mjs
│   └── verify-static.mjs
├── tests/
│   ├── browser-node-selection.test.mjs
│   ├── browser-renderer.test.mjs
│   ├── browser-three-adapter.test.mjs
│   ├── canonical.test.mjs
│   ├── projections.test.mjs
│   └── reference-graph.test.mjs
├── .nvmrc
├── README.md
├── ROADMAP.md
├── app.js
├── index.html
├── package-lock.json
├── package.json
└── styles.css
```

## Evidence-First Scope

The project favors small, contract-driven increments:

1. Define semantic graph contracts.
2. Prove deterministic structural behavior.
3. Add bounded projections and accessible output.
4. Define runtime-independent renderer plans.
5. Add runtime adapters without breaking deterministic testability.
6. Integrate the real browser and WebGL path.
7. Verify bounded production artifacts and canonical live-browser cases.

This sequencing avoids hiding domain ambiguity behind visual polish or making renderer correctness depend on an unavailable local GPU stack.

## Verification Contract

The repository currently enforces:

- Node.js floor `>=22`.
- Deterministic static verification.
- Lockfile reproducibility.
- Pinned runtime dependencies.
- Offline-compatible smoke and unit tests.
- Strict graph invariants.
- Stable serialization and hash expectations.
- Explicit renderer adapter and lifecycle contracts.
- Optional real-browser success and fallback smoke verification.
- Exact-source production artifact, digest, provenance, and canonical-browser verification in the Pages workflow.

## Maturity Limits

The repository is not yet a full econometric computation engine or universally certified production renderer. It does not yet claim:

- Continuous rendering or animation.
- Camera or pointer interaction.
- Broad cross-browser or assistive-technology certification.
- Production-scale graph performance.
- Real-device WebGL validation beyond the bounded browser smoke and canonical production cases.
- Disposal paths that throw and still guarantee complete teardown.
- Continuously current public provenance availability outside the point-in-time deployment verification recorded by GitHub Actions.

The exact-merge Pages workflow for `a01ef2ef06fb820dc60c67a31beda1fb306a1bf0` passed build, deploy, and production verification, but that is point-in-time evidence rather than a claim that every later direct public provenance request must succeed.

See [`ROADMAP.md`](ROADMAP.md) for milestone history, bounded closure evidence, and deferred work.

## License

No license has been declared yet.