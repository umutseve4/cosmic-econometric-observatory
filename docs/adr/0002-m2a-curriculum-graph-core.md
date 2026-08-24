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

A previous anchor manifest is explicit input. Existing entries are validated and retained byte-for-byte; new nodes receive deterministic, collision-resolved slots. Hidden mutable allocation state is forbidden. Course-code routes are aliases and never identity.

## Safety and provenance gates

- `Course ≠ CurriculumRelation ≠ Offering` remains normative.
- Duplicate identities, dangling references, missing provenance, duplicate relation projection, and tampered previous anchors are fatal.
- Curriculum anomalies whose references are wholly inside the compiled domain remain explicit.
- The M1 snapshot is input-only; offerings and reconciliations are not compiled, repaired, or mutated.
- Canonical output is independent of input order and locale.

## Deliberate exclusions

M2a does not invent topics or laboratories because no pinned source evidence exists for them. It does not add a renderer, deployment, scraping, database, account system, or LLM/RAG. Those remain later evidence-gated slices.

## Exit test

Adding a synthetic course with the previous manifest must leave every unaffected persistent node ID, anchor, slot, coordinate, and canonical URL byte-for-byte unchanged while all M0/M1 regression gates remain green.
