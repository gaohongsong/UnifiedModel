package memgraph

import (
	"github.com/alibaba/UnifiedModel/internal/graphstore"
	"github.com/alibaba/UnifiedModel/internal/graphstore/provider/cypherdb"
	"github.com/alibaba/UnifiedModel/pkg/contract"
)

func init() {
	graphstore.RegisterProvider(graphstore.ProviderTypeMemgraph, func(config graphstore.ProviderConfig) (contract.GraphStore, error) {
		return cypherdb.NewProvider(graphstore.ProviderTypeMemgraph, config)
	})
}
