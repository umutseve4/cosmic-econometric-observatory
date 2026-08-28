# Deployment provenance evidence

The repository keeps two separate evidence classes. They must not be treated as interchangeable.

## Deployment-time verification

The `Pages` workflow verifies the artifact and deployed site for the exact source commit used by that workflow. A successful `verify-production` job is point-in-time evidence: it proves the asserted production artifact parity at the time of that deployment check.

It does **not** prove that the public provenance endpoint remains continuously reachable or continuously current after the workflow finishes.

## Public provenance continuity

The `Public provenance continuity` workflow independently requests the canonical public endpoint and fails closed unless all of the following hold:

- HTTPS retrieval succeeds with HTTP `200`;
- the manifest schema is exactly `1.0.0`;
- `sourceSha` equals the exact expected deployed commit;
- the lockfile SHA-256 matches the repository lockfile;
- the ordered payload inventory contains the exact `12/12` expected entries.

The workflow runs `120` seconds after a successful `Pages` workflow on `main`, on the schedule `17 */6 * * *`, and through `workflow_dispatch`. Its log artifact is retained for `30` days and is named for the exact source SHA and workflow run ID.

A delayed `workflow_run` success establishes post-deployment continuity for that observation. Ongoing operational evidence additionally requires a successful `schedule` or `workflow_dispatch` run for the exact deployed SHA. Issue `#47` remains the fail-closed checkpoint until that gate is recorded.

## Scope boundary

These checks do not claim continuous rendering, camera or pointer interaction, broad cross-browser coverage, assistive-technology certification, production-scale performance, disposal-throw resilience, full M3 completion, or universal production readiness.
