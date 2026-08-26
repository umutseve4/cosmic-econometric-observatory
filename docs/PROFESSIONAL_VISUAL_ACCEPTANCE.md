# Professional visual redesign acceptance

PR #34 is accepted only when all gates below are evidenced on the exact head.

- TypeScript typecheck and complete unit suite pass.
- Deterministic site build and site verification pass from a clean tracked tree.
- Real-browser DOM, Three.js, artifact, default-selection, and forced-SVG smoke tests pass.
- Responsive matrix passes at 320, 360, 390, 768, and 1440 px in both default and forced-SVG modes (10 cases).
- SVG preparation accepts browser-canonical `viewBox` and `preserveAspectRatio` while rejecting event, style, unknown, duplicate, and foreign-namespace inputs.
- Accessibility and Turkish localization contracts pass without translating internal IDs or `semanticKind` values.
- Independent QA reports zero blocking findings.
- Genuine desktop, mobile, and forced-fallback captures demonstrate unclipped hierarchy, integrated sharp graph rendering, readable semantic cards, and controlled spacing.
- Merge is followed by exact-main CI, a 13-file Pages artifact, deployment success, and live manifest `sourceSha` equality with the squash-merge SHA.

Automated geometry checks are not aesthetic acceptance. Production remains unchanged until every pre-merge gate passes.

- The CI commit SHA must exactly match the candidate head.
