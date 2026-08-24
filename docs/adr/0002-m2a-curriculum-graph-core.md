# ADR 0002 — M2a deterministic curriculum graph core

- Status: Accepted
- Date: 2026-08-24
- Base: `f88c43a8338dce3f31ea4876f3d20d88770a8464`

## Decision

M2 begins with a pure, source-backed compiler for the BUÜ institution → Econometrics program → 2025–2026 curriculum → course graph. Every one of the `144` M1 `CurriculumRelation` records is projected exactly once, including semester, required/elective status, ECTS, optional pool, and provenance.

The compiler emits three canonical JSON-safe artifacts:

1. `CurriculumGraph` schema `1.0.0`.
2. `AnchorManifestV1` using `content-addressed-slots-v1`.
3. `RouteManifestV1` with canonical `/v1/nodes/{persistent-id}` routes.

Insertion-only evolution accepts a complete previous `CurriculumCompilation`, never a detached anchor manifest. The compiler recomputes the previous graph hash, requires both manifests to reference it, requires exact graph/anchor/route node-set parity, validates every prior coordinate and semantic route, and rejects removal of a prior node. Retained anchors and routes remain byte-for-byte unchanged; only new nodes receive deterministic collision-resolved slots and routes. Hidden mutable allocation state is forbidden. Course-code routes are aliases and never identity.

## Safety and provenance gates

- `Course ≠ CurriculumRelation ≠ Offering` remains normative.
- Duplicate identities, dangling references, missing or malformed provenance, mixed curriculum source tuples, duplicate relation projection, and missing or tampered prior history are fatal.
- Every anomaly reference must resolve to a known snapshot entity before M2 domain filtering. Known offering-only anomalies may then be deliberately excluded because offerings are outside the M2a graph.
- Curriculum anomalies whose references are wholly inside the compiled domain remain explicit.
- The M1 snapshot is input-only; offerings and reconciliations are not compiled, repaired, or mutated.
- Canonical output is independent of input order and locale.

## Deliberate exclusions

M2a does not invent topics or laboratories because no pinned source evidence exists for them. It does not add a renderer, deployment, scraping, database, account system, or LLM/RAG. Those remain later evidence-gated slices.

## Exit test

Adding a synthetic course with the complete previous compilation must leave every unaffected persistent node ID, anchor, slot, coordinate, and canonical URL byte-for-byte unchanged. Missing or tampered prior graph/anchor/route state, mixed provenance, unknown anomaly references, and prior-node removal must fail while all M0/M1 regression gates remain green.
