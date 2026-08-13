package bootstrap

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/alibaba/UnifiedModel/internal/graphstore"
	"github.com/alibaba/UnifiedModel/pkg/model"
)

func TestFileMemoryAppPersistsWorkspaceMetadata(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()

	first := NewFileMemoryApp(root)
	if _, err := first.Workspace.CreateWorkspace(ctx, model.CreateWorkspaceRequest{ID: "demo", Name: "Demo"}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	second := NewFileMemoryApp(root)
	page, err := second.Workspace.ListWorkspaces(ctx, model.WorkspaceListRequest{})
	if err != nil {
		t.Fatalf("list workspaces: %v", err)
	}
	if len(page.Items) != 1 || page.Items[0].ID != "demo" || page.Items[0].Name != "Demo" {
		t.Fatalf("expected persisted demo workspace, got %+v", page.Items)
	}
}

func TestLadybugAppPersistsWorkspaceMetadata(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()

	first, err := NewAppWithGraphStore(root, graphstore.ProviderConfig{Type: graphstore.ProviderTypeLadybug, DataRoot: root})
	if err != nil {
		t.Fatalf("new ladybug app: %v", err)
	}
	if _, err := first.Workspace.CreateWorkspace(ctx, model.CreateWorkspaceRequest{ID: "demo", Name: "Demo"}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	second, err := NewAppWithGraphStore(root, graphstore.ProviderConfig{Type: graphstore.ProviderTypeLadybug, DataRoot: root})
	if err != nil {
		t.Fatalf("reopen ladybug app: %v", err)
	}
	page, err := second.Workspace.ListWorkspaces(ctx, model.WorkspaceListRequest{})
	if err != nil {
		t.Fatalf("list workspaces: %v", err)
	}
	if len(page.Items) != 1 || page.Items[0].ID != "demo" || page.Items[0].Name != "Demo" {
		t.Fatalf("expected persisted demo workspace, got %+v", page.Items)
	}
}

func TestLadybugAppRecoversWorkspaceMetadataFromDataRoot(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "instances", "demo", "storage", "graph", "local", "ladybug"), 0o755); err != nil {
		t.Fatalf("create ladybug workspace dir: %v", err)
	}

	app, err := NewAppWithGraphStore(root, graphstore.ProviderConfig{Type: graphstore.ProviderTypeLadybug, DataRoot: root})
	if err != nil {
		t.Fatalf("new ladybug app: %v", err)
	}
	page, err := app.Workspace.ListWorkspaces(ctx, model.WorkspaceListRequest{})
	if err != nil {
		t.Fatalf("list workspaces: %v", err)
	}
	if len(page.Items) != 1 || page.Items[0].ID != "demo" || page.Items[0].Name != "demo" {
		t.Fatalf("expected recovered demo workspace, got %+v", page.Items)
	}
}

func TestRemoteMemgraphUsesPersistentWorkspaceMetadata(t *testing.T) {
	assertWorkspaceServicePersists(t, graphstore.ProviderTypeMemgraph)
}

func TestRemoteNeo4jUsesPersistentWorkspaceMetadata(t *testing.T) {
	assertWorkspaceServicePersists(t, graphstore.ProviderTypeNeo4j)
}

func TestMemoryAppDoesNotPersistWorkspaceMetadata(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()

	first, err := NewAppWithGraphStore(root, graphstore.ProviderConfig{
		Type:     graphstore.ProviderTypeMemory,
		DataRoot: root,
	})
	if err != nil {
		t.Fatalf("new memory app: %v", err)
	}
	if _, err := first.Workspace.CreateWorkspace(ctx, model.CreateWorkspaceRequest{ID: "demo", Name: "Demo"}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	second, err := NewAppWithGraphStore(root, graphstore.ProviderConfig{
		Type:     graphstore.ProviderTypeMemory,
		DataRoot: root,
	})
	if err != nil {
		t.Fatalf("reopen memory app: %v", err)
	}
	page, err := second.Workspace.ListWorkspaces(ctx, model.WorkspaceListRequest{})
	if err != nil {
		t.Fatalf("list workspaces: %v", err)
	}
	if len(page.Items) != 0 {
		t.Fatalf("memory provider should not persist workspace metadata, got %+v", page.Items)
	}
}

func assertWorkspaceServicePersists(t *testing.T, providerType string) {
	t.Helper()
	ctx := context.Background()
	root := t.TempDir()

	first, err := newWorkspaceService(root, providerType)
	if err != nil {
		t.Fatalf("new workspace service: %v", err)
	}
	if _, err := first.CreateWorkspace(ctx, model.CreateWorkspaceRequest{ID: "demo", Name: "Demo"}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	second, err := newWorkspaceService(root, providerType)
	if err != nil {
		t.Fatalf("reopen workspace service: %v", err)
	}
	page, err := second.ListWorkspaces(ctx, model.WorkspaceListRequest{})
	if err != nil {
		t.Fatalf("list workspaces: %v", err)
	}
	if len(page.Items) != 1 || page.Items[0].ID != "demo" || page.Items[0].Name != "Demo" {
		t.Fatalf("expected persisted demo workspace for provider %s, got %+v", providerType, page.Items)
	}
}
