package graphstore

import "github.com/alibaba/UnifiedModel/pkg/model"

func EntityMatches(payload model.EntityPayload, plan model.QueryPlan) bool {
	return entityMatches(payload, plan)
}

func RelationMatches(payload model.RelationPayload, plan model.QueryPlan) bool {
	return relationMatches(payload, plan)
}

func EntityResultRow(payload model.EntityPayload) map[string]any {
	return entityRow(payload)
}

func RelationResultRow(payload model.RelationPayload) map[string]any {
	return relationRow(payload)
}

func EntityLabels(payload model.EntityPayload) []string {
	return entityLabels(payload)
}

func EntityPayloadFromRelation(payload model.RelationPayload, side string) model.EntityPayload {
	return entityPayloadFromRelation(payload, side)
}

func BoundedLimit(limit int) int {
	if limit <= 0 {
		return 100
	}
	if limit > 1000 {
		return 1000
	}
	return limit
}
