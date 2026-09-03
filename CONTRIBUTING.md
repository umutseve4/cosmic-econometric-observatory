# Contributing

## Scope

Keep each pull request focused on one verifiable change. Preserve the repository's evidence boundaries: distinguish source verification, deterministic artifact checks, deployment-time acceptance, and continuity monitoring.

## Local verification

Use Node.js 22 or newer and install the locked dependency tree:

```text
npm ci --ignore-scripts
npm run verify
npm run test:browser-smoke
```

Browser and production checks have environment-specific prerequisites. Do not claim visual, accessibility, deployment, or provenance acceptance unless the relevant workflow or public probe produced evidence for the exact source SHA.

## Pull requests

Document the base SHA, head SHA, commands or workflow jobs used, and any unverified boundary. Do not commit generated credentials, private data, or unreviewed dependency changes.
