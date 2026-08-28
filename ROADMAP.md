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
- Preserve bounded M3b renderer regressions and full existing M3d real-Chromium smoke security and SVG namespace coverage through browser-safe direct module imports.
- Verified at squash merge `168a44922b204c9afe4c5f3d8305d877f912ac7b` with exact-main push CI [run `32868471602`](https://api.github.com/repos/umutseve4/cosmic-econometric-observatory/actions/runs/32868471602) and [job `97869472712`](https://api.github.com/repos/umutseve4/cosmic-econometric-observatory/actions/jobs/97869472712), completed successfully.

### M3f — Bounded Three.js/WebGL vertical slice (Verified on closure SHA)
- Exact-pin `three@0.185.1` and translate the canonical Three DTO into a detached deterministic scene.
- Render exactly one `320×240` frame, preserve semantic descriptor/focus-order parity, and dispose GPU resources on covered success and preparation-failure paths; disposal-throw resilience remains deferred.
- Keep the canvas out of the accessibility tree while HTML/SVG retain the semantic surface.
- Real Chromium/SwiftShader smoke verifies `2` nodes, `1` edge, a live WebGL context, `NO_ERROR`, forced WebGL failure rejection, and `0` target mounts on failed preparation.
- Original implementation squash-merged as `5137f812e4f5733039e1880f4dd8b89b7b66c517` after PR-head CI [run `32878695626`](https://github.com/umutseve4/cosmic-econometric-observatory/actions/runs/32878695626), [job `97902742320`](https://github.com/umutseve4/cosmic-econometric-observatory/actions/runs/32878695626/job/97902742320), completed successfully from `2026-08-25T17:34:41Z` to `2026-08-25T17:35:03Z`; no exact-main native push-CI result is claimed for that historical merge SHA.
- Closure/hardening squash merge `6daa4b3ba9e6941335d081bed1a15266ff5f2011` contains the M3f implementation and bounds browser process-tree/handle release plus HTTP server shutdown. Its exact-main native push CI [run `32895153509`](https://github.com/umutseve4/cosmic-econometric-observatory/actions/runs/32895153509), [job `97955989072`](https://github.com/umutseve4/cosmic-econometric-observatory/actions/runs/32895153509/job/97955989072), suite `89112873525`, completed successfully from `2026-08-25T20:24:30Z` to `2026-08-25T20:24:53Z` with `0` annotations. This verifies the closure tree without retroactively attributing a run to the historical implementation merge.

### M3h — Deterministic failure fallback orchestration (Verified)
- Preflight Three and semantic HTML/SVG manifests before preparation and require exact schema, node, edge, focus-order and trusted descriptor parity.
- Fall back only on the exact pre-commit Three preparation failure; target-boundary provenance prevents a reserved-message target error from triggering a second commit.
- Emit a deterministic receipt and preserve visible errors for every non-eligible failure class.
- Node and real Chromium/SwiftShader tests cover success, forced WebGL failure, semantic drift, malformed manifests/content and target collision behavior.
- Verified at squash merge `38e8314978ef87d7c962c36f6161580d4c6e9f90` with exact-main [`verify` check run `98129078877`](https://api.github.com/repos/umutseve4/cosmic-econometric-observatory/check-runs/98129078877), suite `89262843081`, completed successfully from `2026-08-26T09:28:44Z` to `2026-08-26T09:29:19Z`, and independent exact-head QA PASS with CRITICAL/HIGH/MEDIUM/LOW findings `0/0/0/0`.

### M3i — Deterministic keyboard node selection (Verified, bounded)
- Keep selection identity as a persistent node ID owned by one controller shared across semantic projections.
- Accept `Enter` and `Space` selection plus `Escape` clear; repeated, unknown, duplicate and stale inputs produce exactly `0` logical commits, while a real state transition produces exactly `1`.
- Bind only validated HTML navigation and SVG fallback targets; keep the Three canvas decorative and `aria-hidden="true"`.
- Node adversarial coverage and real Chromium evidence cover SwiftShader Three and forced-no-WebGL SVG fallback paths.
- Subsequent bounded work verified the responsive application shell, GitHub Pages deployment, production artifact parity, canonical visual states and deterministic visual-CI font evidence.
- Issue #36 was closed by PR #45 at squash merge `a01ef2ef06fb820dc60c67a31beda1fb306a1bf0`; the repository then had exactly `0` open issues.
- Exact-merge CI run `33170910496`: `verify` job `98847562728` succeeded; policy-gated `publish-visual-evidence` job `98847830103` was skipped as designed.
- Exact-merge Pages run `33170910481`: `build` job `98847562408`, `deploy` job `98847783737`, and `verify-production` job `98847836213` all succeeded.
- Canonical visual acceptance is `4/4`, responsive acceptance is `10/10`, and the bounded rubric result is `40/40`.
- This closure does not claim camera controls, pointer picking, continuous rendering, broad cross-browser or assistive-technology conformance, production-scale performance, disposal-throw resilience, continuously current public provenance availability, or universal production readiness.

### Deferred M3 slices
- Continuous rendering, camera and pointer interaction, broad cross-browser and assistive-technology validation, production-scale performance, disposal-throw resilience, and continuous monitoring/revalidation of current public provenance availability remain deferred.

### M3 exit
- WebGL/Three.js renderer, SVG/HTML parity and screen-reader traversal.
- Semantic node/edge sets match across projections; fallback is fully usable.
- Full M3 remains open until the deferred capabilities selected for the exit are explicitly implemented and verified; bounded M3i closure is not full-M3 certification.

## M4 — RASAT protocol
- Allow-listed, schema-validated scene commands and evidence orchestration.
- Exit: no arbitrary JavaScript, GLSL, HTML, URL or unverified numeric claim can enter the renderer.
