# Normative invariants

- Domain records **MUST** use persistent internal IDs.
- A `Course` **MUST NOT** contain curriculum placement or delivery fields.
- A `CurriculumRelation` **MUST** point to one course and one curriculum version.
- An `Offering` **MUST** point to a course and academic period.
- External assertions **MUST** carry provenance.
- Validators **MUST NOT** repair conflicting values. They **MUST** emit anomalies while preserving raw evidence.
- Graph edges **MUST NOT** dangle.
- Scene IR **MUST** be JSON-serializable and renderer-neutral.
- Layout **MUST** depend only on canonical input, algorithm version and seed.
- HTML projection **MUST** expose every semantic node as keyboard-focusable content.
