# Deployments

This directory contains local deployment assets for UModel Open Source.

| Path | Purpose |
|---|---|
| `docker/Dockerfile` | Builds `umodel-server` with embedded web UI (`web/dist` at `/ui`). Runtime base is Debian slim with `/bin/sh` for ops debugging. |
| `compose/docker-compose.yaml` | Runs the UModel API; Neo4j and Memgraph use profiles `neo4j`, `memgraph`, or both via `graph`. |
| `compose/.env.example` | Optional env file for `COMPOSE_PROFILES`, `GRAPHSTORE`, and port overrides. |
| `compose/graph-databases.compose.yaml` | Compatibility alias for the graph profile in the main Compose file. |

## Provider Default

The open-source deployment assets use `--graphstore file.memory` by default. This avoids local Ladybug runtime requirements and persists GraphStore JSON data under `/data`.

Use `local.ladybug` only in an environment that has:

- A Ladybug-enabled build.
- The `liblbug` runtime available to the process.
- A deliberate operational reason to use the Ladybug-backed provider.

## Docker

Build the image from the repository root (multi-stage: Vite UI + Go API):

```bash
make build-image
# or
docker build -f deployments/docker/Dockerfile -t umodel-open-source:local .
```

Cross-build for `linux/amd64` (for example from Apple Silicon to a K8s amd64 cluster):

```bash
make build-image-amd64
# push to registry:
make build-image-amd64 IMAGE_NAME=your-registry/umodel:v1.0.0 BUILDX_OUTPUT=--push
```

Run the server (API and web UI on the same port):

```bash
docker run --rm \
  -p 18080:18080 \
  -v umodel-data:/data \
  umodel-open-source:local
```

The container starts:

```bash
umodel-server --addr :18080 --data /data --graphstore file.memory --ui-dir /ui
```

Open the workspace UI at `http://localhost:18080/`.

The runtime image includes `/bin/sh`, so `kubectl exec -it <pod> -- sh` and k9s shell shortcuts work for troubleshooting.

Check health:

```bash
curl http://localhost:18080/healthz
```

### Kubernetes

Deploy one container image for both API and UI. Point Ingress (or Service) at port `18080`. No separate frontend Deployment is required.

Example with Memgraph:

```yaml
containers:
  - name: umodel-server
    image: umodel-open-source:local
    ports:
      - containerPort: 18080
    args:
      - --addr
      - :18080
      - --data
      - /data
      - --graphstore
      - remote.memgraph
      - --ui-dir
      - /ui
    env:
      - name: UMODEL_MEMGRAPH_URI
        value: bolt://memgraph:7687
    volumeMounts:
      - name: data
        mountPath: /data
```

If `/` returns JSON with `"endpoints"` instead of the web UI, `--ui-dir /ui` is missing from container args. Check startup logs for `serving web UI from /ui`, or run `tr '\\0' ' ' </proc/1/cmdline` inside the container.

Inside the container, `ps` is available after the runtime image installs `procps`.

## Docker Compose

| Goal | Command |
|---|---|
| UModel only (`file.memory`) | `make compose-up` |
| UModel + Neo4j | `make compose-neo4j` |
| UModel + Memgraph | `make compose-memgraph` |
| Neo4j + Memgraph only | `make graph-db-up` |
| Stop stack | `make compose-down` |
| Reset graph volumes | `make graph-db-reset` |

Raw Compose equivalents:

```bash
docker compose -f deployments/compose/docker-compose.yaml up --build
GRAPHSTORE=remote.neo4j  docker compose -f deployments/compose/docker-compose.yaml --profile neo4j up --build
GRAPHSTORE=remote.memgraph docker compose -f deployments/compose/docker-compose.yaml --profile memgraph up --build
```

Local dev with graph databases running in Docker:

```bash
make graph-db-up && GRAPHSTORE=remote.neo4j make dev
make graph-db-up && GRAPHSTORE=remote.memgraph make dev
```

Optional `.env` workflow (copy `deployments/compose/.env.example` to the repo root as `.env`):

```bash
COMPOSE_PROFILES=memgraph
GRAPHSTORE=remote.memgraph
docker compose -f deployments/compose/docker-compose.yaml up --build
```

## Ports And Data

| Setting | Default | Notes |
|---|---|---|
| API port | `18080` | Exposed as `http://localhost:18080`. |
| Neo4j Browser | `7474` | `http://localhost:7474`. |
| Neo4j Bolt | `7687` | UModel in Compose uses `bolt://neo4j:7687`. |
| Memgraph Bolt | `7688` | Host `bolt://localhost:7688`; in Compose `bolt://memgraph:7687`. |
| Neo4j password | `itree.123456` | Override with `NEO4J_PASSWORD`. |
| Data directory | `/data` | Mounted to the `umodel-data` Docker volume in Compose. Stores `workspaces.json` for all providers except `memory`. |
| GraphStore provider | `file.memory` | Set `GRAPHSTORE` to `remote.neo4j` or `remote.memgraph`. |

Workspace metadata is persisted separately at `/data/workspaces.json` when using `file.memory`.

## Import The Demo In Docker

After the server starts:

```bash
go run ./cmd/umctl --addr http://localhost:18080 workspace create demo '{"name":"Demo"}'
curl -X POST http://localhost:18080/api/v1/samples/demo/multi-domain-quickstart:import \
  -H 'Content-Type: application/json' \
  -d '{}'
go run ./cmd/umctl --addr http://localhost:18080 query run demo ".umodel | limit 5"
```

## Compatibility Notes

- The JSON files written by `file.memory` are useful for local inspection and demos, but they are not a long-term storage compatibility contract.
- Do not run multiple writers against the same file-memory directory.
- When upgrading between development builds, prefer exporting or re-importing example data rather than depending on raw JSON layout stability.
- If a future release changes storage layout, document the migration in [CHANGELOG.md](../CHANGELOG.md).
