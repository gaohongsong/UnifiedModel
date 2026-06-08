# GraphStore Providers

中文：[GraphStore Providers](../zh/graphstore-providers.md)

UModel stores UModel elements, CMS 2.0 entities, and topology relations behind the `GraphStore` interface. Go entry binaries default to `local.ladybug` when `--graphstore` is omitted; select another provider with `--graphstore` on `umodel-server` or `umodel-mcp`.

```bash
go run ./cmd/umodel-server --addr :8080 --data data --graphstore file.memory
```

Active provider locations:

- `GET /healthz` as `graphstore.provider`
- query explain output as `provider` and `storage_provider`

## Providers

| Provider | Persistence | Typical use |
|---|---|---|
| `memory` | Process memory only | Fast local tests and demos where data can disappear on restart; supports Ladybug-compatible read-only Cypher through the pure Go engine. |
| `file.memory` | JSON files under `--data` | Local demos and development where data should survive process restart without Ladybug; supports the same pure Go read-only Cypher engine as `memory`. `make dev` selects this provider by default. |
| `local.ladybug` | Ladybug database files | Ladybug-backed provider with graph-match and Cypher passthrough enabled; requires building with `-tags ladybug` and a local Ladybug runtime. |
| `remote.neo4j` | Neo4j over Bolt | Shared remote graph store for multi-client and multi-replica UModel deployments. Configure with `UMODEL_NEO4J_URI`, `UMODEL_NEO4J_USERNAME`, `UMODEL_NEO4J_PASSWORD`, and optional `UMODEL_NEO4J_DATABASE`. Local Compose defaults to `itree.123456` because Neo4j 5 rejects `neo4j` as a password. |
| `remote.memgraph` | Memgraph over Bolt | Shared remote graph store with the same GraphStore contract as `remote.neo4j`. Configure with `UMODEL_MEMGRAPH_URI` and optional credentials. |

## `file.memory`

`file.memory` keeps the same query and lifecycle semantics as `memory`, but loads and saves JSON snapshots on disk:

- Default directory: `<data-root>/graphstore/file-memory/`
- Custom directory from code: `graphstore.ProviderConfig{Options: map[string]string{"path": "/path/to/file-memory-dir"}}`
- Loading: reads workspace collection files once during provider startup
- Querying: serves `.umodel`, `.entity`, and `.topo` from memory
- Saving: atomically rewrites the changed workspace collection files after successful UModel, entity, relation, or direct GraphStore workspace/schema writes

The default layout splits data by workspace and collection:

```text
<data-root>/graphstore/file-memory/
└── workspaces/
    └── demo/
        ├── umodels.json
        ├── entities.json
        └── relations.json
```

Each collection file has a small envelope:

```json
{
  "version": 1,
  "items": {}
}
```

For compatibility, the provider can still read the old single-file layout at
`<data-root>/graphstore/file-memory.json`. When that legacy file is loaded and
the new directory layout is absent, the provider writes the data back out using
the split workspace layout.

Current entity and topology queries hide expired/deleted rows unless a historical `time_range` is supplied. The expired/deleted records are still kept in the file so historical queries can read them after restart.

## Scope And Limits

- `file.memory` persists GraphStore data: UModel elements, entities, and relations.
- Workspace metadata managed by `/api/v1/workspaces` is persisted at `<data-root>/workspaces.json` for every provider except `memory`. Graph data for `remote.neo4j` and `remote.memgraph` lives in the remote database; workspace metadata still uses the local `--data` directory.
- Single local process only for `file.memory`. Do not run multiple writers against the same file-memory directory.
- The JSON files are useful for inspection and demos, but they are not a long-term storage compatibility contract.

## Smoke Test

```bash
go run ./cmd/umodel-server --addr :8080 --data /tmp/umodel-demo --graphstore file.memory
go run ./cmd/umctl --addr http://localhost:8080 umodel put demo '{"id":"devops.service","kind":"entity_set","domain":"devops","name":"devops.service"}'
go run ./cmd/umctl --addr http://localhost:8080 query run demo ".umodel | limit 5"
find /tmp/umodel-demo/graphstore/file-memory -maxdepth 4 -type f
```

Restart the server with the same `--data` path and rerun the query to confirm the data was loaded back from disk.

## Remote Providers Local Smoke Test

Start local Neo4j and Memgraph:

```bash
make graph-db-up
```

Run the full stack with Neo4j GraphStore:

```bash
make compose-neo4j
```

Run the full stack with Memgraph GraphStore:

```bash
make compose-memgraph
```

Run provider conformance tests:

```bash
make test-graph-db
```

Run UModel against Neo4j (`make dev` and `make deploy` apply the same local defaults as Compose):

```bash
GRAPHSTORE=remote.neo4j make dev
```

Stop the graph databases:

```bash
make graph-db-down
```

## Extension And Graph Database Selection

To add a new GraphStore backend or compare open-source graph databases for small to medium workloads, see [Graph Database Extension Guide](guides/graph-database-extension.md).
