# 部署

English version: [README.md](README.md)

本目录包含 UModel Open Source 的本地部署资产。

| 路径 | 作用 |
|---|---|
| `docker/Dockerfile` | 构建内嵌 Web UI 的 `umodel-server` 镜像（`web/dist` 位于 `/ui`）。运行时使用 Debian slim，含 `/bin/sh` 便于运维调试。 |
| `compose/docker-compose.yaml` | 运行 UModel API；Neo4j / Memgraph 通过 profile `neo4j`、`memgraph` 或 `graph` 启用。 |
| `compose/.env.example` | 可选 env 模板，用于 `COMPOSE_PROFILES`、`GRAPHSTORE` 与端口覆盖。 |
| `compose/graph-databases.compose.yaml` | 兼容别名，等价于主 Compose 文件的 graph profile。 |

## 默认 Provider

开源部署资产默认使用 `--graphstore file.memory`。这样不需要本地 Ladybug runtime，并将 GraphStore JSON 数据持久化到 `/data`。

仅在具备 Ladybug-enabled build、`liblbug` runtime 且有明确运维原因时使用 `local.ladybug`。

## Docker

在仓库根目录构建镜像（多阶段：Vite UI + Go API）：

```bash
make build-image
# 或
docker build -f deployments/docker/Dockerfile -t umodel-open-source:local .
```

交叉构建 `linux/amd64` 镜像（例如在 Apple Silicon 上为 amd64 K8s 集群打包）：

```bash
make build-image-amd64
# 推送到镜像仓库：
make build-image-amd64 IMAGE_NAME=your-registry/umodel:v1.0.0 BUILDX_OUTPUT=--push
```

运行（API 与 Web UI 同一端口）：

```bash
docker run --rm \
  -p 18080:18080 \
  -v umodel-data:/data \
  umodel-open-source:local
```

容器启动命令：

```bash
umodel-server --addr :18080 --data /data --graphstore file.memory --ui-dir /ui
```

浏览器访问 `http://localhost:18080/`。

运行镜像包含 `/bin/sh`，可用 `kubectl exec -it <pod> -- sh` 或 k9s 快捷键进入容器排查。

健康检查：

```bash
curl http://localhost:18080/healthz
```

### Kubernetes

使用同一镜像部署 API 与 UI，Ingress/Service 指向端口 `18080`，无需单独的前端 Deployment。

Memgraph 示例：

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

若访问 `/` 返回带 `"endpoints"` 的 JSON 而不是 Web UI，说明容器 args 里缺少 `--ui-dir /ui`。查看启动日志是否有 `serving web UI from /ui`，或在容器内执行 `tr '\\0' ' ' </proc/1/cmdline` 查看实际启动命令。

运行镜像已安装 `procps`，容器内可使用 `ps`。

## Docker Compose

| 场景 | 命令 |
|---|---|
| 仅 UModel（`file.memory`） | `make compose-up` |
| UModel + Neo4j | `make compose-neo4j` |
| UModel + Memgraph | `make compose-memgraph` |
| 仅 Neo4j + Memgraph | `make graph-db-up` |
| 停止栈 | `make compose-down` |
| 重置图库卷 | `make graph-db-reset` |

等价 Compose 命令：

```bash
docker compose -f deployments/compose/docker-compose.yaml up --build
GRAPHSTORE=remote.neo4j  docker compose -f deployments/compose/docker-compose.yaml --profile neo4j up --build
GRAPHSTORE=remote.memgraph docker compose -f deployments/compose/docker-compose.yaml --profile memgraph up --build
```

图库在 Docker 中、UModel 本地 dev：

```bash
make graph-db-up && GRAPHSTORE=remote.neo4j make dev
make graph-db-up && GRAPHSTORE=remote.memgraph make dev
```

可选 `.env` 方式（将 `deployments/compose/.env.example` 复制到仓库根目录 `.env`）：

```bash
COMPOSE_PROFILES=memgraph
GRAPHSTORE=remote.memgraph
docker compose -f deployments/compose/docker-compose.yaml up --build
```

## 端口与数据

| 配置 | 默认值 | 说明 |
|---|---|---|
| API port | `18080` | `http://localhost:18080` |
| Neo4j Browser | `7474` | `http://localhost:7474` |
| Neo4j Bolt | `7687` | 容器内 UModel 使用 `bolt://neo4j:7687` |
| Memgraph Bolt | `7688` | 宿主机 `bolt://localhost:7688`，容器内 `bolt://memgraph:7687` |
| Neo4j 密码 | `itree.123456` | 通过 `NEO4J_PASSWORD` 覆盖 |
| Data directory | `/data` | Compose 中挂载到 `umodel-data` volume。除 `memory` 外都会写入 `workspaces.json`。 |
| GraphStore provider | `file.memory` | 通过 `GRAPHSTORE` 选择 `remote.neo4j` 或 `remote.memgraph`。 |

## 导入 Demo

```bash
go run ./cmd/umctl --addr http://localhost:18080 workspace create demo '{"name":"Demo"}'
curl -X POST http://localhost:18080/api/v1/samples/demo/multi-domain-quickstart:import \
  -H 'Content-Type: application/json' \
  -d '{}'
go run ./cmd/umctl --addr http://localhost:18080 query run demo ".umodel | limit 5"
```
