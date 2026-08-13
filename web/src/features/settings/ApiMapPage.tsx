import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Editor from '@monaco-editor/react'
import { AlertCircle, BookOpen, Braces, Play, Search, ServerCog } from 'lucide-react'
import { UModelApi } from '../../api/client'
import { Badge, Button, TextInput } from '../../design/components'
import { useI18n, type MessageKey, type TFunction } from '../../i18n'
import { stringify } from '../../lib/json'
import { disableMonacoEditContext } from '../../lib/preloadMonaco'
import './apiDebugger.css'

disableMonacoEditContext()

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'
type ParamLocation = 'path' | 'query'
type RiskLevel = 'read' | 'write' | 'danger'
type ApiGroup = 'system' | 'workspace' | 'query' | 'umodel' | 'samples' | 'entityStore' | 'agent'

interface ApiParam {
  name: string
  in: ParamLocation
  required?: boolean
  type: string
  description: string
  defaultValue?: string
}

interface FieldDoc {
  name: string
  type: string
  required?: boolean
  description: string
}

interface ApiSpec {
  id: string
  group: ApiGroup
  titleKey: MessageKey
  method: HttpMethod
  path: string
  descriptionKey: MessageKey
  risk: RiskLevel
  params: ApiParam[]
  bodyFields?: FieldDoc[]
  responseFields: FieldDoc[]
  defaultBody?: (workspaceId: string) => unknown
}

interface ApiResult {
  method: HttpMethod
  url: string
  status: number
  statusText: string
  ok: boolean
  durationMs: number
  payload: unknown
}

const sampleServiceAId = '10000000000000000000000000000101'
const sampleServiceBId = '10000000000000000000000000000102'
const sampleDomain = 'devops'
const sampleEntityType = 'devops.service'
const sampleRelationType = 'calls'

const groupLabelKeys = {
  system: 'apiDebugger.group.system',
  workspace: 'apiDebugger.group.workspace',
  query: 'apiDebugger.group.query',
  umodel: 'apiDebugger.group.umodel',
  samples: 'apiDebugger.group.samples',
  entityStore: 'apiDebugger.group.entityStore',
  agent: 'apiDebugger.group.agent',
} as const satisfies Record<ApiGroup, MessageKey>

const docDescriptionKeys: Record<string, MessageKey> = {
  'Active graphstore provider.': 'apiDebugger.doc.activeGraphstoreProvider',
  'Allow partial acceptance when some rows fail.': 'apiDebugger.doc.allowPartialAcceptanceWhenSomeRowsFail',
  'Backing graphstore provider.': 'apiDebugger.doc.backingGraphstoreProvider',
  'Bundled sample name.': 'apiDebugger.doc.bundledSampleName',
  'Callable tool metadata.': 'apiDebugger.doc.callableToolMetadata',
  'Column names.': 'apiDebugger.doc.columnNames',
  'Creation timestamp.': 'apiDebugger.doc.creationTimestamp',
  'Cursor for the next page.': 'apiDebugger.doc.cursorForTheNextPage',
  'Custom config to merge or replace.': 'apiDebugger.doc.customConfigToMergeOrReplace',
  'Display name.': 'apiDebugger.doc.displayName',
  'Effective limit.': 'apiDebugger.doc.effectiveLimit',
  'Element IDs to delete.': 'apiDebugger.doc.elementIdsToDelete',
  'Elements to validate.': 'apiDebugger.doc.elementsToValidate',
  'Elements to write.': 'apiDebugger.doc.elementsToWrite',
  'Entity rows to write.': 'apiDebugger.doc.entityRowsToWrite',
  'Entity write result.': 'apiDebugger.doc.entityWriteResult',
  'Executed tool name.': 'apiDebugger.doc.executedToolName',
  'Graphstore health status.': 'apiDebugger.doc.graphstoreHealthStatus',
  'Grouped custom configuration.': 'apiDebugger.doc.groupedCustomConfiguration',
  'Import source path.': 'apiDebugger.doc.importSourcePath',
  'Imported element count.': 'apiDebugger.doc.importedElementCount',
  'Imported elements when returned.': 'apiDebugger.doc.importedElementsWhenReturned',
  'Imported entity count.': 'apiDebugger.doc.importedEntityCount',
  'Imported relation count.': 'apiDebugger.doc.importedRelationCount',
  'Labels to merge or replace.': 'apiDebugger.doc.labelsToMergeOrReplace',
  'Last update timestamp.': 'apiDebugger.doc.lastUpdateTimestamp',
  'Maximum items returned by this page.': 'apiDebugger.doc.maximumItemsReturnedByThisPage',
  'Named query parameters.': 'apiDebugger.doc.namedQueryParameters',
  'New description.': 'apiDebugger.doc.newDescription',
  'New display name.': 'apiDebugger.doc.newDisplayName',
  'Number of accepted items.': 'apiDebugger.doc.numberOfAcceptedItems',
  'Number of rejected items.': 'apiDebugger.doc.numberOfRejectedItems',
  'Operations evaluated outside provider pushdown.': 'apiDebugger.doc.operationsEvaluatedOutsideProviderPushdown',
  'Operations pushed into the provider.': 'apiDebugger.doc.operationsPushedIntoTheProvider',
  'Optimistic concurrency version.': 'apiDebugger.doc.optimisticConcurrencyVersion',
  'Optional audit reason.': 'apiDebugger.doc.optionalAuditReason',
  'Optional common schema packs.': 'apiDebugger.doc.optionalCommonSchemaPacks',
  'Optional description.': 'apiDebugger.doc.optionalDescription',
  'Optional execution timeout.': 'apiDebugger.doc.optionalExecutionTimeout',
  'Optional from/to timestamps for temporal entity and topology reads.': 'apiDebugger.doc.optionalFromToTimestampsForTemporalEntityAndTopologyReads',
  'Optional from/to timestamps.': 'apiDebugger.doc.optionalFromToTimestamps',
  'Optional idempotency key.': 'apiDebugger.doc.optionalIdempotencyKey',
  'Optional optimistic concurrency version.': 'apiDebugger.doc.optionalOptimisticConcurrencyVersion',
  'Optional result limit.': 'apiDebugger.doc.optionalResultLimit',
  'Optional workspace description.': 'apiDebugger.doc.optionalWorkspaceDescription',
  'Overall server status.': 'apiDebugger.doc.overallServerStatus',
  'Pagination cursor returned by a previous response.': 'apiDebugger.doc.paginationCursorReturnedByAPreviousResponse',
  'Per-item result details, including validation errors when present.': 'apiDebugger.doc.perItemResultDetailsIncludingValidationErrorsWhenPresent',
  'Planned source such as .umodel, .entity, or .topo.': 'apiDebugger.doc.plannedSourceSuchAsUmodelEntityOrTopo',
  'Provider health detail when available.': 'apiDebugger.doc.providerHealthDetailWhenAvailable',
  'Provider response status.': 'apiDebugger.doc.providerResponseStatus',
  'Query provider.': 'apiDebugger.doc.queryProvider',
  'Readable metadata resources.': 'apiDebugger.doc.readableMetadataResources',
  'Relation rows to write.': 'apiDebugger.doc.relationRowsToWrite',
  'Relation write result.': 'apiDebugger.doc.relationWriteResult',
  'Resource URI from discovery.': 'apiDebugger.doc.resourceUriFromDiscovery',
  'Resource URI.': 'apiDebugger.doc.resourceUri',
  'Resource payload.': 'apiDebugger.doc.resourcePayload',
  'Response code.': 'apiDebugger.doc.responseCode',
  'Response message.': 'apiDebugger.doc.responseMessage',
  'Returned content MIME type.': 'apiDebugger.doc.returnedContentMimeType',
  'Rows as matrices aligned with header.': 'apiDebugger.doc.rowsAsMatricesAlignedWithHeader',
  'SPL query text.': 'apiDebugger.doc.splQueryText',
  'Sample name.': 'apiDebugger.doc.sampleName',
  'Server-readable file or directory path.': 'apiDebugger.doc.serverReadableFileOrDirectoryPath',
  'Server-side storage paths.': 'apiDebugger.doc.serverSideStoragePaths',
  'Set true to include conflicted workspace identities.': 'apiDebugger.doc.setTrueToIncludeConflictedWorkspaceIdentities',
  'Set true to include tombstoned workspaces.': 'apiDebugger.doc.setTrueToIncludeTombstonedWorkspaces',
  'Skipped element count.': 'apiDebugger.doc.skippedElementCount',
  'Stable entity IDs to expire.': 'apiDebugger.doc.stableEntityIdsToExpire',
  'Stable relation IDs to expire.': 'apiDebugger.doc.stableRelationIdsToExpire',
  'String key-value labels.': 'apiDebugger.doc.stringKeyValueLabels',
  'Suggested actions.': 'apiDebugger.doc.suggestedActions',
  'Tool arguments matching its input_schema.': 'apiDebugger.doc.toolArgumentsMatchingItsInputSchema',
  'Tool error payload.': 'apiDebugger.doc.toolErrorPayload',
  'Tool name from discovery.': 'apiDebugger.doc.toolNameFromDiscovery',
  'Tool output.': 'apiDebugger.doc.toolOutput',
  'UModel import result.': 'apiDebugger.doc.umodelImportResult',
  'Validation details.': 'apiDebugger.doc.validationDetails',
  'Validation or import errors.': 'apiDebugger.doc.validationOrImportErrors',
  'When true, replace all custom config instead of merging.': 'apiDebugger.doc.whenTrueReplaceAllCustomConfigInsteadOfMerging',
  'When true, replace all labels instead of merging.': 'apiDebugger.doc.whenTrueReplaceAllLabelsInsteadOfMerging',
  'Whether all elements are valid.': 'apiDebugger.doc.whetherAllElementsAreValid',
  'Whether execution succeeded.': 'apiDebugger.doc.whetherExecutionSucceeded',
  'Whether the query completed successfully.': 'apiDebugger.doc.whetherTheQueryCompletedSuccessfully',
  'Workspace ID.': 'apiDebugger.doc.workspaceId',
  'Workspace ID. Must match the server ID pattern.': 'apiDebugger.doc.workspaceIdMustMatchTheServerIdPattern',
  'Workspace ID. The debugger fills it from the current workspace by default.': 'apiDebugger.doc.workspaceIdFilledFromCurrentWorkspace',
  'Workspace identifier.': 'apiDebugger.doc.workspaceIdentifier',
  'Workspace records.': 'apiDebugger.doc.workspaceRecords',
  'active, deleted, or conflicted.': 'apiDebugger.doc.activeDeletedOrConflicted',
}

const workspaceParam: ApiParam = {
  name: 'workspace',
  in: 'path',
  required: true,
  type: 'string',
  description: 'Workspace ID. The debugger fills it from the current workspace by default.',
}

const writeResultFields: FieldDoc[] = [
  { name: 'accepted', type: 'number', required: true, description: 'Number of accepted items.' },
  { name: 'failed', type: 'number', required: true, description: 'Number of rejected items.' },
  { name: 'items', type: 'array', description: 'Per-item result details, including validation errors when present.' },
]

const workspaceMetadataFields: FieldDoc[] = [
  { name: 'id', type: 'string', required: true, description: 'Workspace identifier.' },
  { name: 'name', type: 'string', required: true, description: 'Display name.' },
  { name: 'description', type: 'string', description: 'Optional workspace description.' },
  { name: 'labels', type: 'object', description: 'String key-value labels.' },
  { name: 'config', type: 'object', description: 'Grouped custom configuration.' },
  { name: 'paths', type: 'object', required: true, description: 'Server-side storage paths.' },
  { name: 'status', type: 'string', required: true, description: 'active, deleted, or conflicted.' },
  { name: 'resource_version', type: 'number', required: true, description: 'Optimistic concurrency version.' },
  { name: 'created_at', type: 'string', required: true, description: 'Creation timestamp.' },
  { name: 'updated_at', type: 'string', required: true, description: 'Last update timestamp.' },
]

const apiSpecs: ApiSpec[] = [
  {
    id: 'health',
    group: 'system',
    titleKey: 'apiDebugger.api.health.title',
    method: 'GET',
    path: '/healthz',
    descriptionKey: 'apiDebugger.api.health.description',
    risk: 'read',
    params: [],
    responseFields: [
      { name: 'status', type: 'string', required: true, description: 'Overall server status.' },
      { name: 'graphstore.provider', type: 'string', required: true, description: 'Active graphstore provider.' },
      { name: 'graphstore.status', type: 'string', required: true, description: 'Graphstore health status.' },
      { name: 'graphstore.message', type: 'string', description: 'Provider health detail when available.' },
    ],
  },
  {
    id: 'workspace-list',
    group: 'workspace',
    titleKey: 'apiDebugger.api.workspaceList.title',
    method: 'GET',
    path: '/api/v1/workspaces',
    descriptionKey: 'apiDebugger.api.workspaceList.description',
    risk: 'read',
    params: [
      { name: 'page_size', in: 'query', type: 'number', description: 'Maximum items returned by this page.', defaultValue: '100' },
      { name: 'page_token', in: 'query', type: 'string', description: 'Pagination cursor returned by a previous response.' },
      { name: 'include_deleted', in: 'query', type: 'boolean', description: 'Set true to include tombstoned workspaces.' },
      { name: 'include_conflicts', in: 'query', type: 'boolean', description: 'Set true to include conflicted workspace identities.' },
    ],
    responseFields: [
      { name: 'items', type: 'WorkspaceMetadata[]', required: true, description: 'Workspace records.' },
      { name: 'next_token', type: 'string', description: 'Cursor for the next page.' },
    ],
  },
  {
    id: 'workspace-create',
    group: 'workspace',
    titleKey: 'apiDebugger.api.workspaceCreate.title',
    method: 'POST',
    path: '/api/v1/workspaces',
    descriptionKey: 'apiDebugger.api.workspaceCreate.description',
    risk: 'write',
    params: [],
    bodyFields: [
      { name: 'id', type: 'string', required: true, description: 'Workspace ID. Must match the server ID pattern.' },
      { name: 'name', type: 'string', description: 'Display name.' },
      { name: 'description', type: 'string', description: 'Optional description.' },
      { name: 'labels', type: 'object', description: 'String key-value labels.' },
      { name: 'config', type: 'object', description: 'Grouped custom configuration.' },
    ],
    defaultBody: () => ({ id: 'demo-api', name: 'Demo API', description: '', labels: { env: 'local' }, config: {} }),
    responseFields: workspaceMetadataFields,
  },
  {
    id: 'workspace-get',
    group: 'workspace',
    titleKey: 'apiDebugger.api.workspaceGet.title',
    method: 'GET',
    path: '/api/v1/workspaces/{workspace}',
    descriptionKey: 'apiDebugger.api.workspaceGet.description',
    risk: 'read',
    params: [workspaceParam],
    responseFields: workspaceMetadataFields,
  },
  {
    id: 'workspace-update',
    group: 'workspace',
    titleKey: 'apiDebugger.api.workspaceUpdate.title',
    method: 'PUT',
    path: '/api/v1/workspaces/{workspace}',
    descriptionKey: 'apiDebugger.api.workspaceUpdate.description',
    risk: 'write',
    params: [workspaceParam],
    bodyFields: [
      { name: 'name', type: 'string', description: 'New display name.' },
      { name: 'description', type: 'string', description: 'New description.' },
      { name: 'labels', type: 'object', description: 'Labels to merge or replace.' },
      { name: 'config', type: 'object', description: 'Custom config to merge or replace.' },
      { name: 'if_match_version', type: 'number', description: 'Optional optimistic concurrency version.' },
      { name: 'replace_labels', type: 'boolean', description: 'When true, replace all labels instead of merging.' },
      { name: 'replace_config', type: 'boolean', description: 'When true, replace all custom config instead of merging.' },
    ],
    defaultBody: () => ({ labels: { env: 'local' }, config: {}, replace_labels: false, replace_config: false }),
    responseFields: workspaceMetadataFields,
  },
  {
    id: 'workspace-delete',
    group: 'workspace',
    titleKey: 'apiDebugger.api.workspaceDelete.title',
    method: 'DELETE',
    path: '/api/v1/workspaces/{workspace}',
    descriptionKey: 'apiDebugger.api.workspaceDelete.description',
    risk: 'danger',
    params: [workspaceParam],
    responseFields: workspaceMetadataFields,
  },
  {
    id: 'query-execute',
    group: 'query',
    titleKey: 'apiDebugger.api.queryExecute.title',
    method: 'POST',
    path: '/api/v1/query/{workspace}/execute',
    descriptionKey: 'apiDebugger.api.queryExecute.description',
    risk: 'read',
    params: [workspaceParam],
    bodyFields: [
      { name: 'query', type: 'string', required: true, description: 'SPL query text.' },
      { name: 'limit', type: 'number', description: 'Optional result limit.' },
      { name: 'timeout_ms', type: 'number', description: 'Optional execution timeout.' },
      { name: 'time_range', type: 'object', description: 'Optional from/to timestamps for temporal entity and topology reads.' },
      { name: 'parameters', type: 'object', description: 'Named query parameters.' },
    ],
    defaultBody: () => ({ query: '.umodel | limit 1000', limit: 1000 }),
    responseFields: [
      { name: 'code', type: 'string', required: true, description: 'Response code.' },
      { name: 'message', type: 'string', required: true, description: 'Response message.' },
      { name: 'success', type: 'boolean', required: true, description: 'Whether the query completed successfully.' },
      { name: 'data.header', type: 'string[]', required: true, description: 'Column names.' },
      { name: 'data.data', type: 'array[]', required: true, description: 'Rows as matrices aligned with header.' },
      { name: 'data.responseStatus', type: 'object', required: true, description: 'Provider response status.' },
    ],
  },
  {
    id: 'query-explain',
    group: 'query',
    titleKey: 'apiDebugger.api.queryExplain.title',
    method: 'POST',
    path: '/api/v1/query/{workspace}/explain',
    descriptionKey: 'apiDebugger.api.queryExplain.description',
    risk: 'read',
    params: [workspaceParam],
    bodyFields: [
      { name: 'query', type: 'string', required: true, description: 'SPL query text.' },
      { name: 'limit', type: 'number', description: 'Optional result limit.' },
      { name: 'timeout_ms', type: 'number', description: 'Optional execution timeout.' },
      { name: 'time_range', type: 'object', description: 'Optional from/to timestamps.' },
      { name: 'parameters', type: 'object', description: 'Named query parameters.' },
    ],
    defaultBody: () => ({ query: '.topo | limit 1000', limit: 1000 }),
    responseFields: [
      { name: 'source', type: 'string', description: 'Planned source such as .umodel, .entity, or .topo.' },
      { name: 'provider', type: 'string', description: 'Query provider.' },
      { name: 'storage_provider', type: 'string', description: 'Backing graphstore provider.' },
      { name: 'pushdown', type: 'string[]', description: 'Operations pushed into the provider.' },
      { name: 'fallback', type: 'string[]', description: 'Operations evaluated outside provider pushdown.' },
      { name: 'limit', type: 'number', description: 'Effective limit.' },
    ],
  },
  {
    id: 'umodel-import',
    group: 'umodel',
    titleKey: 'apiDebugger.api.umodelImport.title',
    method: 'POST',
    path: '/api/v1/umodel/{workspace}/import',
    descriptionKey: 'apiDebugger.api.umodelImport.description',
    risk: 'write',
    params: [workspaceParam],
    bodyFields: [
      { name: 'path', type: 'string', required: true, description: 'Server-readable file or directory path.' },
      { name: 'common_schema_packs', type: 'string[]', description: 'Optional common schema packs.' },
    ],
    defaultBody: () => ({ path: 'examples/umodel', common_schema_packs: [] }),
    responseFields: [
      { name: 'workspace', type: 'string', required: true, description: 'Workspace ID.' },
      { name: 'source', type: 'string', required: true, description: 'Import source path.' },
      { name: 'imported', type: 'number', required: true, description: 'Imported element count.' },
      { name: 'skipped', type: 'number', required: true, description: 'Skipped element count.' },
      { name: 'elements', type: 'UModelElement[]', description: 'Imported elements when returned.' },
      { name: 'errors', type: 'ErrorDetail[]', description: 'Validation or import errors.' },
    ],
  },
  {
    id: 'umodel-validate',
    group: 'umodel',
    titleKey: 'apiDebugger.api.umodelValidate.title',
    method: 'POST',
    path: '/api/v1/umodel/{workspace}/validate',
    descriptionKey: 'apiDebugger.api.umodelValidate.description',
    risk: 'read',
    params: [workspaceParam],
    bodyFields: [
      { name: 'elements', type: 'UModelElement[]', required: true, description: 'Elements to validate.' },
    ],
    defaultBody: () => ({ elements: [sampleUModelElement()] }),
    responseFields: [
      { name: 'valid', type: 'boolean', required: true, description: 'Whether all elements are valid.' },
      { name: 'errors', type: 'ErrorDetail[]', description: 'Validation details.' },
    ],
  },
  {
    id: 'umodel-write',
    group: 'umodel',
    titleKey: 'apiDebugger.api.umodelWrite.title',
    method: 'POST',
    path: '/api/v1/umodel/{workspace}/elements',
    descriptionKey: 'apiDebugger.api.umodelWrite.description',
    risk: 'write',
    params: [workspaceParam],
    bodyFields: [
      { name: 'elements', type: 'UModelElement[]', required: true, description: 'Elements to write.' },
    ],
    defaultBody: () => ({ elements: [sampleUModelElement()] }),
    responseFields: writeResultFields,
  },
  {
    id: 'umodel-delete',
    group: 'umodel',
    titleKey: 'apiDebugger.api.umodelDelete.title',
    method: 'DELETE',
    path: '/api/v1/umodel/{workspace}/elements',
    descriptionKey: 'apiDebugger.api.umodelDelete.description',
    risk: 'danger',
    params: [workspaceParam],
    bodyFields: [
      { name: 'ids', type: 'string[]', required: true, description: 'Element IDs to delete.' },
    ],
    defaultBody: () => ({ ids: ['devops.service'] }),
    responseFields: writeResultFields,
  },
  {
    id: 'sample-import',
    group: 'samples',
    titleKey: 'apiDebugger.api.sampleImport.title',
    method: 'POST',
    path: '/api/v1/samples/{workspace}/{sample}:import',
    descriptionKey: 'apiDebugger.api.sampleImport.description',
    risk: 'write',
    params: [
      workspaceParam,
      { name: 'sample', in: 'path', required: true, type: 'string', description: 'Bundled sample name.', defaultValue: 'multi-domain-quickstart' },
    ],
    responseFields: [
      { name: 'workspace', type: 'string', required: true, description: 'Workspace ID.' },
      { name: 'sample', type: 'string', required: true, description: 'Sample name.' },
      { name: 'umodel', type: 'UModelImportResult', required: true, description: 'UModel import result.' },
      { name: 'entities', type: 'WriteResult', required: true, description: 'Entity write result.' },
      { name: 'relations', type: 'WriteResult', required: true, description: 'Relation write result.' },
      { name: 'entity_count', type: 'number', required: true, description: 'Imported entity count.' },
      { name: 'relation_count', type: 'number', required: true, description: 'Imported relation count.' },
    ],
  },
  {
    id: 'entities-write',
    group: 'entityStore',
    titleKey: 'apiDebugger.api.entitiesWrite.title',
    method: 'POST',
    path: '/api/v1/entitystore/{workspace}/entities:write',
    descriptionKey: 'apiDebugger.api.entitiesWrite.description',
    risk: 'write',
    params: [workspaceParam],
    bodyFields: [
      { name: 'entities', type: 'object[]', required: true, description: 'Entity rows to write.' },
      { name: 'idempotency_key', type: 'string', description: 'Optional idempotency key.' },
      { name: 'partial_success', type: 'boolean', description: 'Allow partial acceptance when some rows fail.' },
    ],
    defaultBody: () => ({ entities: sampleEntities() }),
    responseFields: writeResultFields,
  },
  {
    id: 'entities-expire',
    group: 'entityStore',
    titleKey: 'apiDebugger.api.entitiesExpire.title',
    method: 'POST',
    path: '/api/v1/entitystore/{workspace}/entities:expire',
    descriptionKey: 'apiDebugger.api.entitiesExpire.description',
    risk: 'write',
    params: [workspaceParam],
    bodyFields: [
      { name: 'ids', type: 'string[]', required: true, description: 'Stable entity IDs to expire.' },
      { name: 'reason', type: 'string', description: 'Optional audit reason.' },
    ],
    defaultBody: () => ({ ids: [`${sampleDomain}/${sampleEntityType}/${sampleServiceAId}`], reason: 'manual debug' }),
    responseFields: writeResultFields,
  },
  {
    id: 'relations-write',
    group: 'entityStore',
    titleKey: 'apiDebugger.api.relationsWrite.title',
    method: 'POST',
    path: '/api/v1/entitystore/{workspace}/relations:write',
    descriptionKey: 'apiDebugger.api.relationsWrite.description',
    risk: 'write',
    params: [workspaceParam],
    bodyFields: [
      { name: 'relations', type: 'object[]', required: true, description: 'Relation rows to write.' },
      { name: 'idempotency_key', type: 'string', description: 'Optional idempotency key.' },
      { name: 'partial_success', type: 'boolean', description: 'Allow partial acceptance when some rows fail.' },
    ],
    defaultBody: () => ({ relations: sampleRelations() }),
    responseFields: writeResultFields,
  },
  {
    id: 'relations-expire',
    group: 'entityStore',
    titleKey: 'apiDebugger.api.relationsExpire.title',
    method: 'POST',
    path: '/api/v1/entitystore/{workspace}/relations:expire',
    descriptionKey: 'apiDebugger.api.relationsExpire.description',
    risk: 'write',
    params: [workspaceParam],
    bodyFields: [
      { name: 'ids', type: 'string[]', required: true, description: 'Stable relation IDs to expire.' },
      { name: 'reason', type: 'string', description: 'Optional audit reason.' },
    ],
    defaultBody: () => ({ ids: [`${sampleDomain}/${sampleEntityType}/${sampleServiceAId}/${sampleRelationType}/${sampleDomain}/${sampleEntityType}/${sampleServiceBId}`], reason: 'manual debug' }),
    responseFields: writeResultFields,
  },
  {
    id: 'agent-discover',
    group: 'agent',
    titleKey: 'apiDebugger.api.agentDiscover.title',
    method: 'GET',
    path: '/api/v1/agent/{workspace}/discover',
    descriptionKey: 'apiDebugger.api.agentDiscover.description',
    risk: 'read',
    params: [workspaceParam],
    responseFields: [
      { name: 'workspace', type: 'string', required: true, description: 'Workspace ID.' },
      { name: 'tools', type: 'AgentTool[]', required: true, description: 'Callable tool metadata.' },
      { name: 'resources', type: 'AgentResource[]', required: true, description: 'Readable metadata resources.' },
      { name: 'next_actions', type: 'AgentNextAction[]', description: 'Suggested actions.' },
    ],
  },
  {
    id: 'agent-resource',
    group: 'agent',
    titleKey: 'apiDebugger.api.agentResource.title',
    method: 'POST',
    path: '/api/v1/agent/{workspace}/resources:read',
    descriptionKey: 'apiDebugger.api.agentResource.description',
    risk: 'read',
    params: [workspaceParam],
    bodyFields: [
      { name: 'uri', type: 'string', required: true, description: 'Resource URI from discovery.' },
    ],
    defaultBody: (workspaceId) => ({ uri: `umodel://workspace/${workspaceId}/overview` }),
    responseFields: [
      { name: 'uri', type: 'string', required: true, description: 'Resource URI.' },
      { name: 'mime_type', type: 'string', required: true, description: 'Returned content MIME type.' },
      { name: 'content', type: 'unknown', required: true, description: 'Resource payload.' },
    ],
  },
  {
    id: 'agent-tool',
    group: 'agent',
    titleKey: 'apiDebugger.api.agentTool.title',
    method: 'POST',
    path: '/api/v1/agent/{workspace}/tools:execute',
    descriptionKey: 'apiDebugger.api.agentTool.description',
    risk: 'write',
    params: [workspaceParam],
    bodyFields: [
      { name: 'name', type: 'string', required: true, description: 'Tool name from discovery.' },
      { name: 'arguments', type: 'object', required: true, description: 'Tool arguments matching its input_schema.' },
    ],
    defaultBody: () => ({ name: 'query_spl_execute', arguments: { query: '.umodel | limit 1000' } }),
    responseFields: [
      { name: 'name', type: 'string', required: true, description: 'Executed tool name.' },
      { name: 'ok', type: 'boolean', required: true, description: 'Whether execution succeeded.' },
      { name: 'output', type: 'unknown', description: 'Tool output.' },
      { name: 'error', type: 'unknown', description: 'Tool error payload.' },
    ],
  },
]

export function ApiMapPage({ api, workspaceId }: { api: UModelApi; workspaceId: string }) {
  const { t } = useI18n()
  const [selectedId, setSelectedId] = useState(apiSpecs[0].id)
  const [filter, setFilter] = useState('')
  const [pathParams, setPathParams] = useState<Record<string, string>>({})
  const [queryParams, setQueryParams] = useState<Record<string, string>>({})
  const [bodyText, setBodyText] = useState('')
  const [result, setResult] = useState<ApiResult | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const selected = apiSpecs.find((spec) => spec.id === selectedId) || apiSpecs[0]
  const filteredSpecs = useMemo(() => filterSpecs(apiSpecs, filter, t), [filter, t])
  const requestPath = buildPath(selected.path, pathParams)
  const requestUrl = buildUrl(requestPath, selected.params, queryParams)
  const pathDocs = selected.params.filter((param) => param.in === 'path')
  const queryDocs = selected.params.filter((param) => param.in === 'query')
  const hasBody = Boolean(selected.bodyFields)
  const selectedTitle = t(selected.titleKey)
  const selectedDescription = t(selected.descriptionKey)

  useEffect(() => {
    const draft = buildInitialDraft(selected, workspaceId)
    setPathParams(draft.path)
    setQueryParams(draft.query)
    setBodyText(draft.body)
    setResult(null)
    setError('')
  }, [selected.id, workspaceId])

  async function run() {
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const started = performance.now()
      const payload = hasBody && bodyText.trim() ? JSON.parse(bodyText) : undefined
      const response = await fetch(`${api.baseUrl}${requestUrl}`, {
        method: selected.method,
        headers: payload === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      })
      const contentType = response.headers.get('content-type') || ''
      const responsePayload = contentType.includes('application/json') ? await response.json() : await response.text()
      setResult({
        method: selected.method,
        url: requestUrl,
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        durationMs: Math.max(1, Math.round(performance.now() - started)),
        payload: responsePayload,
      })
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : String(nextError)
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="api-debugger">
      <header className="api-debug-head">
        <div className="api-debug-title">
          <ServerCog size={17} />
          <strong>{t('apiDebugger.title')}</strong>
          <Badge tone="indigo">{t('apiDebugger.apiCount', { count: apiSpecs.length })}</Badge>
        </div>
        <div className="api-debug-head-actions">
          <span className="api-debug-endpoint">
            <MethodBadge method={selected.method} />
            <code>{requestUrl}</code>
          </span>
          <Button className="api-debug-run" variant="primary" onClick={() => void run()} disabled={busy}>
            <Play size={14} />
            {t('apiDebugger.call')}
          </Button>
        </div>
      </header>

      {error && (
        <div className="api-debug-error">
          <AlertCircle size={15} />
          <span>{error}</span>
        </div>
      )}

      <div className="api-debug-layout">
        <aside className="api-debug-sidebar">
          <div className="api-debug-search">
            <Search size={14} />
            <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={t('apiDebugger.searchPlaceholder')} />
          </div>
          <div className="api-debug-list">
            {groupSpecs(filteredSpecs).map(([group, specs]) => (
              <section key={group} className="api-debug-group">
                <div className="api-debug-group-title">{t(groupLabelKeys[group])}</div>
                {specs.map((spec) => (
                  <button
                    key={spec.id}
                    className={spec.id === selected.id ? 'active' : ''}
                    onClick={() => setSelectedId(spec.id)}
                    type="button"
                  >
                    <span>
                      <MethodBadge method={spec.method} compact />
                      <strong>{t(spec.titleKey)}</strong>
                    </span>
                    <small>{spec.path}</small>
                  </button>
                ))}
              </section>
            ))}
          </div>
        </aside>

        <section className="api-debug-request">
          <div className="api-debug-card-header">
            <div>
              <strong>{selectedTitle}</strong>
              <span>{selectedDescription}</span>
            </div>
            <RiskBadge risk={selected.risk} t={t} />
          </div>

          <div className="api-debug-request-line">
            <MethodBadge method={selected.method} />
            <code>{requestUrl}</code>
          </div>

          <ParamEditor
            title={t('apiDebugger.pathParams')}
            empty={t('apiDebugger.noPathParams')}
            params={pathDocs}
            values={pathParams}
            t={t}
            requiredLabel={t('apiDebugger.required')}
            onChange={(name, value) => setPathParams((current) => ({ ...current, [name]: value }))}
          />
          <ParamEditor
            title={t('apiDebugger.queryParams')}
            empty={t('apiDebugger.noQueryParams')}
            params={queryDocs}
            values={queryParams}
            t={t}
            requiredLabel={t('apiDebugger.required')}
            onChange={(name, value) => setQueryParams((current) => ({ ...current, [name]: value }))}
          />

          {hasBody && (
            <section className="api-debug-section api-debug-body-section">
              <SectionTitle icon={<Braces size={14} />} title={t('apiDebugger.requestBody')} />
              <div className="api-debug-request-json">
                <MonacoBlock value={bodyText} language="json" height="100%" onChange={setBodyText} />
              </div>
              <FieldDocTable fields={selected.bodyFields || []} t={t} requiredLabel={t('apiDebugger.required')} />
            </section>
          )}
        </section>

        <section className="api-debug-response">
          <div className="api-debug-card-header">
            <div>
              <strong>{t('apiDebugger.response')}</strong>
              <span>{result ? `${result.status} ${result.statusText || ''} · ${result.durationMs}ms` : t('apiDebugger.responseEmpty')}</span>
            </div>
            {result && <Badge tone={result.ok ? 'success' : 'danger'}>{result.ok ? t('apiDebugger.status.ok') : t('apiDebugger.status.error')}</Badge>}
          </div>

          <div className="api-debug-response-json">
            <MonacoBlock
              value={result ? stringify(result.payload) : '{}'}
              language="json"
              height="100%"
              readOnly
            />
          </div>

          <section className="api-debug-section api-debug-output-section">
            <SectionTitle icon={<BookOpen size={14} />} title={t('apiDebugger.outputFields')} />
            <FieldDocTable fields={selected.responseFields} t={t} requiredLabel={t('apiDebugger.responseRequired')} />
          </section>
        </section>
      </div>
    </div>
  )
}

function ParamEditor({
  title,
  empty,
  params,
  values,
  t,
  requiredLabel,
  onChange,
}: {
  title: string
  empty: string
  params: ApiParam[]
  values: Record<string, string>
  t: TFunction
  requiredLabel: string
  onChange: (name: string, value: string) => void
}) {
  return (
    <section className="api-debug-section">
      <SectionTitle title={title} />
      {params.length === 0 ? (
        <div className="api-debug-empty-line">{empty}</div>
      ) : (
        <div className="api-debug-param-grid">
          {params.map((param) => (
            <label key={`${param.in}-${param.name}`} className="api-debug-param-field">
              <span>
                <strong>{param.name}</strong>
                <em>{param.type}{param.required ? ` · ${requiredLabel}` : ''}</em>
              </span>
              <TextInput value={values[param.name] || ''} onChange={(event) => onChange(param.name, event.target.value)} />
              <small>{docDescription(t, param.description)}</small>
            </label>
          ))}
        </div>
      )}
    </section>
  )
}

function FieldDocTable({ fields, t, requiredLabel }: { fields: FieldDoc[]; t: TFunction; requiredLabel: string }) {
  return (
    <div className="api-debug-doc-table-wrap">
      <table className="om-table api-debug-doc-table">
        <thead>
          <tr>
            <th>{t('apiDebugger.field')}</th>
            <th>{t('apiDebugger.type')}</th>
            <th>{t('apiDebugger.description')}</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field.name}>
              <td>
                <code>{field.name}</code>
                {field.required && <span className="api-debug-required">{requiredLabel}</span>}
              </td>
              <td>{field.type}</td>
              <td>{docDescription(t, field.description)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SectionTitle({ icon, title }: { icon?: ReactNode; title: string }) {
  return (
    <div className="api-debug-section-title">
      {icon}
      <span>{title}</span>
    </div>
  )
}

function MethodBadge({ method, compact = false }: { method: HttpMethod; compact?: boolean }) {
  return <span className={`api-debug-method method-${method.toLowerCase()} ${compact ? 'compact' : ''}`}>{method}</span>
}

function RiskBadge({ risk, t }: { risk: RiskLevel; t: TFunction }) {
  if (risk === 'read') return <Badge>{t('apiDebugger.risk.read')}</Badge>
  if (risk === 'write') return <Badge tone="warning">{t('apiDebugger.risk.write')}</Badge>
  return <Badge tone="danger">{t('apiDebugger.risk.danger')}</Badge>
}

function docDescription(t: TFunction, description: string) {
  const key = docDescriptionKeys[description]
  return key ? t(key) : description
}

function MonacoBlock({
  value,
  language,
  height,
  readOnly = false,
  onChange,
}: {
  value: string
  language: string
  height: number | string
  readOnly?: boolean
  onChange?: (value: string) => void
}) {
  return (
    <div className="api-debug-monaco" style={{ height }}>
      <Editor
        value={value}
        language={language}
        theme="vs"
        onChange={(nextValue) => {
          if (!readOnly) onChange?.(nextValue || '')
        }}
        options={{
          accessibilitySupport: 'off',
          automaticLayout: true,
          domReadOnly: readOnly,
          fontFamily: 'var(--om-mono)',
          fontSize: 12,
          lineHeight: 19,
          lineNumbersMinChars: 3,
          minimap: { enabled: false },
          padding: { top: 10, bottom: 10 },
          readOnly,
          renderLineHighlight: readOnly ? 'none' : 'line',
          scrollBeyondLastLine: false,
          scrollBeyondLastColumn: 6,
          scrollbar: {
            horizontal: 'auto',
            vertical: 'auto',
            useShadows: false,
          },
          tabSize: 2,
          wordWrap: 'off',
        }}
      />
    </div>
  )
}

function buildInitialDraft(spec: ApiSpec, workspaceId: string) {
  const path: Record<string, string> = {}
  const query: Record<string, string> = {}
  for (const param of spec.params) {
    const value = param.name === 'workspace' ? workspaceId : param.defaultValue || ''
    if (param.in === 'path') path[param.name] = value
    if (param.in === 'query') query[param.name] = value
  }
  return {
    path,
    query,
    body: spec.defaultBody ? stringify(spec.defaultBody(workspaceId)) : '',
  }
}

function buildPath(template: string, params: Record<string, string>) {
  return template.replace(/\{([^}]+)\}/g, (_, key: string) => encodeURIComponent(params[key] || ''))
}

function buildUrl(path: string, params: ApiParam[], values: Record<string, string>) {
  const search = new URLSearchParams()
  for (const param of params) {
    if (param.in !== 'query') continue
    const value = values[param.name]
    if (value !== undefined && value !== '') search.set(param.name, value)
  }
  const query = search.toString()
  return query ? `${path}?${query}` : path
}

function filterSpecs(specs: ApiSpec[], filter: string, t: TFunction) {
  const normalized = filter.trim().toLowerCase()
  if (!normalized) return specs
  return specs.filter((spec) => {
    return [t(spec.titleKey), t(groupLabelKeys[spec.group]), spec.method, spec.path, t(spec.descriptionKey)].some((value) =>
      value.toLowerCase().includes(normalized),
    )
  })
}

function groupSpecs(specs: ApiSpec[]) {
  const groups = new Map<ApiGroup, ApiSpec[]>()
  for (const spec of specs) {
    groups.set(spec.group, [...(groups.get(spec.group) || []), spec])
  }
  return Array.from(groups.entries())
}

function sampleUModelElement() {
  return {
    kind: 'entity_set',
    domain: sampleDomain,
    name: sampleEntityType,
    spec: {
      fields: {},
    },
  }
}

function sampleEntities() {
  const now = currentUnixSeconds()
  return [
    {
      __domain__: sampleDomain,
      __entity_type__: sampleEntityType,
      __entity_id__: sampleServiceAId,
      __method__: 'Update',
      __first_observed_time__: now,
      __last_observed_time__: now,
      display_name: 'checkout-service',
    },
    {
      __domain__: sampleDomain,
      __entity_type__: sampleEntityType,
      __entity_id__: sampleServiceBId,
      __method__: 'Update',
      __first_observed_time__: now,
      __last_observed_time__: now,
      display_name: 'catalog-api',
    },
  ]
}

function sampleRelations() {
  const now = currentUnixSeconds()
  return [
    {
      __src_domain__: sampleDomain,
      __src_entity_type__: sampleEntityType,
      __src_entity_id__: sampleServiceAId,
      __dest_domain__: sampleDomain,
      __dest_entity_type__: sampleEntityType,
      __dest_entity_id__: sampleServiceBId,
      __relation_type__: sampleRelationType,
      __method__: 'Update',
      __first_observed_time__: now,
      __last_observed_time__: now,
    },
  ]
}

function currentUnixSeconds() {
  return Math.floor(Date.now() / 1000)
}
