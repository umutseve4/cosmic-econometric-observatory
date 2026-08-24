# Cosmic Econometric Observatory

A deterministic, provenance-first world engine that compiles versioned academic catalogs into a knowledge graph, renderer-neutral Scene IR, and accessible projections.

This is a clean successor project. [`umutseve4/eko-rasathane`](https://github.com/umutseve4/eko-rasathane) remains an immutable legacy/reference repository; its application code and history are not copied here.

## M0 — Deterministic Universal Spine

`source snapshot → explicit assertions/anomalies → domain graph → deterministic layout → Scene IR → 3D manifest / SVG / HTML`

| Entity | Meaning | Must not contain |
|---|---|---|
| `Course` | Persistent canonical academic entity | semester, instructor, room |
| `CurriculumRelation` | A course's placement/status/credits in one curriculum version | section, instructor, schedule |
| `Offering` | A time-bound delivery of a course | copied canonical title/credits |

Human-facing course codes are assignments, never identity. Raw source values are never silently corrected. Every accepted or rejected assertion remains traceable to a content-addressed snapshot.

### Verify

Requires Node.js 22 or newer.

```sh
npm install --ignore-scripts
npm run verify
```

M0 deliberately excludes scraping, databases, user accounts, LLM/RAG integration, real-time physics, and a production WebGL renderer. The `three` projection is a renderer-neutral manifest, not a GPU implementation.
