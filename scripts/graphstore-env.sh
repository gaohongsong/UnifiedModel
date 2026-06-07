#!/usr/bin/env bash

# Apply local defaults for remote GraphStore providers.
# Matches deployments/compose/graph-databases.compose.yaml.

configure_graphstore_env() {
  case "${GRAPHSTORE:-}" in
    remote.neo4j)
      export UMODEL_NEO4J_URI="${UMODEL_NEO4J_URI:-bolt://localhost:7687}"
      export UMODEL_NEO4J_USERNAME="${UMODEL_NEO4J_USERNAME:-neo4j}"
      export UMODEL_NEO4J_PASSWORD="${UMODEL_NEO4J_PASSWORD:-itree.123456}"
      export UMODEL_NEO4J_DATABASE="${UMODEL_NEO4J_DATABASE:-neo4j}"
      ;;
    remote.memgraph)
      export UMODEL_MEMGRAPH_URI="${UMODEL_MEMGRAPH_URI:-bolt://localhost:7688}"
      export UMODEL_MEMGRAPH_USERNAME="${UMODEL_MEMGRAPH_USERNAME:-}"
      export UMODEL_MEMGRAPH_PASSWORD="${UMODEL_MEMGRAPH_PASSWORD:-}"
      ;;
  esac
}

graphstore_startup_hint() {
  case "${GRAPHSTORE:-}" in
    remote.neo4j)
      echo "Remote GraphStore: Neo4j at ${UMODEL_NEO4J_URI} (user=${UMODEL_NEO4J_USERNAME})."
      echo "Start local Neo4j with: make graph-db-up"
      ;;
    remote.memgraph)
      echo "Remote GraphStore: Memgraph at ${UMODEL_MEMGRAPH_URI}."
      echo "Start local Memgraph with: make graph-db-up"
      ;;
  esac
}
