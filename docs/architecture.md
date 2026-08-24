# Architecture

Dependency direction is one-way:

- `contracts` depends on no upper layer.
- `graph` consumes contracts.
- `layout` consumes graph nodes and knows no renderer.
- `scene` combines graph and layout into JSON-safe Scene IR.
- `projections` consume Scene IR only and cannot reinterpret domain records.

M0 keeps computation pure and deterministic. Dates, randomness, network access and mutable global state are prohibited inside compilation. Canonical serialization sorts object keys and all identity-bearing arrays.
