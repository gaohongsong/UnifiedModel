# Extension Points

中文：[扩展点](../../zh/architecture/extension-points.md)

UModel is designed so contributors can add model packs, schema kinds, providers, clients, and query capabilities without breaking public contracts.


## Model Packs

Model packs are the safest first contribution path. Each pack is a directory with UModel YAML definitions and optional runtime sample data.

Expected assets:

- EntitySet definitions.
- Dataset definitions.
- Link definitions.
- Storage definitions.
- Small sample `entities.json` and `relations.json` when possible.
- A README with scenario, assets, and queries.

Reference: [examples/quickstart-multidomain](../../../examples/quickstart-multidomain/README.md).

## Schema Kinds

Schema source lives under [schemas/](../../../schemas).

When adding or changing a schema kind:

1. Update the schema YAML.
2. Register the model in `schemas/manifest.yaml` when needed.
3. Regenerate generated assets with `make expand`.
4. Regenerate schema docs with `make doc`.
5. Update concept and reference docs.
6. Run `make verify`.

## GraphStore Providers

GraphStore providers implement the storage contract used by UModel Service, EntityStore, and Query Service.

Provider changes should preserve:

- Workspace isolation.
- UModel element writes and reads.
- Entity and relation writes.
- Query semantics for `.umodel`, `.entity`, and `.topo`.
- Explain metadata exposing the active provider.

References:

- [GraphStore Providers](../graphstore-providers.md)
- [Graph Database Extension Guide](../guides/graph-database-extension.md)

## Query Capabilities

Query changes usually touch multiple surfaces:

- Grammar under `internal/query/grammar`.
- Parser, planner, executor, and explain output.
- Provider behavior when pushdown or graph operations change.
- CLI examples.
- Web UI query examples.
- AgentGateway query tools.
- Documentation under [Query Service Guide](../guides/query-service.md).

Keep the boundary rule: domain reads go through Query Service.

## Public API And SDKs

When REST contracts change:

1. Update [api/openapi/openapi.yaml](../../../api/openapi/openapi.yaml).
2. Update server routes and tests.
3. Update SDK clients or generated SDK expectations.
4. Update CLI and Web UI if they expose the behavior.
5. Update docs and examples.

The minimal Go REST client lives under [sdk/go/service](../../../sdk/go/service).

## Web UI

The Web UI should remain aligned with public REST APIs and must not depend on internal server packages or private frontend packages.

When adding UI features:

- Use OpenAPI-backed or existing REST endpoints.
- Keep read flows behind Query Service.
- Keep model writes, entity writes, and relation writes explicit.
- Update [Web UI Architecture](../ui-architecture.md) and [Web UI API Map](../ui-api.md) when navigation or API usage changes.

## Contribution Checklist

- Public contract updated.
- Tests updated.
- Example data updated when behavior is user-visible.
- Docs updated in the same pull request.
- `make guard` passes.
- Relevant service, SDK, or UI verification passes.
