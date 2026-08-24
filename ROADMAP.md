# Roadmap

## M0 — Deterministic Universal Spine (current)
- Normative domain, provenance, graph and Scene IR contracts.
- Explicit anomaly ledger; no silent correction.
- Stable layout and three projection contracts from one Scene IR.
- Exit: `npm run verify` passes and reordered inputs produce byte-identical Scene IR.

## M1 — Source-backed BUÜ snapshot
- Import content-addressed legacy evidence, not legacy application code.
- Reconcile CurriculumRelation and Offering inventories without conflation.
- Exit: source counts, hashes and anomaly ledger independently reproducible.

## M2 — Curriculum compiler
- Institution/program/curriculum/topic/lab graph.
- Incremental stable anchors and semantic URLs.
- Exit: adding a course does not reposition unaffected anchored systems.

## M3 — Observatory projections
- WebGL/Three.js renderer, SVG/HTML parity and screen-reader traversal.
- Exit: semantic node/edge sets match across projections; fallback is fully usable.

## M4 — RASAT protocol
- Allow-listed, schema-validated scene commands and evidence orchestration.
- Exit: no arbitrary JavaScript, GLSL, HTML, URL or unverified numeric claim can enter the renderer.
