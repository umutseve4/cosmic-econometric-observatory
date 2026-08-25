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
### M2a — Deterministic curriculum graph core (Verified)
- Source-backed institution/program/curriculum/course graph; all `144` curriculum relations projected exactly once.
- Versioned, explicit `AnchorManifestV1` and `RouteManifestV1` artifacts.
- Previous-manifest allocation preserves unaffected anchors; persistent-ID canonical routes survive title/code changes.
- Course assignment history is cumulative and immutable; aliases are the exact deterministic projection of graph assignments, rejecting forged predecessor aliases.
- Verified at squash merge `6aae3972281436d40f04ecffdc48852bf1babf8a` with post-merge CI run `32831488629`, job `97750957612`, and independent evidence-only security QA PASS with no HIGH/CRITICAL findings.

### Deferred M2 slices
- Topic and laboratory nodes require pinned source evidence before compilation.

## M3 — Observatory projections (in progress)
### M3a — Semantic projection contract (Verified)
- Three.js payload, SVG projection and HTML fallback expose identical sorted semantic node/edge sets.
- Focus order is explicit, deterministic and independent of input array order.
- HTML provides keyboard-navigable node targets and linked relations; SVG exposes ordered keyboard and screen-reader traversal metadata.
- Invalid or duplicate focus order fails closed before projection.
- Verified at squash merge `9b5be56dbb30492b7e0fe020e7df02af9981bb9a` with post-merge CI run `32837850801`, job `97770623464`, `0` annotations, and independent QA PASS with CRITICAL/HIGH/MEDIUM findings `0/0/0`.

### M3b — Injected browser preparation/mount boundary (Verified)
- Dependency-free injected ports prepare HTML/SVG or validated Three payloads off-target.
- Schema, semantic membership, traversal order and prepared metadata fail closed before target invocation.
- Successful validation permits exactly one target commit attempt; rollback is not guaranteed if the injected target mutates and then throws.
- This slice does not implement a concrete DOM parser, sanitizer, Three.js/WebGL renderer, deployment, styling, interaction or assistive-technology conformance.
- Verified at squash merge `a17e3b5fd6240221def1639a1c8d5f4d1fbfb5f3` with post-merge CI run `32841906214` and independent QA PASS with CRITICAL/HIGH/MEDIUM findings `0/0/0`.

### M3c — Allow-listed concrete browser DOM adapter (Verified)
- Parse generated HTML/SVG into detached template content before any mount-target mutation.
- Fail closed on unexpected structure, namespaces, attributes, event handlers, styles, external links and dangling relation endpoints.
- Re-derive semantic membership and focus traversal from the detached DOM for the existing M3b parity gate.
- This slice does not implement Three.js/WebGL, styling, interaction, cross-browser or assistive-technology conformance, or deployment.
- Verified at squash merge `b5fca44556c437a7eb5d13b954c79facf9611bb4` with post-merge CI run `32845606305`, job `97794447657`, suite `88973044199`, `0` annotations, and independent QA PASS-WITH-NOTES with CRITICAL/HIGH/MEDIUM/LOW findings `0/0/1/0`.

### M3d — Standards-compatible Chromium parser smoke (Verified)
- Execute generated HTML and SVG through a real headless Chromium `template.innerHTML` parser in CI.
- Verify detached-tree metadata parity, HTML/SVG namespace behavior, hostile-label escaping, fail-closed active-content rejection, and exact target mutation counts.
- Add no runtime dependency; retain the existing Node `22` verification gate.
- This slice is a Chromium smoke test, not cross-browser or assistive-technology conformance.
- Verified at squash merge `5234ba23432b169706875b8bcbca4347e6ee5f17` with post-merge CI run `32847376714`, job `97800124908`, suite `88977916587`, `0` annotations, and fresh independent QA PASS with CRITICAL/HIGH/MEDIUM/LOW findings `0/0/0/0`.

### M3e — Trusted semantic descriptor parity (Verified)
- Treat manifest and prepared semantic descriptors as untrusted claims and independently reconstruct canonical node `{id,label,kind}` and edge `{id,source,target}` descriptors from validated Three JSON or detached allow-listed DOM.
- Reject forged, missing, reordered, duplicate or drifting descriptors before target mutation while preserving exact edge shape and canonical Three DTO allow-listing.
- Preserve bounded M3b renderer regressions and full M3d real-Chromium security and SVG namespace coverage through browser-safe direct module imports.
- Verified at squash merge `168a44922b204c9afe4c5f3d8305d877f912ac7b` with exact-main push CI run `32868471602`, job `97869472712`, suite `89038034322`, `0` annotations, and independent QA PASS with all eight acceptance areas satisfied.

### Deferred M3 slices
- Concrete Three.js/WebGL implementation, visual interaction, cross-browser and assistive-technology validation, and deployment remain deferred.

### M3 exit
- WebGL/Three.js renderer, SVG/HTML parity and screen-reader traversal.
- Semantic node/edge sets match across projections; fallback is fully usable.

## M4 — RASAT protocol
- Allow-listed, schema-validated scene commands and evidence orchestration.
- Exit: no arbitrary JavaScript, GLSL, HTML, URL or unverified numeric claim can enter the renderer.
