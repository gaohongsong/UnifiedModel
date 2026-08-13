package cypherdb

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	"github.com/alibaba/UnifiedModel/internal/cypher"
	"github.com/alibaba/UnifiedModel/internal/graphstore"
	"github.com/alibaba/UnifiedModel/pkg/contract"
	apperrors "github.com/alibaba/UnifiedModel/pkg/errors"
	"github.com/alibaba/UnifiedModel/pkg/model"
	neo4j "github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

type Provider struct {
	config        Config
	driver        neo4j.DriverWithContext
	mu            sync.Mutex
	schemaReady   map[string]bool
	openedWorkspaces map[string]struct{}
}

func NewProvider(providerType string, config graphstore.ProviderConfig) (*Provider, error) {
	parsed, err := ParseConfig(providerType, config)
	if err != nil {
		return nil, err
	}
	auth := neo4j.BasicAuth(parsed.Username, parsed.Password, "")
	driver, err := neo4j.NewDriverWithContext(parsed.URI, auth)
	if err != nil {
		return nil, err
	}
	return &Provider{
		config:           parsed,
		driver:           driver,
		schemaReady:      make(map[string]bool),
		openedWorkspaces: make(map[string]struct{}),
	}, nil
}

func (p *Provider) Close(ctx context.Context) error {
	if p.driver == nil {
		return nil
	}
	return p.driver.Close(ctx)
}

func (p *Provider) OpenWorkspace(ctx context.Context, workspace model.WorkspaceMetadata) error {
	if workspace.ID == "" {
		return fmt.Errorf("workspace id is required")
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	p.openedWorkspaces[workspace.ID] = struct{}{}
	return nil
}

func (p *Provider) EnsureSchema(ctx context.Context, workspace string) error {
	p.mu.Lock()
	if p.schemaReady[workspace] {
		p.mu.Unlock()
		return nil
	}
	p.mu.Unlock()

	statements := []string{
		`CREATE INDEX IF NOT EXISTS FOR (n:UModelNode) ON (n.workspace, n.key)`,
		`CREATE INDEX IF NOT EXISTS FOR (e:Entity) ON (e.workspace, e.entity_key)`,
	}
	for _, statement := range statements {
		if err := p.runWrite(ctx, workspace, statement, nil); err != nil {
			// Memgraph and older engines may reject IF NOT EXISTS index syntax.
			_ = err
		}
	}

	p.mu.Lock()
	p.schemaReady[workspace] = true
	p.mu.Unlock()
	return nil
}

func (p *Provider) PutUModelElements(ctx context.Context, batch model.UModelElementBatch) (model.WriteResult, error) {
	if err := p.EnsureSchema(ctx, batch.Workspace); err != nil {
		return model.WriteResult{}, err
	}
	items := make([]model.BatchItemResult, 0, len(batch.Elements))
	for _, element := range batch.Elements {
		key := model.UModelElementKey(element)
		spec, _ := json.Marshal(element.Spec)
		err := p.runWrite(ctx, batch.Workspace, `
MERGE (n:UModelNode {workspace: $workspace, key: $key})
SET n.kind = $kind, n.domain = $domain, n.name = $name, n.version = $version, n.spec = $spec
`, map[string]any{
			"workspace": batch.Workspace,
			"key":       key,
			"kind":      element.Kind,
			"domain":    element.Domain,
			"name":      element.Name,
			"version":   element.Version,
			"spec":      string(spec),
		})
		if err != nil {
			return model.WriteResult{}, err
		}
		items = append(items, model.BatchItemResult{ID: key, OK: true})
	}
	return model.WriteResult{Accepted: len(batch.Elements), Items: items}, nil
}

func (p *Provider) DeleteUModelElements(ctx context.Context, workspace string, ids []string) (model.WriteResult, error) {
	items := make([]model.BatchItemResult, 0, len(ids))
	for _, rawID := range ids {
		id := strings.TrimSpace(rawID)
		if id == "" {
			items = append(items, model.BatchItemResult{ID: id, OK: false, Code: string(apperrors.CodeValidationFailed), Message: "umodel element id is required"})
			continue
		}
		rows, err := p.runRead(ctx, workspace, `
MATCH (n:UModelNode {workspace: $workspace, key: $key})
RETURN n.key AS key
LIMIT 1
`, map[string]any{"key": id})
		if err != nil {
			return model.WriteResult{}, err
		}
		if len(rows) == 0 {
			items = append(items, model.BatchItemResult{ID: id, OK: false, Code: string(apperrors.CodeNotFound), Message: "umodel element not found"})
			continue
		}
		if err := p.runWrite(ctx, workspace, `
MATCH (n:UModelNode {workspace: $workspace, key: $key})
DETACH DELETE n
`, map[string]any{"key": id}); err != nil {
			return model.WriteResult{}, err
		}
		items = append(items, model.BatchItemResult{ID: id, OK: true})
	}
	return summarizeItems(items), nil
}

func (p *Provider) GetUModelSnapshot(ctx context.Context, req model.UModelSnapshotRequest) (model.UModelSnapshot, error) {
	rows, err := p.runRead(ctx, req.Workspace, `
MATCH (n:UModelNode {workspace: $workspace})
RETURN n.kind AS kind, n.domain AS domain, n.name AS name, n.version AS version, n.spec AS spec
ORDER BY n.key
`, map[string]any{"workspace": req.Workspace})
	if err != nil {
		return model.UModelSnapshot{}, err
	}
	elements := make([]model.UModelElement, 0, len(rows))
	for _, row := range rows {
		spec := map[string]any{}
		_ = json.Unmarshal([]byte(asString(row["spec"])), &spec)
		elements = append(elements, model.UModelElement{
			Kind:    asString(row["kind"]),
			Domain:  asString(row["domain"]),
			Name:    asString(row["name"]),
			Version: asString(row["version"]),
			Spec:    spec,
		})
	}
	version := req.Version
	if version == "" {
		version = p.config.ProviderType
	}
	return model.UModelSnapshot{Workspace: req.Workspace, Version: version, Elements: elements}, nil
}

func (p *Provider) WriteEntities(ctx context.Context, batch model.EntityWriteBatch) (model.WriteResult, error) {
	if err := p.EnsureSchema(ctx, batch.Workspace); err != nil {
		return model.WriteResult{}, err
	}
	existing, err := p.loadEntities(ctx, batch.Workspace)
	if err != nil {
		return model.WriteResult{}, err
	}

	items := make([]model.BatchItemResult, 0, len(batch.Entities))
	for _, payload := range batch.Entities {
		key := graphstore.EntityKey(payload)
		method := methodOf(payload)
		current, exists := existing[key]

		switch method {
		case "Create":
			if exists && !asBool(current["__deleted__"]) {
				items = append(items, model.BatchItemResult{ID: key, OK: false, Code: string(apperrors.CodeAlreadyExists), Message: "entity already exists"})
				continue
			}
			next := cloneEntityPayload(payload)
			next["__deleted__"] = false
			existing[key] = next
		case "Delete":
			if !exists {
				items = append(items, model.BatchItemResult{ID: key, OK: false, Code: string(apperrors.CodeNotFound), Message: "entity not found"})
				continue
			}
			next := cloneEntityPayload(current)
			applyLifecycle(next, payload, "Delete", true)
			existing[key] = next
		case "Expire":
			if !exists {
				items = append(items, model.BatchItemResult{ID: key, OK: false, Code: string(apperrors.CodeNotFound), Message: "entity not found"})
				continue
			}
			next := cloneEntityPayload(current)
			applyLifecycle(next, payload, "Expire", true)
			existing[key] = next
		default:
			next := cloneEntityPayload(payload)
			if exists {
				if first, ok := current["__first_observed_time__"]; ok {
					next["__first_observed_time__"] = first
				}
			}
			next["__deleted__"] = false
			existing[key] = next
		}

		if err := p.persistEntity(ctx, batch.Workspace, existing[key]); err != nil {
			return model.WriteResult{}, err
		}
		items = append(items, model.BatchItemResult{ID: key, OK: true})
	}
	return summarizeItems(items), nil
}

func (p *Provider) WriteRelations(ctx context.Context, batch model.RelationWriteBatch) (model.WriteResult, error) {
	if err := p.EnsureSchema(ctx, batch.Workspace); err != nil {
		return model.WriteResult{}, err
	}
	entities, err := p.loadEntities(ctx, batch.Workspace)
	if err != nil {
		return model.WriteResult{}, err
	}
	relations, err := p.loadRelations(ctx, batch.Workspace)
	if err != nil {
		return model.WriteResult{}, err
	}

	items := make([]model.BatchItemResult, 0, len(batch.Relations))
	for _, payload := range batch.Relations {
		key := graphstore.RelationKey(payload)
		method := methodOf(payload)
		current, exists := relations[key]

		switch method {
		case "Create":
			if exists && !asBool(current["__deleted__"]) {
				items = append(items, model.BatchItemResult{ID: key, OK: false, Code: string(apperrors.CodeAlreadyExists), Message: "relation already exists"})
				continue
			}
			next := cloneRelationPayload(payload)
			next["__deleted__"] = false
			relations[key] = next
		case "Delete":
			if !exists {
				items = append(items, model.BatchItemResult{ID: key, OK: false, Code: string(apperrors.CodeNotFound), Message: "relation not found"})
				continue
			}
			next := cloneRelationPayload(current)
			applyLifecycle(next, payload, "Delete", true)
			relations[key] = next
		case "Expire":
			if !exists {
				items = append(items, model.BatchItemResult{ID: key, OK: false, Code: string(apperrors.CodeNotFound), Message: "relation not found"})
				continue
			}
			next := cloneRelationPayload(current)
			applyLifecycle(next, payload, "Expire", true)
			relations[key] = next
		default:
			next := cloneRelationPayload(payload)
			if exists {
				if first, ok := current["__first_observed_time__"]; ok {
					next["__first_observed_time__"] = first
				}
			}
			next["__deleted__"] = false
			relations[key] = next
		}

		if err := p.ensureRelationEndpoints(ctx, batch.Workspace, entities, relations[key]); err != nil {
			return model.WriteResult{}, err
		}
		if err := p.persistRelation(ctx, batch.Workspace, relations[key]); err != nil {
			return model.WriteResult{}, err
		}
		items = append(items, model.BatchItemResult{ID: key, OK: true})
	}
	return summarizeItems(items), nil
}

func (p *Provider) QueryEntities(ctx context.Context, plan model.EntityQueryPlan) (model.QueryResult, error) {
	entities, err := p.loadEntities(ctx, plan.Workspace)
	if err != nil {
		return model.QueryResult{}, err
	}
	limit := graphstore.BoundedLimit(plan.Limit)
	rows := make([]map[string]any, 0, limit)
	keys := sortedKeys(entities)
	for _, key := range keys {
		payload := entities[key]
		if !graphstore.EntityMatches(payload, plan) {
			continue
		}
		rows = append(rows, graphstore.EntityResultRow(payload))
		if len(rows) == limit {
			break
		}
	}
	return model.QueryResult{
		Columns: []string{"__domain__", "__entity_type__", "__entity_id__", "__method__", "__deleted__"},
		Rows:    rows,
		Page:    model.PageRequest{Limit: limit},
	}, nil
}

func (p *Provider) QueryTopo(ctx context.Context, plan model.TopoQueryPlan) (model.QueryResult, error) {
	if plan.GraphCall != nil && plan.GraphCall.Name == "cypher" {
		return p.queryControlledCypher(ctx, plan)
	}
	relations, err := p.loadRelations(ctx, plan.Workspace)
	if err != nil {
		return model.QueryResult{}, err
	}
	limit := graphstore.BoundedLimit(plan.Limit)
	rows := make([]map[string]any, 0, limit)
	keys := sortedKeys(relations)
	for _, key := range keys {
		payload := relations[key]
		if !graphstore.RelationMatches(payload, plan) {
			continue
		}
		rows = append(rows, graphstore.RelationResultRow(payload))
		if len(rows) == limit {
			break
		}
	}
	return model.QueryResult{
		Columns: []string{"src", "relation", "dest", "__relation_type__", "__deleted__"},
		Rows:    rows,
		Page:    model.PageRequest{Limit: limit},
	}, nil
}

func (p *Provider) Capabilities(ctx context.Context) (model.GraphStoreCapabilities, error) {
	return capabilities(), nil
}

func (p *Provider) Health(ctx context.Context) (model.GraphStoreHealth, error) {
	if err := p.driver.VerifyConnectivity(ctx); err != nil {
		return model.GraphStoreHealth{
			Provider: p.config.ProviderType,
			Status:   "unavailable",
			Message:  err.Error(),
		}, nil
	}
	return model.GraphStoreHealth{Provider: p.config.ProviderType, Status: "ok"}, nil
}

func (p *Provider) queryControlledCypher(ctx context.Context, plan model.TopoQueryPlan) (model.QueryResult, error) {
	if err := cypher.ValidateReadOnly(plan.GraphCall.Cypher); err != nil {
		return model.QueryResult{}, err
	}
	entities, err := p.loadEntities(ctx, plan.Workspace)
	if err != nil {
		return model.QueryResult{}, err
	}
	relations, err := p.loadRelations(ctx, plan.Workspace)
	if err != nil {
		return model.QueryResult{}, err
	}
	limit := graphstore.BoundedLimit(plan.Limit)
	graph := buildCypherGraph(entities, relations, plan)
	result, err := cypher.Execute(plan.GraphCall.Cypher, graph, plan.Params, cypher.Options{Limit: limit})
	if err != nil {
		return model.QueryResult{}, err
	}
	return model.QueryResult{
		Columns: result.Columns,
		Rows:    result.Rows,
		Page:    model.PageRequest{Limit: result.Limit},
	}, nil
}

func (p *Provider) sessionConfig() neo4j.SessionConfig {
	cfg := neo4j.SessionConfig{AccessMode: neo4j.AccessModeWrite}
	if p.config.UseDatabase && p.config.Database != "" {
		cfg.DatabaseName = p.config.Database
	}
	return cfg
}

func (p *Provider) runRead(ctx context.Context, workspace, query string, params map[string]any) ([]map[string]any, error) {
	session := p.driver.NewSession(ctx, p.sessionConfig())
	defer session.Close(ctx)
	if params == nil {
		params = map[string]any{}
	}
	params["workspace"] = workspace
	result, err := session.Run(ctx, query, params)
	if err != nil {
		return nil, err
	}
	return recordRows(ctx, result)
}

func (p *Provider) runWrite(ctx context.Context, workspace, query string, params map[string]any) error {
	session := p.driver.NewSession(ctx, p.sessionConfig())
	defer session.Close(ctx)
	if params == nil {
		params = map[string]any{}
	}
	params["workspace"] = workspace
	_, err := session.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		result, err := tx.Run(ctx, query, params)
		if err != nil {
			return nil, err
		}
		_, err = result.Collect(ctx)
		return nil, err
	})
	return err
}

func (p *Provider) loadEntities(ctx context.Context, workspace string) (map[string]model.EntityPayload, error) {
	rows, err := p.runRead(ctx, workspace, `
MATCH (e:Entity {workspace: $workspace})
RETURN e.entity_key AS entity_key, e.domain AS domain, e.entity_type AS entity_type, e.entity_id AS entity_id,
       e.method AS method, e.first_observed_time AS first_observed_time, e.last_observed_time AS last_observed_time,
       e.keep_alive_seconds AS keep_alive_seconds, e.deleted AS deleted, e.properties AS properties
ORDER BY e.entity_key
`, nil)
	if err != nil {
		return nil, err
	}
	entities := make(map[string]model.EntityPayload, len(rows))
	for _, row := range rows {
		payload := entityPayloadFromRow(row)
		entities[graphstore.EntityKey(payload)] = payload
	}
	return entities, nil
}

func (p *Provider) loadRelations(ctx context.Context, workspace string) (map[string]model.RelationPayload, error) {
	rows, err := p.runRead(ctx, workspace, `
MATCH (s:Entity {workspace: $workspace})-[r:TOPO {workspace: $workspace}]->(d:Entity {workspace: $workspace})
RETURN s.entity_key AS src, r.relation_type AS relation, d.entity_key AS dest,
       r.method AS method, r.first_observed_time AS first_observed_time, r.last_observed_time AS last_observed_time,
       r.keep_alive_seconds AS keep_alive_seconds, r.deleted AS deleted, r.properties AS properties, r.relation_key AS relation_key
ORDER BY r.relation_key
`, nil)
	if err != nil {
		return nil, err
	}
	relations := make(map[string]model.RelationPayload, len(rows))
	for _, row := range rows {
		payload := relationPayloadFromRow(row)
		relations[graphstore.RelationKey(payload)] = payload
	}
	return relations, nil
}

func (p *Provider) persistEntity(ctx context.Context, workspace string, payload model.EntityPayload) error {
	properties, _ := json.Marshal(payload)
	return p.runWrite(ctx, workspace, `
MERGE (e:Entity {workspace: $workspace, entity_key: $entity_key})
SET e.domain = $domain, e.entity_type = $entity_type, e.entity_id = $entity_id, e.method = $method,
    e.first_observed_time = $first_observed_time, e.last_observed_time = $last_observed_time,
    e.keep_alive_seconds = $keep_alive_seconds, e.deleted = $deleted, e.properties = $properties
`, map[string]any{
		"workspace":           workspace,
		"entity_key":          graphstore.EntityKey(payload),
		"domain":              asString(payload["__domain__"]),
		"entity_type":         asString(payload["__entity_type__"]),
		"entity_id":           asString(payload["__entity_id__"]),
		"method":              methodOf(payload),
		"first_observed_time": int64Value(payload["__first_observed_time__"]),
		"last_observed_time":  int64Value(payload["__last_observed_time__"]),
		"keep_alive_seconds":  int64Value(payload["__keep_alive_seconds__"]),
		"deleted":             asBool(payload["__deleted__"]),
		"properties":          string(properties),
	})
}

func (p *Provider) persistRelation(ctx context.Context, workspace string, payload model.RelationPayload) error {
	properties, _ := json.Marshal(payload)
	srcKey := graphstore.EntityKey(graphstore.EntityPayloadFromRelation(payload, "src"))
	destKey := graphstore.EntityKey(graphstore.EntityPayloadFromRelation(payload, "dest"))
	return p.runWrite(ctx, workspace, `
MATCH (s:Entity {workspace: $workspace, entity_key: $src_key})
MATCH (d:Entity {workspace: $workspace, entity_key: $dest_key})
MERGE (s)-[r:TOPO {workspace: $workspace, relation_key: $relation_key}]->(d)
SET r.relation_type = $relation_type, r.method = $method, r.first_observed_time = $first_observed_time,
    r.last_observed_time = $last_observed_time, r.keep_alive_seconds = $keep_alive_seconds,
    r.deleted = $deleted, r.properties = $properties
`, map[string]any{
		"workspace":           workspace,
		"src_key":             srcKey,
		"dest_key":            destKey,
		"relation_key":        graphstore.RelationKey(payload),
		"relation_type":       asString(payload["__relation_type__"]),
		"method":              methodOf(payload),
		"first_observed_time": int64Value(payload["__first_observed_time__"]),
		"last_observed_time":  int64Value(payload["__last_observed_time__"]),
		"keep_alive_seconds":  int64Value(payload["__keep_alive_seconds__"]),
		"deleted":             asBool(payload["__deleted__"]),
		"properties":          string(properties),
	})
}

func (p *Provider) ensureRelationEndpoints(ctx context.Context, workspace string, entities map[string]model.EntityPayload, payload model.RelationPayload) error {
	for _, side := range []string{"src", "dest"} {
		endpoint := graphstore.EntityPayloadFromRelation(payload, side)
		key := graphstore.EntityKey(endpoint)
		if current, ok := entities[key]; ok && !asBool(current["__deleted__"]) {
			continue
		}
		endpoint["__deleted__"] = false
		endpoint["__placeholder_from_topo__"] = true
		if err := p.persistEntity(ctx, workspace, endpoint); err != nil {
			return err
		}
		entities[key] = endpoint
	}
	return nil
}

func methodOf(payload map[string]any) string {
	method := asString(payload["__method__"])
	if method == "" {
		return "Update"
	}
	return method
}

func int64Value(value any) int64 {
	switch typed := value.(type) {
	case int:
		return int64(typed)
	case int64:
		return typed
	case int32:
		return int64(typed)
	case float64:
		return int64(typed)
	case float32:
		return int64(typed)
	default:
		return 0
	}
}

func cloneEntityPayload(payload model.EntityPayload) model.EntityPayload {
	return model.EntityPayload(cloneMap(map[string]any(payload)))
}

func cloneRelationPayload(payload model.RelationPayload) model.RelationPayload {
	return model.RelationPayload(cloneMap(map[string]any(payload)))
}

func applyLifecycle(target map[string]any, source map[string]any, method string, deleted bool) {
	target["__method__"] = method
	target["__deleted__"] = deleted
	for _, field := range []string{"__last_observed_time__", "__keep_alive_seconds__"} {
		if value, ok := source[field]; ok {
			target[field] = value
		}
	}
	if _, ok := target["__first_observed_time__"]; !ok {
		if value, hasValue := source["__first_observed_time__"]; hasValue {
			target["__first_observed_time__"] = value
		}
	}
}

func summarizeItems(items []model.BatchItemResult) model.WriteResult {
	result := model.WriteResult{Items: items}
	for _, item := range items {
		if item.OK {
			result.Accepted++
		} else {
			result.Failed++
		}
	}
	return result
}

var _ contract.GraphStore = (*Provider)(nil)
