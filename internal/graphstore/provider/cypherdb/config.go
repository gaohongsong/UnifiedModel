package cypherdb

import (
	"fmt"
	"os"

	"github.com/alibaba/UnifiedModel/internal/graphstore"
)

type Config struct {
	ProviderType string
	URI          string
	Username     string
	Password     string
	Database     string
	UseDatabase  bool
}

func ParseConfig(providerType string, config graphstore.ProviderConfig) (Config, error) {
	defaultPassword := ""
	if providerType == graphstore.ProviderTypeNeo4j {
		defaultPassword = "itree.123456"
	}
	parsed := Config{
		ProviderType: providerType,
		Username:     optionOrEnv(config, "username", envKey(providerType, "USERNAME"), "neo4j"),
		Password:     optionOrEnv(config, "password", envKey(providerType, "PASSWORD"), defaultPassword),
		Database:     optionOrEnv(config, "database", envKey(providerType, "DATABASE"), "neo4j"),
		UseDatabase:  providerType == graphstore.ProviderTypeNeo4j,
	}
	switch providerType {
	case graphstore.ProviderTypeNeo4j:
		parsed.URI = optionOrEnv(config, "uri", "UMODEL_NEO4J_URI", "bolt://localhost:7687")
	case graphstore.ProviderTypeMemgraph:
		parsed.URI = optionOrEnv(config, "uri", "UMODEL_MEMGRAPH_URI", "bolt://localhost:7688")
	default:
		return Config{}, fmt.Errorf("unsupported cypherdb provider type %q", providerType)
	}
	if parsed.URI == "" {
		return Config{}, fmt.Errorf("%s uri is required", providerType)
	}
	return parsed, nil
}

func optionOrEnv(config graphstore.ProviderConfig, key, envKey, fallback string) string {
	if config.Options != nil {
		if value := config.Options[key]; value != "" {
			return value
		}
	}
	if value := os.Getenv(envKey); value != "" {
		return value
	}
	return fallback
}

func envKey(providerType, suffix string) string {
	switch providerType {
	case graphstore.ProviderTypeNeo4j:
		return "UMODEL_NEO4J_" + suffix
	case graphstore.ProviderTypeMemgraph:
		return "UMODEL_MEMGRAPH_" + suffix
	default:
		return ""
	}
}
