# 扩展点

English: [Extension Points](../../en/architecture/extension-points.md)

UModel 支持贡献者扩展模型包、Schema kind、Provider、客户端和查询能力，同时保持公共契约稳定。


## Model Packs

模型包是最安全的第一类贡献路径。每个模型包包含：

- EntitySet 定义。
- DataSet 定义。
- Link 定义。
- Storage 定义。
- 可选的小规模 `entities.json` 和 `relations.json`。
- 包含场景、资产和查询的 README。

参考：[examples/quickstart-multidomain](../../../examples/quickstart-multidomain/README.zh-CN.md)。

## Schema Kinds

Schema 源文件位于 [schemas/](../../../schemas)。

新增或修改 schema kind 时：

1. 更新 schema YAML。
2. 必要时注册到 `schemas/manifest.yaml`。
3. 执行 `make expand` 重新生成资产。
4. 执行 `make doc` 重新生成 schema 文档。
5. 更新概念和参考文档。
6. 执行 `make verify`。

## GraphStore Providers

Provider 应保持：

- Workspace 隔离。
- UModel element 写入和读取。
- Entity 与 Relation 写入。
- `.umodel`、`.entity`、`.topo` 查询语义。
- Explain 中展示 active provider。

参考：

- [GraphStore Providers](../graphstore-providers.md)
- [图数据库支持与扩展指南](../guides/graph-database-extension.md)

## Query 能力

Query 改动通常涉及：

- `internal/query/grammar`。
- Parser、planner、executor、explain output。
- Provider pushdown 或 graph operation 行为。
- CLI examples。
- Web UI query examples。
- AgentGateway query tools。
- [Query Service 指南](../guides/query-service.md)。

边界规则不变：领域读取通过 Query Service。

## 公共 API 与 SDK

REST contract 变化时：

1. 更新 [api/openapi/openapi.yaml](../../../api/openapi/openapi.yaml)。
2. 更新 server routes 和 tests。
3. 更新 SDK clients 或生成 SDK 期望。
4. 更新 CLI 和 Web UI。
5. 更新文档和示例。

最小 Go REST client 位于 [sdk/go/service](../../../sdk/go/service)。

## Web UI

Web UI 应只使用公开 REST API，不依赖服务端内部包或私有前端包。新增功能时：

- 使用 OpenAPI-backed 或已有 REST endpoint。
- 读取保持在 Query Service 后面。
- 模型写入、实体写入、关系写入保持显式。
- 导航或 API 使用变化时更新 [Web UI 架构](../ui-architecture.md) 和 [Web UI API 对照](../ui-api.md)。

## 贡献清单

- Public contract 已更新。
- Tests 已更新。
- 用户可见行为变化时，example data 已更新。
- Docs 在同一个 pull request 中更新。
- `make guard` 通过。
- 相关 service、SDK 或 UI verification 通过。
