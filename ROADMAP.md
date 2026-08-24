# Roadmap

## M0 — Deterministic Universal Spine (Verified)
- Normative domain, provenance, graph and Scene IR contracts.
- Explicit anomaly ledger; no silent correction.
- Stable layout and three projection contracts from one Scene IR.
- Verified at merge `9d481cec439b99cd590e267cc0995c34e8036b36` with post-merge CI run `32759940535`.

## M1 — Source-backed BUÜ snapshot (current)
- Content-addressed 2025–2026 BUÜ evidence; legacy application code is never imported or executed.
- `144` curriculum relations and `164` offerings with explicit reconciliation and anomaly preservation.
- Deterministic curriculum-backed and timetable-derived course identities.
- Exit: locked dependencies, all integrity/mutation/isolation/determinism tests green, independent QA on the exact final head, merged PR, and native CI green on the exact merge SHA.

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
