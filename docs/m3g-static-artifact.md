# M3g — Deterministic deployable static artifact

M3g packages the bounded M3f vertical slice as a deterministic, provenance-carrying static artifact. It proves that the committed source can produce a self-contained artifact and that the packaged browser entry point works within the tested Chromium/SwiftShader boundary. It does not claim a production deployment.

## Artifact contract

- An explicit allow-list copies exactly `10` files into `dist-site/`; `artifact-manifest.json` makes the complete artifact file set `11` files.
- The manifest records the exact source commit, `package-lock.json` SHA-256, code-point-sorted paths, byte sizes, and SHA-256 digests.
- Verification checks schema, safe unique relative paths, exact file-set parity, byte sizes, file digests, source/lockfile provenance, and byte-for-byte parity across two independent rebuilds.
- The builder accepts only `dist-site`, `.site-verify-a`, or `.site-verify-b` as deletion targets, rejects a dirty tracked tree, and rejects symlink or non-regular sources.
- Eight adversarial cases fail closed: source-SHA mismatch, invalid output target, dirty tracked source, digest tampering, unexpected file, artifact symlink, manifest path traversal, and lockfile-provenance drift.

## Packaged browser boundary

- The M3g smoke server exposes only `dist-site/`, not the repository root.
- URI decoding, lexical path confinement, and `realpath`-based physical confinement reject malformed, escaping, or symlink-escaping requests.
- A real headless Chromium/SwiftShader smoke loads the packaged entry point and verifies `5` demo nodes, `4` demo relations, and `2 / 2` HTML and Three surfaces.
- Module graph load failures and unhandled runtime failures are converted into observable failure markers.

## Closure evidence

- Squash merge: `4f60d58de6f8a758e0241609bdcb988533e24f0f` (`M3g: deterministic deployable static artifact (#23)`).
- The [exact-merge commit checks page](https://github.com/umutseve4/cosmic-econometric-observatory/commit/4f60d58de6f8a758e0241609bdcb988533e24f0f/checks) identifies `CI on: push`; job `verify` succeeded on Aug 26, 2026 in `32s` and reports one Node.js 20 deprecation warning for the pinned artifact-upload action.
- The accessible checks view did not expose native run, job, or suite identifiers, the manifest SHA-256 value, or uploaded-artifact runtime metadata. None is inferred here.
- Formal GitHub Advanced Security secret scanning was unavailable; no repository-wide secret-clean conclusion is claimed.

## Explicit limits

M3g is not a deployment and has no verified live URL. Production readiness is not claimed. GitHub Pages promotion, deployed-provenance parity, a genuinely usable no-WebGL fallback orchestration path, interaction, cross-browser and assistive-technology conformance, production-scale performance, and disposal-throw resilience remain deferred.
