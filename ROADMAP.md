# Cosmic Econometric Observatory Roadmap

## Purpose

This roadmap decomposes the observatory into small, evidence-producing milestones. Each milestone must preserve existing contracts, add bounded capability, and attach exact verification evidence before the next milestone begins.

## Milestone 0 — Repository and verification baseline — `completed`

Delivered:

- Node.js `>=22` floor.
- Reproducible `npm ci` installation.
- Deterministic static verification.
- Offline-compatible test suite.
- CI workflow with pinned dependency and lockfile checks.

## Milestone 1 — Reference curriculum graph — `completed`

Delivered:

- Five-node reference graph.
- Four explicit relation kinds.
- Three skill layers.
- Two evidence nodes with two distinct artifact links.
- Stable canonical serialization and graph hashing.

## Milestone 2 — Deterministic graph and projection contracts — `completed`

### M2a — Curriculum graph core — `completed`

Delivered:

- Explicit semantic node roles.
- Explicit edge relation kinds.
- Reference validation.
- Duplicate detection.
- Self-loop rejection.
- Cycle detection.
- Artifact-link validation.
- Deterministic topological ordering.
- Stable serialization and hashing.

### M2b — Bounded projections and accessible reports — `completed`

Delivered:

- Overview projection.
- Neighborhood projection.
- Deterministic path computation.
- Accessible report generation.
- Stable ordering and provenance preservation.

## Milestone 3 — Renderer contracts and bounded browser integration — `in progress`

### M3a — Renderer plan contract — `completed`

Delivered:

- Runtime-independent scene plan.
- Stable node and edge draw order.
- Semantic labels and roles.
- Deterministic renderer metadata.

### M3b — WebGL adapter contract — `completed`

Delivered:

- Scene lifecycle contract.
- Node and edge registration.
- Picking contract.
- Resize and disposal contracts.
- Typed initialization failure.

### M3c — Concrete Three.js adapter — `completed`

Delivered:

- Injected Three.js runtime and document dependencies.
- Deterministic scene construction.
- Stable draw-order object mapping.
- Lifecycle and failure tests without a real GPU context.

### M3d — Production browser bridge — `completed`

Delivered:

- DOM-to-renderer integration.
- Fail-closed overlay picking.
- Resize handling.
- Context loss/restore handling.
- Deterministic disposal.

### M3e — Fallback orchestration — `completed`

Delivered:

- Initialization-failure fallback.
- `webglcontextlost` fallback.
- Restoration-failure fallback.
- Disposal-safe late-event suppression.

### M3f — Real browser smoke and keyboard interaction — `completed`

Delivered:

- Real-browser WebGL success smoke.
- Deterministic fallback smoke.
- Bounded ordered keyboard node selection.
- Focus transfer to deterministic DOM content.

Evidence:

- PR #23 (`ac9df1dc13adcf32d4c085344736a3cb5ca6f9cb`).
- Exact-merge CI run `33046512814`, job `98484881307`, `success`.
- Browser smoke scenarios passed `2/2`.

### M3g — Deployable static artifact — `completed`

Delivered:

- Deterministic `dist-site/` artifact containing exactly `13` approved files.
- Offline/local copies of pinned Three.js `0.185.1` runtime modules.
- Versioned deployment provenance schema `1.0.0` with source SHA, per-file SHA-256 digests, byte counts, and deterministic ordering.
- Browser smoke coverage against the built artifact.
- Two independent render-path checks for the built artifact: WebGL and forced fallback.
- GitHub Pages workflow with exact-source build, artifact upload, deployment, and post-deploy verification.

Evidence:

- PR #26.
- Merge commit `3c69f48d376384d62002a893058271a32c010852`.
- Merge CI run `33050981045`, job `98498494136`, `success`.
- Pages run `33050981016`, deployment `6117107676`, environment `github-pages`, `success`.
- Live verification marker: `LIVE_SITE_VERIFY_PASS:3c69f48d376384d62002a893058271a32c010852`.
- Artifact evidence: `13/13` files, `12/12` payload digest matches.
- Browser evidence: `2/2` render paths passed.

### M3h — Deterministic initialization-failure browser coverage — `completed`

Delivered:

- Browser smoke now proves the real initialization-failure fallback path without `force-fallback`.
- The smoke runner imports the browser entry point through controlled dynamic-import interception.
- Only `./modules/browser-three-adapter.js` is substituted; all other imports resolve normally.
- The substituted renderer throws `RendererInitializationError('webgl-unavailable', ...)`.
- Assertions prove the real DOM fallback card renders and the WebGL root stays absent.

Evidence:

- PR #30.
- Merge commit `eb86812e8599c88c92410006d468487ea733e6c1`.
- Exact-merge CI run `33058843025`, job `98522077826`, `success`.
- Browser smoke scenarios passed `3/3`.

### M3i — Bounded geometry and multi-node identity — `verified`

Delivered:

- Renderer plans carry explicit finite node positions and edge endpoints.
- Concrete Three.js construction consumes plan geometry without runtime layout decisions.
- Overlay picking preserves per-node identity across multiple selectable nodes.
- Browser success smoke proves the expected world-to-screen ordering for the two selectable skill nodes and independent selection of both.
- Browser fallback smoke preserves the readable DOM artifact.
- Exact geometry and finite-coordinate assertions exist at plan and adapter layers.
- Visual-CI font evidence is deterministic under the intentional `system-fallback` policy, with document readiness separated from requested-family availability.

Evidence:

- PR #34, merge commit `9973ba22503990e07997dac45898c4419ef1d86b`.
- Exact-merge CI run `33067537341`, job `98548652771`, `success`.
- Browser smoke scenarios passed `3/3`.
- PR #45, squash merge `a01ef2ef06fb820dc60c67a31beda1fb306a1bf0`, closed issue #36.
- Exact-merge CI run `33170910496`: `verify` job `98847562728` `success`; policy-gated `publish-visual-evidence` job `98847830103` `skipped` as designed.
- Exact-merge Pages run `33170910481`: `build` job `98847562408`, `deploy` job `98847783737`, and `verify-production` job `98847836213` all `success`.

### Post-M3i bounded production and visual acceptance — `verified, point in time`

Verified scope:

- Responsive application shell in four canonical mobile/desktop default/fallback states.
- Canonical visual acceptance `4/4`.
- Responsive acceptance `10/10`.
- Professional visual rubric `40/40`.
- Deterministic production artifact contract: `13/13` deployed files and `12/12` payload entries.
- Exact-source Pages verification for source SHA `a01ef2ef06fb820dc60c67a31beda1fb306a1bf0` at deployment time.
- Repository issue inventory reconciled to exactly `0` open issues after issue #36 closed.

Boundary:

- This is bounded, point-in-time evidence. It does not establish continuously current provenance availability or universal production readiness.

## Remaining Milestone 3 work — `deferred`

The following remain outside the verified scope:

- Continuous rendering or animation.
- Camera and pointer interaction.
- Broad cross-browser certification.
- Assistive-technology certification.
- Production-scale graph performance.
- Disposal-throw resilience that still guarantees complete teardown.
- Continuous monitoring and independent revalidation of current public provenance availability.

Full M3 remains open until these capabilities are explicitly selected, implemented, and verified. The bounded M3i and production/visual acceptance evidence above must not be interpreted as full renderer or universal production-readiness certification.

## Milestone 4 — Econometric computation layer — `planned`

Candidate scope:

- Data ingestion contracts.
- Econometric model specifications.
- Reproducible diagnostics.
- Evidence artifacts linked back into the curriculum graph.

Entry gate:

- Milestone 3 scope and acceptance must be explicitly bounded before computation work begins.

## Milestone 5 — Production hardening — `planned`

Candidate scope:

- Performance budgets.
- Accessibility audit and assistive-technology verification.
- Cross-browser matrix.
- Operational monitoring.
- Deployment provenance retention and alerting.

Entry gate:

- Production requirements must be written as measurable acceptance criteria rather than inferred from demo success.