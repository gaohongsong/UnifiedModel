package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"umodel_go_cli/service"
)

func main() {
	addr := flag.String("addr", "http://localhost:8080", "UModel API base URL")
	workspace := flag.String("workspace", "sdk-demo", "workspace id to create or reuse")
	pack := flag.String("pack", "", "model pack path; defaults to the repository multi-domain quickstart example")
	flag.Parse()

	modelPack := *pack
	if modelPack == "" {
		var err error
		modelPack, err = defaultModelPackPath()
		if err != nil {
			fmt.Fprintf(os.Stderr, "resolve default model pack: %v\n", err)
			os.Exit(1)
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	client := service.NewClient(*addr)
	if _, err := client.CreateWorkspace(ctx, service.CreateWorkspaceRequest{
		ID:          *workspace,
		Name:        "SDK Demo",
		Description: "Workspace created by examples/sdk/go/service-quickstart.",
	}); err != nil {
		if !isAlreadyExists(err) {
			fmt.Fprintf(os.Stderr, "create workspace: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("Workspace %q already exists; reusing it.\n", *workspace)
	} else {
		fmt.Printf("Workspace %q created.\n", *workspace)
	}

	imported, err := client.ImportUModel(ctx, *workspace, service.UModelImportRequest{Path: modelPack})
	if err != nil {
		fmt.Fprintf(os.Stderr, "import model pack: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Imported %d UModel elements from %s.\n", imported.Imported, imported.Source)

	result, err := client.Query(ctx, *workspace, service.QueryRequest{
		Query: ".umodel with(kind='entity_set') | limit 5",
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "query workspace: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Query returned %d rows with columns %v.\n", len(result.Rows), result.Columns)

	discovery, err := client.Discover(ctx, *workspace)
	if err != nil {
		fmt.Fprintf(os.Stderr, "discover agent surface: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Agent discovery: %d tools, %d resources, %d next actions.\n", len(discovery.Tools), len(discovery.Resources), len(discovery.NextActions))
}

func isAlreadyExists(err error) bool {
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "409") || strings.Contains(message, "already") || strings.Contains(message, "exist")
}

func defaultModelPackPath() (string, error) {
	wd, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		candidate := filepath.Join(wd, "examples", "quickstart-multidomain")
		if info, err := os.Stat(candidate); err == nil && info.IsDir() {
			return candidate, nil
		}
		parent := filepath.Dir(wd)
		if parent == wd {
			return "", fmt.Errorf("could not find examples/quickstart-multidomain above current directory")
		}
		wd = parent
	}
}
