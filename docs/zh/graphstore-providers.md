# GraphStore Providers

English: [GraphStore Providers](../en/graphstore-providers.md)

UModel 通过 `GraphStore` 接口保存和查询 UModel elements、CMS 2.0 实体以及拓扑关系。运行时通过 `--graphstore` 选择 provider。


## Providers

| Provider | 持久化 | 典型用途 |
|---|---|---|
| `memory` | 进程内存 | 快速测试和一次性本地实验，进程退出后数据消失。 |
| `file.memory` | `--data` 下的 JSON 文件 | 本地开发和文档演示的默认选择，重启后数据保留。 |
| `local.ladybug` | Ladybug 数据库文件 | Ladybug-backed 环境，需要 `-tags ladybug` 和本地 Ladybug runtime。 |
| `remote.neo4j` | Neo4j Bolt 远端图库 | 面向多客户端、多副本 UModel 的共享存储。通过 `UMODEL_NEO4J_URI`、`UMODEL_NEO4J_USERNAME`、`UMODEL_NEO4J_PASSWORD` 和可选 `UMODEL_NEO4J_DATABASE` 配置。本地 Compose 默认密码为 `itree.123456`（Neo4j 5 不允许使用 `neo4j` 作为密码）。 |
| `remote.memgraph` | Memgraph Bolt 远端图库 | 与 `remote.neo4j` 使用相同 GraphStore 契约。通过 `UMODEL_MEMGRAPH_URI` 和可选凭据配置。 |

启动示例：

```bash
go run ./cmd/umodel-server --addr :8080 --data data --graphstore file.memory
```

当前 provider 位置：

- `GET /healthz` 的 `graphstore.provider`
- Query explain 的 `provider` 和 `storage_provider`

## `file.memory` 布局

`file.memory` 将数据保存在：

```text
<data-root>/graphstore/file-memory/
└── workspaces/
    └── demo/
        ├── umodels.json
        ├── entities.json
        └── relations.json
```

Workspace 元数据单独保存在：

```text
<data-root>/workspaces.json
```

## 边界

- `file.memory` 面向单本地进程，不要让多个 writer 写同一个目录。
- JSON 文件服务于检查和演示，不是长期兼容性存储合约。
- 运行时读取仍通过 Query Service，不应绕过 `.umodel`、`.entity`、`.topo`。

## 烟测

```bash
go run ./cmd/umodel-server --addr :8080 --data /tmp/umodel-demo --graphstore file.memory
go run ./cmd/umctl --addr http://localhost:8080 umodel put demo '{"id":"devops.service","kind":"entity_set","domain":"devops","name":"devops.service"}'
go run ./cmd/umctl --addr http://localhost:8080 query run demo ".umodel | limit 5"
find /tmp/umodel-demo/graphstore/file-memory -maxdepth 4 -type f
```

## 远端 Provider 本地烟测

启动本地 Neo4j 与 Memgraph：

```bash
make graph-db-up
```

运行 provider 合规测试：

```bash
make test-graph-db
```

使用 Neo4j 启动 UModel（`make dev` / `make deploy` 会自动套用与 Compose 一致的本地默认凭据）：

```bash
GRAPHSTORE=remote.neo4j make dev
```

停止图数据库：

```bash
make graph-db-down
```

## 扩展与图数据库选型

新增 GraphStore 后端，或比较面向中小规模的开源图数据库，见 [图数据库支持与扩展指南](guides/graph-database-extension.md)。
