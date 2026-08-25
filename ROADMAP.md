# Roadmap

## M0 — Deterministic Universal Spine (Verified)
- Normative domain, provenance, graph and Scene IR contracts.
- Explicit anomaly ledger; no silent correction.
- Stable layout and three projection contracts from one Scene IR.
- Verified at merge `9d481cec439b99cd590e267cc0995c34e8036b36` with post-merge CI run `32759940535`.

## M1 — Source-backed BUÜ snapshot (Verified)
- Content-addressed 2025–2026 BUÜ evidence; legacy application code is never imported or executed.
- `144` curriculum relations and `164` offerings with explicit reconciliation and anomaly preservation.
- Deterministic curriculum-backed and timetable-derived course identities.
- Verified at squash merge `f88c43a8338dce3f31ea4876f3d20d88770a8464` with post-merge CI run `32767161943`.

## M2 — Curriculum compiler (in progress)
### M2a — Deterministic curriculum graph core
- Source-backed institution/program/curriculum/course graph; all `144` curriculum relations projected exactly once.
- Versioned, explicit `AnchorManifestV1` and `RouteManifestV1` artifacts.
- Previous-manifest allocation preserves unaffected anchors; persistent-ID canonical routes survive title/code changes.
- Exit: adding a course does not reposition unaffected anchored systems; exact-head CI and independent QA pass.

### Deferred M2 slices
- Topic and laboratory nodes require pinned source evidence before compilation.
- Renderer and deployment remain M3 work.

## M3 — Observatory projections
- WebGL/Three.js renderer, SVG/HTML parity and screen-reader traversal.
- Exit: semantic node/edge sets match across projections; fallback is fully usable.

## M4 — RASAT protocol
- Allow-listed, schema-validated scene commands and evidence orchestration.
- Exit: no arbitrary JavaScript, GLSL, HTML, URL or unverified numeric claim can enter the renderer.
