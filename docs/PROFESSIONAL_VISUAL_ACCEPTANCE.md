# Professional visual redesign acceptance

PR #34 is accepted only when every gate below is evidenced on the exact candidate SHA.

## Automated preconditions

- TypeScript typecheck and complete unit suite pass.
- Deterministic site build and site verification pass from a clean tracked tree.
- Real-browser DOM, production DOM boundary, Three.js, artifact, default-selection, and forced-SVG smoke tests pass.
- Responsive matrix passes at 320, 360, 390, 768, and 1440 px in both default and forced-SVG modes (`10/10`).
- SVG preparation accepts browser-canonical `viewBox` and `preserveAspectRatio` while rejecting event, style, unknown, duplicate, and foreign-namespace inputs.
- Accessibility and Turkish localization contracts pass without translating internal IDs or `semanticKind` values.
- The CI commit SHA exactly equals the candidate head.

## Canonical visual evidence contract

The hosted Chrome capture must produce these four canonical first-fold PNGs and four supporting full-page PNGs from the same exact SHA:

| ID | Viewport | Requested mode | Required observed `data-render-mode` |
|---|---:|---|---|
| `VA-M-D` | `390×844` | default | `three` |
| `VA-M-F` | `390×844` | forced fallback | `fallback` |
| `VA-D-D` | `1440×900` | default | `three` |
| `VA-D-F` | `1440×900` | forced fallback | `fallback` |

`metadata.json` is mandatory and must record, for every state: exact source SHA, route, viewport, requested mode, observed mode, UTC timestamp, browser version, runtime marker, font readiness/fallback state, layout measurements, PNG dimensions, and PNG SHA-256. Capture success is only evidence availability; it is not aesthetic acceptance.

## Normative 40-cell rubric

A reviewer must inspect the canonical first fold and its matching full-page capture for each state. Every cell is binary `PASS` or `FAIL`; notes are mandatory for every failure. Acceptance requires `40/40`.

| # | Category | Binary PASS criterion | VA-M-D | VA-M-F | VA-D-D | VA-D-F |
|---:|---|---|:---:|:---:|:---:|:---:|
| 1 | Hierarchy | Brand, headline, primary action, graph, and section hierarchy are immediately understandable; no competing focal point. | PENDING | PENDING | PENDING | PENDING |
| 2 | Clipping / overflow | No visible crop, overlap, accidental scrollbar, off-canvas content, or truncated focus outline. | PENDING | PENDING | PENDING | PENDING |
| 3 | Typography | Headings and body copy are legible, line breaks are intentional, and loaded/fallback fonts do not create broken wrapping. | PENDING | PENDING | PENDING | PENDING |
| 4 | Contrast | Text, controls, borders, graph marks, and status indicators remain distinguishable against their backgrounds. | PENDING | PENDING | PENDING | PENDING |
| 5 | Spacing | Rhythm, alignment, gutters, card padding, and section transitions are consistent without dead or cramped zones. | PENDING | PENDING | PENDING | PENDING |
| 6 | Graph sharpness | Canvas/SVG graph is visibly sharp, centered, proportionate, and free of distortion or unintended empty framing. | PENDING | PENDING | PENDING | PENDING |
| 7 | Fallback parity | The state preserves the same composition and semantic emphasis as its paired render mode; no mode-specific collapse. | PENDING | PENDING | PENDING | PENDING |
| 8 | Semantic-card readability | Node navigation, detail cards, labels, and relation content are readable and visually scannable in the full-page capture. | PENDING | PENDING | PENDING | PENDING |
| 9 | Interaction / focus | Primary controls and interactive nodes have recognizable affordance; captured focus/selection styling, where present, is not clipped or ambiguous. | PENDING | PENDING | PENDING | PENDING |
| 10 | First-fold composition | The `390×844` or `1440×900` crop forms a deliberate composition with a clear continuation cue; no critical first impression is stranded below the fold. | PENDING | PENDING | PENDING | PENDING |

## QA and merge gate

- Independent QA must report open `P0 = 0` and `P1 = 0` on the exact candidate SHA.
- Any accepted `P2` must name an owner, rationale, and follow-up issue.
- Production remains unchanged until automated gates, `4/4` canonical captures, `10/10` responsive cases, `40/40` rubric cells, and zero QA blockers all pass.

## Post-merge gate

The squash merge is complete only after exact-main CI, a `12`-payload-file plus `artifact-manifest.json` (`13` total files) Pages artifact, deployment success, both live render modes, Turkish runtime, and live manifest `sourceSha` equality with the squash-merge SHA are verified.

Automated geometry checks are not aesthetic acceptance. Do not claim “production-ready,” “visual acceptance passed,” or redesign completion before all gates close.
