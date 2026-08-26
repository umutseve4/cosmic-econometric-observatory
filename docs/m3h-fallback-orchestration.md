# M3h — deterministic failure fallback orchestration

## Boundary

M3h adds one fail-closed orchestration boundary around the bounded Three.js projection. It attempts Three preparation once and uses an equivalent generated HTML or SVG projection only when that preparation fails before the target boundary is entered.

The orchestrator does not catch malformed manifests, semantic parity failures, missing ports, DOM preparation failures, or target commit failures. Those remain explicit errors. It never accepts arbitrary fallback markup or a URL: both projections are versioned `ProjectionManifestV2` values generated from the same renderer-neutral Scene IR.

## Deterministic contract

- Primary projection must be `three`; fallback must be `html` or `svg`.
- Both manifest structures are preflight-validated; schema version, sorted node IDs, sorted edge IDs, focus order, node descriptors and edge descriptors must match exactly before any caller preparation port is invoked.
- Successful Three preparation makes exactly one target commit attempt and never prepares the fallback.
- Failed Three preparation makes zero Three target commit attempts. If semantic fallback preparation and commit succeed, the fallback makes exactly one commit attempt.
- A target error is never reclassified by message: entering the primary target boundary permanently disables fallback for that attempt.
- The receipt reports `three` or `fallback`, the fallback projection kind, the fixed preparation-failure code, and the underlying semantic render receipt.

## Verification surface

- Node tests cover success, forced preparation failure, semantic drift, invalid fallback preflight, malformed Three content, ordinary target failure, and a reserved-message mutate-then-throw target collision.
- Real Chromium/SwiftShader smoke forces `WebGLRenderer` construction failure and verifies one usable HTML fallback, zero failed-Three canvas mounts, exact node/edge/focus-order parity and keyboard navigation links.
- The deterministic static artifact includes the orchestrator module and uses SVG fallback in its visual viewport while retaining the independent HTML semantic surface.

## Explicitly deferred

Continuous rendering, camera/selection interaction, responsive application behavior, Firefox/WebKit, assistive-technology conformance, production-scale performance, disposal-throw resilience and live deployment remain outside this slice.
