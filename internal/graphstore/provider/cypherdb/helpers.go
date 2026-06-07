package cypherdb

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/alibaba/UnifiedModel/internal/cypher"
	"github.com/alibaba/UnifiedModel/internal/graphstore"
	"github.com/alibaba/UnifiedModel/pkg/model"
	neo4j "github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

func recordRows(ctx context.Context, result neo4j.ResultWithContext) ([]map[string]any, error) {
	rows := []map[string]any{}
	for result.Next(ctx) {
		record := result.Record()
		row := map[string]any{}
		for _, key := range record.Keys {
			value, ok := record.Get(key)
			if !ok {
				continue
			}
			row[key] = neo4jValue(value)
		}
		rows = append(rows, row)
	}
	if err := result.Err(); err != nil {
		return nil, err
	}
	return rows, nil
}

func neo4jValue(value any) any {
	switch typed := value.(type) {
	case neo4j.Node:
		return typed.GetProperties()
	case neo4j.Relationship:
		return typed.GetProperties()
	case neo4j.Path:
		return typed
	default:
		return typed
	}
}

func entityPayloadFromRow(row map[string]any) model.EntityPayload {
	payload := map[string]any{}
	if raw := asString(row["properties"]); raw != "" {
		_ = json.Unmarshal([]byte(raw), &payload)
	}
	payload["__domain__"] = firstNonEmpty(asString(payload["__domain__"]), asString(row["domain"]))
	payload["__entity_type__"] = firstNonEmpty(asString(payload["__entity_type__"]), asString(row["entity_type"]))
	payload["__entity_id__"] = firstNonEmpty(asString(payload["__entity_id__"]), asString(row["entity_id"]))
	payload["__method__"] = firstNonEmpty(asString(payload["__method__"]), asString(row["method"]), "Update")
	payload["__first_observed_time__"] = firstPresent(payload["__first_observed_time__"], row["first_observed_time"])
	payload["__last_observed_time__"] = firstPresent(payload["__last_observed_time__"], row["last_observed_time"])
	payload["__keep_alive_seconds__"] = firstPresent(payload["__keep_alive_seconds__"], row["keep_alive_seconds"])
	payload["__deleted__"] = asBool(firstPresent(payload["__deleted__"], row["deleted"]))
	return model.EntityPayload(payload)
}

func relationPayloadFromRow(row map[string]any) model.RelationPayload {
	payload := map[string]any{}
	if raw := asString(row["properties"]); raw != "" {
		_ = json.Unmarshal([]byte(raw), &payload)
	}
	src := strings.Split(asString(row["src"]), "/")
	dest := strings.Split(asString(row["dest"]), "/")
	if len(src) == 3 {
		payload["__src_domain__"], payload["__src_entity_type__"], payload["__src_entity_id__"] = src[0], src[1], src[2]
	}
	if len(dest) == 3 {
		payload["__dest_domain__"], payload["__dest_entity_type__"], payload["__dest_entity_id__"] = dest[0], dest[1], dest[2]
	}
	payload["__relation_type__"] = firstNonEmpty(asString(payload["__relation_type__"]), asString(row["relation"]))
	payload["__method__"] = firstNonEmpty(asString(payload["__method__"]), asString(row["method"]), "Update")
	payload["__first_observed_time__"] = firstPresent(payload["__first_observed_time__"], row["first_observed_time"])
	payload["__last_observed_time__"] = firstPresent(payload["__last_observed_time__"], row["last_observed_time"])
	payload["__keep_alive_seconds__"] = firstPresent(payload["__keep_alive_seconds__"], row["keep_alive_seconds"])
	payload["__deleted__"] = asBool(firstPresent(payload["__deleted__"], row["deleted"]))
	return model.RelationPayload(payload)
}

func buildCypherGraph(entities map[string]model.EntityPayload, relations map[string]model.RelationPayload, plan model.TopoQueryPlan) cypher.Graph {
	nodes := map[string]cypher.Node{}
	entityKeys := sortedKeys(entities)
	for _, key := range entityKeys {
		payload := entities[key]
		if !graphstore.EntityMatches(payload, plan) {
			continue
		}
		nodes[key] = cypher.Node{
			ID:         key,
			Labels:     graphstore.EntityLabels(payload),
			Properties: cloneMap(map[string]any(payload)),
		}
	}

	edges := []cypher.Edge{}
	relationKeys := sortedKeys(relations)
	for _, key := range relationKeys {
		payload := relations[key]
		if !graphstore.RelationMatches(payload, plan) {
			continue
		}
		src := relationEndpoint(payload, "src")
		dest := relationEndpoint(payload, "dest")
		if _, ok := nodes[src]; !ok {
			nodePayload := graphstore.EntityPayloadFromRelation(payload, "src")
			nodes[src] = cypher.Node{ID: src, Labels: graphstore.EntityLabels(nodePayload), Properties: cloneMap(map[string]any(nodePayload))}
		}
		if _, ok := nodes[dest]; !ok {
			nodePayload := graphstore.EntityPayloadFromRelation(payload, "dest")
			nodes[dest] = cypher.Node{ID: dest, Labels: graphstore.EntityLabels(nodePayload), Properties: cloneMap(map[string]any(nodePayload))}
		}
		edges = append(edges, cypher.Edge{
			ID:         key,
			From:       src,
			To:         dest,
			Type:       asString(payload["__relation_type__"]),
			Properties: cloneMap(map[string]any(payload)),
		})
	}
	return cypher.Graph{Nodes: nodes, Edges: edges}
}

func relationEndpoint(payload model.RelationPayload, side string) string {
	return strings.Join([]string{
		asString(payload["__"+side+"_domain__"]),
		asString(payload["__"+side+"_entity_type__"]),
		asString(payload["__"+side+"_entity_id__"]),
	}, "/")
}

func sortedKeys[T any](values map[string]T) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func cloneMap(source map[string]any) map[string]any {
	if source == nil {
		return map[string]any{}
	}
	cloned := make(map[string]any, len(source))
	for key, value := range source {
		cloned[key] = value
	}
	return cloned
}

func asString(value any) string {
	if value == nil {
		return ""
	}
	return fmt.Sprint(value)
}

func asBool(value any) bool {
	switch typed := value.(type) {
	case bool:
		return typed
	case string:
		return strings.EqualFold(typed, "true")
	default:
		return false
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func firstPresent(values ...any) any {
	for _, value := range values {
		if value != nil && asString(value) != "" {
			return value
		}
	}
	return nil
}

func capabilities() model.GraphStoreCapabilities {
	return model.GraphStoreCapabilities{
		EntitySearch:       true,
		GraphMatch:         true,
		GraphCallNeighbors: true,
		ControlledCypher:   true,
		TimeVisibility:     true,
		ServerSideFilter:   false,
		MaxDepth:           10,
		MaxLimit:           1000,
		Timeout:            "60s",
	}
}
