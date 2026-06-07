package cypherdb_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/alibaba/UnifiedModel/internal/graphstore"
	"github.com/alibaba/UnifiedModel/internal/graphstore/provider/cypherdb"
	"github.com/alibaba/UnifiedModel/pkg/model"
)

func TestNeo4jProviderConformance(t *testing.T) {
	runConformance(t, graphstore.ProviderTypeNeo4j, "UMODEL_TEST_NEO4J", map[string]string{
		"uri":      envOr("UMODEL_NEO4J_URI", "bolt://localhost:7687"),
		"username": envOr("UMODEL_NEO4J_USERNAME", "neo4j"),
		"password": envOr("UMODEL_NEO4J_PASSWORD", "itree.123456"),
		"database": envOr("UMODEL_NEO4J_DATABASE", "neo4j"),
	})
}

func TestMemgraphProviderConformance(t *testing.T) {
	runConformance(t, graphstore.ProviderTypeMemgraph, "UMODEL_TEST_MEMGRAPH", map[string]string{
		"uri":      envOr("UMODEL_MEMGRAPH_URI", "bolt://localhost:7688"),
		"username": envOr("UMODEL_MEMGRAPH_USERNAME", ""),
		"password": envOr("UMODEL_MEMGRAPH_PASSWORD", ""),
	})
}

func runConformance(t *testing.T, providerType, envKey string, options map[string]string) {
	t.Helper()
	if os.Getenv(envKey) != "1" {
		t.Skipf("set %s=1 and start the graph database via deployments/compose/graph-databases.compose.yaml", envKey)
	}

	provider, err := cypherdb.NewProvider(providerType, graphstore.ProviderConfig{Options: options})
	if err != nil {
		t.Fatalf("new provider: %v", err)
	}
	defer func() { _ = provider.Close(context.Background()) }()

	ctx := context.Background()
	workspace := "demo-" + providerType
	if err := provider.OpenWorkspace(ctx, model.WorkspaceMetadata{ID: workspace}); err != nil {
		t.Fatalf("open workspace: %v", err)
	}
	if err := provider.EnsureSchema(ctx, workspace); err != nil {
		t.Fatalf("ensure schema: %v", err)
	}
	if health, err := provider.Health(ctx); err != nil || health.Status != "ok" {
		t.Fatalf("health: %+v err=%v", health, err)
	}

	write, err := provider.PutUModelElements(ctx, model.UModelElementBatch{
		Workspace: workspace,
		Elements: []model.UModelElement{{
			Kind:    "entity_set",
			Domain:  "apm",
			Name:    "apm.service",
			Version: "v1",
			Spec: map[string]any{
				"display_name": "APM Service",
			},
		}},
	})
	if err != nil || write.Accepted != 1 {
		t.Fatalf("put umodel: %+v err=%v", write, err)
	}

	if _, err := provider.WriteEntities(ctx, model.EntityWriteBatch{
		Workspace: workspace,
		Entities:  []model.EntityPayload{entity("54013ba69c196820e56801f1ef5aad54")},
	}); err != nil {
		t.Fatalf("write entity: %v", err)
	}
	if _, err := provider.WriteRelations(ctx, model.RelationWriteBatch{
		Workspace: workspace,
		Relations: []model.RelationPayload{relation("54013ba69c196820e56801f1ef5aad54", "177627f91af678a9b03e993f1a91917f")},
	}); err != nil {
		t.Fatalf("write relation: %v", err)
	}

	from := time.Unix(150, 0)
	to := time.Unix(180, 0)
	entityRows, err := provider.QueryEntities(ctx, model.EntityQueryPlan{
		Workspace: workspace,
		Filters:   map[string]any{"domain": "apm", "name": "apm.*", "ids": []string{"54013ba69c196820e56801f1ef5aad54"}, "query": "cart service"},
		TimeRange: model.TimeRange{From: &from, To: &to},
		Limit:     10,
	})
	if err != nil {
		t.Fatalf("query entity: %v", err)
	}
	if len(entityRows.Rows) != 1 {
		t.Fatalf("expected one entity row, got %+v", entityRows.Rows)
	}

	topoRows, err := provider.QueryTopo(ctx, model.TopoQueryPlan{
		Workspace: workspace,
		Filters:   map[string]any{"relation_type": "calls"},
		TimeRange: model.TimeRange{From: &from, To: &to},
		Limit:     10,
	})
	if err != nil {
		t.Fatalf("query topo: %v", err)
	}
	if len(topoRows.Rows) != 1 {
		t.Fatalf("expected one topo row, got %+v", topoRows.Rows)
	}
}

func entity(id string) model.EntityPayload {
	displayName := id + " service"
	if id == "54013ba69c196820e56801f1ef5aad54" {
		displayName = "cart service"
	}
	return model.EntityPayload{
		"__domain__":              "apm",
		"__entity_type__":         "apm.service",
		"__entity_id__":           id,
		"__method__":              "Update",
		"__first_observed_time__": int64(100),
		"__last_observed_time__":  int64(200),
		"__keep_alive_seconds__":  int64(60),
		"display_name":            displayName,
	}
}

func relation(src, dest string) model.RelationPayload {
	return model.RelationPayload{
		"__src_domain__":          "apm",
		"__src_entity_type__":     "apm.service",
		"__src_entity_id__":       src,
		"__dest_domain__":         "apm",
		"__dest_entity_type__":    "apm.service",
		"__dest_entity_id__":      dest,
		"__relation_type__":       "calls",
		"__method__":              "Update",
		"__first_observed_time__": int64(100),
		"__last_observed_time__":  int64(200),
		"__keep_alive_seconds__":  int64(60),
		"weight":                  "critical",
	}
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
