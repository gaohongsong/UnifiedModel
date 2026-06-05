import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  ReactFlow,
  getBezierPath,
  useNodesState,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  ArrowRight,
  Bot,
  Box,
  Cable,
  Code2,
  Database,
  FolderPlus,
  GitCompareArrows,
  HelpCircle,
  Network,
  RefreshCcw,
  Search,
  Sparkles,
  Workflow,
} from 'lucide-react'
import type { HealthResponse, WorkspaceMetadata } from '../../api/types'
import { ApiError, UModelApi } from '../../api/client'
import { formatError, parseJson } from '../../lib/json'
import { Brand, HealthBadge } from '../../App'
import { Badge, Button, EmptyState, Field, JsonEditor, Modal, TextInput } from '../../design/components'
import { LanguageSelect, useI18n, type MessageKey, type TFunction } from '../../i18n'

export function WorkspaceLanding({
  api,
  apiBase,
  onApiBaseChange,
  health,
  onHealthChange,
  onOpenWorkspace,
}: {
  api: UModelApi
  apiBase: string
  onApiBaseChange: (value: string) => void
  health: HealthResponse | null
  onHealthChange: (value: HealthResponse | null) => void
  onOpenWorkspace: (workspace: WorkspaceMetadata) => void
}) {
  const { t } = useI18n()
  const [workspaces, setWorkspaces] = useState<WorkspaceMetadata[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [endpointDraft, setEndpointDraft] = useState(apiBase)
  const [testingEndpoint, setTestingEndpoint] = useState(false)
  const [endpointHelpPosition, setEndpointHelpPosition] = useState<{ left: number; top: number } | null>(null)
  const endpointHelpButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    setEndpointDraft(apiBase)
  }, [apiBase])

  const showEndpointHelp = useCallback(() => {
    const rect = endpointHelpButtonRef.current?.getBoundingClientRect()
    if (!rect) return
    const tooltipWidth = 344
    const tooltipHeight = 232
    const left = Math.max(24, Math.min(rect.left - 56, window.innerWidth - tooltipWidth - 24))
    const top = Math.max(24, Math.min(rect.bottom + 10, window.innerHeight - tooltipHeight - 24))
    setEndpointHelpPosition({ left, top })
  }, [])

  const hideEndpointHelp = useCallback(() => {
    setEndpointHelpPosition(null)
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [nextHealth, page] = await Promise.all([
        api.health().catch(() => null),
        api.listWorkspaces({ includeConflicts: true }),
      ])
      onHealthChange(nextHealth)
      setWorkspaces(page.items)
    } catch (nextError) {
      onHealthChange(null)
      setWorkspaces([])
      setError(formatError(nextError))
    } finally {
      setLoading(false)
    }
  }, [api, onHealthChange])

  const endpointChanged = normalizeApiBase(endpointDraft) !== normalizeApiBase(apiBase)

  const testEndpoint = useCallback(async () => {
    const nextBase = normalizeApiBase(endpointDraft)
    const nextApi = new UModelApi(nextBase)
    setTestingEndpoint(true)
    setLoading(true)
    setError('')
    setWorkspaces([])
    try {
      const [nextHealth, page] = await Promise.all([
        nextApi.health(),
        nextApi.listWorkspaces({ includeConflicts: true }),
      ])
      onHealthChange(nextHealth)
      setWorkspaces(page.items)
      onApiBaseChange(nextBase)
      setEndpointDraft(nextBase)
    } catch (nextError) {
      onHealthChange(null)
      setError(formatError(nextError))
    } finally {
      setTestingEndpoint(false)
      setLoading(false)
    }
  }, [endpointDraft, onApiBaseChange, onHealthChange])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const displayedWorkspaces = useMemo(() => (endpointChanged ? [] : workspaces), [endpointChanged, workspaces])
  const activeCount = useMemo(
    () => displayedWorkspaces.filter((item) => item.status === 'active').length,
    [displayedWorkspaces],
  )
  const apiEndpointSummary = useMemo(() => summarizeApiEndpoint(apiBase, t), [apiBase, t])
  const [flowNodes, , onFlowNodesChange] = useNodesState(landingFlowNodes)
  const activeWorkspaceCountText = activeCount === 1
    ? t('landing.workspaces.activeCount.one', { count: activeCount })
    : t('landing.workspaces.activeCount.other', { count: activeCount })

  return (
    <div className="landing app-shell">
      <header className="landing-topbar">
        <Brand />
        <div className="landing-topbar-actions">
          <LanguageSelect showLabel={false} />
          <HealthBadge health={health} />
        </div>
      </header>

      <main className="landing-main flow-landing-main">
        <section className="landing-workspace-panel" aria-label={t('landing.aria.workspaceControls')}>
          <div className="landing-copy">
            <h1>
              {t.rich('landing.hero.title', {
                highlight: (chunks) => <span className="landing-gradient-text">{chunks}</span>,
              })}
            </h1>
            <p>{t('landing.hero.description')}</p>
          </div>

          <div className="landing-actions">
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <FolderPlus size={16} />
              {t('landing.actions.createWorkspace')}
            </Button>
          </div>

          <div className="landing-api-card">
            <div className="om-field">
              <span className="om-label landing-api-label-row">
                <span>{t('landing.api.endpoint')}</span>
                <span className="landing-help-wrap" onMouseEnter={showEndpointHelp} onMouseLeave={hideEndpointHelp}>
                  <button
                    ref={endpointHelpButtonRef}
                    className="landing-help-trigger"
                    type="button"
                    aria-label={t('landing.api.helpLabel')}
                    aria-describedby={endpointHelpPosition ? 'landing-endpoint-help' : undefined}
                    onFocus={showEndpointHelp}
                    onBlur={hideEndpointHelp}
                  >
                    <HelpCircle size={14} />
                  </button>
                </span>
                {endpointHelpPosition &&
                  typeof document !== 'undefined' &&
                  createPortal(
                    <span
                      className="landing-help-tooltip"
                      id="landing-endpoint-help"
                      role="tooltip"
                      style={{
                        '--tooltip-left': `${endpointHelpPosition.left}px`,
                        '--tooltip-top': `${endpointHelpPosition.top}px`,
                      } as CSSProperties}
                    >
                      <strong>{t('landing.api.examples')}</strong>
                      <span className="landing-help-line">
                        <b>{t('landing.api.backend')}</b>
                        <code>http://localhost:8080</code>
                      </span>
                      <span className="landing-help-line">
                        <b>{t('landing.api.backend')}</b>
                        <code>http://127.0.0.1:8080</code>
                      </span>
                      <span className="landing-help-line">
                        <b>{t('landing.api.devProxy')}</b>
                        <code>http://127.0.0.1:5173</code>
                      </span>
                      <span className="landing-help-line">
                        <b>{t('landing.api.blank')}</b>
                        <span>{t('landing.api.blankDetail')}</span>
                      </span>
                    </span>,
                    document.body,
                  )}
              </span>
              <form
                className="landing-api-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  void testEndpoint()
                }}
              >
                <TextInput
                  value={endpointDraft}
                  onChange={(event) => setEndpointDraft(event.target.value)}
                  placeholder={t('landing.api.placeholder')}
                  spellCheck={false}
                />
                <Button type="submit" variant={endpointChanged ? 'primary' : 'secondary'} disabled={testingEndpoint}>
                  {testingEndpoint ? t('landing.api.checking') : t('landing.api.connect')}
                </Button>
              </form>
            </div>
            <div className="landing-inline-note">
              <Database size={14} />
              {endpointChanged ? t('landing.api.changedNote') : t('landing.api.connectedNote')}
            </div>
          </div>

          <div className="landing-metrics">
            <div>
              <span>{t('landing.metrics.workspaces')}</span>
              <strong>{displayedWorkspaces.length}</strong>
              <small><StatusDotLike /> {t('landing.metrics.active', { count: activeCount })}</small>
            </div>
            <div>
              <span>{t('landing.metrics.graphstore')}</span>
              <strong>{health?.graphstore.provider || t('common.health.unknown')}</strong>
              <small>{health ? <><StatusDotLike /> {t('common.status.connected')}</> : <><Cable size={12} /> {t('common.status.notConnected')}</>}</small>
            </div>
            <div>
              <span>{t('landing.metrics.api')}</span>
              <strong className="landing-api-metric-value" title={apiEndpointSummary.full}>
                {apiEndpointSummary.title}
              </strong>
              <small><Cable size={12} /> {apiEndpointSummary.detail}</small>
            </div>
          </div>

          {error && (
            <div className="om-panel">
              <div className="om-panel-body">
                <Badge tone="danger">{t('landing.error.connection')}</Badge>
                <p className="small muted">{error}</p>
              </div>
            </div>
          )}

          <div className="landing-workspace-list-card">
            <div className="landing-section-head">
              <div>
                <strong>{t('landing.workspaces.recent')}</strong>
                <span>{activeWorkspaceCountText}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => void refresh()}>
                <RefreshCcw size={14} />
                {t('common.refresh')}
              </Button>
            </div>

            <div className="workspace-list landing-workspace-list">
              {endpointChanged && !testingEndpoint && (
                <div className="landing-connect-placeholder">
                  <Database size={18} />
                  <strong>{t('landing.workspaces.endpointNotConnected.title')}</strong>
                  <span>{t('landing.workspaces.endpointNotConnected.detail')}</span>
                </div>
              )}
              {loading && !endpointChanged && <div className="landing-list-note">{t('landing.workspaces.loading')}</div>}
              {!loading && !endpointChanged && displayedWorkspaces.length === 0 && (
                <EmptyState
                  title={t('landing.workspaces.empty.title')}
                  detail={t('landing.workspaces.empty.detail')}
                  action={
                    <Button variant="primary" onClick={() => setCreateOpen(true)}>
                      <FolderPlus size={16} />
                      {t('landing.actions.createWorkspace')}
                    </Button>
                  }
                />
              )}
              {!loading &&
                !endpointChanged &&
                displayedWorkspaces.map((workspace) => (
                  <button className="workspace-row" key={workspace.id} onClick={() => onOpenWorkspace(workspace)}>
                    <span className="workspace-row-main">
                      <span className="workspace-name-line">
                        <strong>{workspace.name || workspace.id}</strong>
                        {workspace.name && workspace.name !== workspace.id && (
                          <span className="workspace-id">{workspace.id}</span>
                        )}
                      </span>
                      {workspace.description && (
                        <span className="workspace-description">{workspace.description}</span>
                      )}
                    </span>
                    <span className="row" style={{ justifyContent: 'flex-end' }}>
                      <Badge tone={workspace.status === 'active' ? 'success' : 'warning'}>{workspace.status}</Badge>
                      <ArrowRight size={16} />
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </section>

        <section className="landing-stage flow-stage" aria-label={t('landing.aria.productPreview')}>
          <div className="flow-product-shell">
            <div className="flow-canvas-wrap">
              <ReactFlow
                className="landing-react-flow"
                nodes={flowNodes}
                edges={landingFlowEdges}
                nodeTypes={landingFlowNodeTypes}
                edgeTypes={landingFlowEdgeTypes}
                defaultViewport={{ x: 0, y: 0, zoom: 1 }}
                minZoom={0.5}
                maxZoom={1.32}
                fitView
                fitViewOptions={{ padding: 0.025, minZoom: 0.56, maxZoom: 1.22 }}
                panOnDrag
                zoomOnScroll={false}
                zoomOnPinch
                zoomOnDoubleClick={false}
                nodesDraggable
                nodesConnectable={false}
                edgesFocusable
                nodesFocusable
                elementsSelectable
                preventScrolling={false}
                onNodesChange={onFlowNodesChange}
                proOptions={{ hideAttribution: true }}
              >
                <Background variant={BackgroundVariant.Dots} gap={24} size={1.4} color="rgba(76, 116, 210, 0.22)" />
              </ReactFlow>
            </div>
          </div>
        </section>
      </main>

      {createOpen && (
        <CreateWorkspaceModal
          api={api}
          onClose={() => setCreateOpen(false)}
          onCreated={(workspace) => {
            setCreateOpen(false)
            setWorkspaces((items) => [...items.filter((item) => item.id !== workspace.id), workspace])
            onOpenWorkspace(workspace)
          }}
        />
      )}
    </div>
  )
}

type LandingFlowTone = 'blue' | 'aqua' | 'violet' | 'amber' | 'slate'
type LandingFlowIcon = 'api' | 'agent' | 'database' | 'diff' | 'metric' | 'query' | 'schema' | 'service' | 'workspace'

type LandingFlowNodeData = {
  icon: LandingFlowIcon
  kindKey: MessageKey
  titleKey: MessageKey
  subtitleKey: MessageKey
  metaKey?: MessageKey
  tone: LandingFlowTone
  details?: MessageKey[]
  variant?: LandingFlowNodeVariant
  width?: number
}

type LandingFlowEdgeData = {
  labelKey?: MessageKey
  tone: LandingFlowTone
}

type LandingFlowNodeVariant = 'source' | 'schema' | 'adapter' | 'core' | 'query' | 'review' | 'agent' | 'api'

const landingFlowTones: Record<LandingFlowTone, { solid: string; soft: string; text: string }> = {
  blue: { solid: '#2f6bff', soft: 'rgba(47, 107, 255, 0.14)', text: '#174fe0' },
  aqua: { solid: '#20cdb7', soft: 'rgba(32, 205, 183, 0.16)', text: '#087f70' },
  violet: { solid: '#7b61ff', soft: 'rgba(123, 97, 255, 0.14)', text: '#5b40da' },
  amber: { solid: '#f5a623', soft: 'rgba(245, 166, 35, 0.14)', text: '#9a6400' },
  slate: { solid: '#61708c', soft: 'rgba(97, 112, 140, 0.12)', text: '#36445e' },
}

const landingFlowNodes: Node<LandingFlowNodeData>[] = [
  {
    id: 'workspace',
    type: 'landing',
    position: { x: 430, y: 18 },
    data: {
      icon: 'workspace',
      kindKey: 'landing.flow.workspace.kind',
      titleKey: 'landing.flow.workspace.title',
      subtitleKey: 'landing.flow.workspace.subtitle',
      metaKey: 'landing.flow.workspace.meta',
      tone: 'slate',
      variant: 'source',
      width: 286,
      details: [
        'landing.flow.workspace.detail.workspaceApi',
        'landing.flow.workspace.detail.labels',
        'landing.flow.workspace.detail.health',
      ],
    },
  },
  {
    id: 'schema',
    type: 'landing',
    position: { x: 36, y: 226 },
    data: {
      icon: 'schema',
      kindKey: 'landing.flow.schema.kind',
      titleKey: 'landing.flow.schema.title',
      subtitleKey: 'landing.flow.schema.subtitle',
      metaKey: 'landing.flow.schema.meta',
      tone: 'violet',
      variant: 'schema',
      width: 274,
      details: [
        'landing.flow.schema.detail.entityKind',
        'landing.flow.schema.detail.edgeRules',
        'landing.flow.schema.detail.schemaDiff',
      ],
    },
  },
  {
    id: 'adapters',
    type: 'landing',
    position: { x: 44, y: 542 },
    data: {
      icon: 'database',
      kindKey: 'landing.flow.evidence.kind',
      titleKey: 'landing.flow.evidence.title',
      subtitleKey: 'landing.flow.evidence.subtitle',
      metaKey: 'landing.flow.evidence.meta',
      tone: 'blue',
      variant: 'adapter',
      width: 286,
      details: [
        'landing.flow.evidence.detail.metrics',
        'landing.flow.evidence.detail.ownership',
        'landing.flow.evidence.detail.runtimeTags',
      ],
    },
  },
  {
    id: 'graph',
    type: 'landing',
    position: { x: 430, y: 284 },
    data: {
      icon: 'service',
      kindKey: 'landing.flow.graph.kind',
      titleKey: 'landing.flow.graph.title',
      subtitleKey: 'landing.flow.graph.subtitle',
      metaKey: 'landing.flow.graph.meta',
      tone: 'blue',
      variant: 'core',
      width: 356,
      details: [
        'landing.flow.graph.detail.entities',
        'landing.flow.graph.detail.relations',
        'landing.flow.graph.detail.toolContext',
      ],
    },
  },
  {
    id: 'query',
    type: 'landing',
    position: { x: 872, y: 108 },
    data: {
      icon: 'query',
      kindKey: 'landing.flow.query.kind',
      titleKey: 'landing.flow.query.title',
      subtitleKey: 'landing.flow.query.subtitle',
      metaKey: 'landing.flow.query.meta',
      tone: 'aqua',
      variant: 'query',
      width: 306,
      details: [
        'landing.flow.query.detail.pathSearch',
        'landing.flow.query.detail.blastRadius',
        'landing.flow.query.detail.filters',
      ],
    },
  },
  {
    id: 'diff',
    type: 'landing',
    position: { x: 906, y: 346 },
    data: {
      icon: 'diff',
      kindKey: 'landing.flow.review.kind',
      titleKey: 'landing.flow.review.title',
      subtitleKey: 'landing.flow.review.subtitle',
      metaKey: 'landing.flow.review.meta',
      tone: 'amber',
      variant: 'review',
      width: 286,
      details: [
        'landing.flow.review.detail.schemaSafe',
        'landing.flow.review.detail.auditable',
        'landing.flow.review.detail.reversible',
      ],
    },
  },
  {
    id: 'agent',
    type: 'landing',
    position: { x: 430, y: 640 },
    data: {
      icon: 'agent',
      kindKey: 'landing.flow.agent.kind',
      titleKey: 'landing.flow.agent.title',
      subtitleKey: 'landing.flow.agent.subtitle',
      metaKey: 'landing.flow.agent.meta',
      tone: 'violet',
      variant: 'agent',
      width: 310,
      details: [
        'landing.flow.agent.detail.inspect',
        'landing.flow.agent.detail.explain',
        'landing.flow.agent.detail.propose',
      ],
    },
  },
  {
    id: 'submit',
    type: 'landing',
    position: { x: 902, y: 666 },
    data: {
      icon: 'api',
      kindKey: 'landing.flow.api.kind',
      titleKey: 'landing.flow.api.title',
      subtitleKey: 'landing.flow.api.subtitle',
      metaKey: 'landing.flow.api.meta',
      tone: 'aqua',
      variant: 'api',
      width: 294,
      details: [
        'landing.flow.api.detail.workspaces',
        'landing.flow.api.detail.elements',
        'landing.flow.api.detail.relations',
      ],
    },
  },
]

const landingFlowEdges: Edge<LandingFlowEdgeData>[] = [
  {
    id: 'workspace-graph',
    source: 'workspace',
    sourceHandle: 'source-bottom',
    target: 'graph',
    targetHandle: 'target-top',
    type: 'landing',
    animated: true,
    data: { tone: 'blue', labelKey: 'landing.flow.edge.workspaceState' },
  },
  {
    id: 'schema-graph',
    source: 'schema',
    sourceHandle: 'source-right',
    target: 'graph',
    targetHandle: 'target-left-upper',
    type: 'landing',
    animated: true,
    data: { tone: 'violet', labelKey: 'landing.flow.edge.validatesModel' },
  },
  {
    id: 'adapters-graph',
    source: 'adapters',
    sourceHandle: 'source-right',
    target: 'graph',
    targetHandle: 'target-left-lower',
    type: 'landing',
    animated: true,
    data: { tone: 'blue', labelKey: 'landing.flow.edge.syncsEvidence' },
  },
  {
    id: 'graph-query',
    source: 'graph',
    sourceHandle: 'source-right-upper',
    target: 'query',
    targetHandle: 'target-left',
    type: 'landing',
    animated: true,
    data: { tone: 'aqua', labelKey: 'landing.flow.edge.exploreTopology' },
  },
  {
    id: 'query-diff',
    source: 'query',
    sourceHandle: 'source-bottom',
    target: 'diff',
    targetHandle: 'target-top',
    type: 'landing',
    data: { tone: 'amber', labelKey: 'landing.flow.edge.turnsIntoPatch' },
  },
  {
    id: 'graph-agent',
    source: 'graph',
    sourceHandle: 'source-bottom',
    target: 'agent',
    targetHandle: 'target-top',
    type: 'landing',
    animated: true,
    data: { tone: 'violet', labelKey: 'landing.flow.edge.toolContext' },
  },
  {
    id: 'diff-submit',
    source: 'diff',
    sourceHandle: 'source-bottom',
    target: 'submit',
    targetHandle: 'target-top',
    type: 'landing',
    animated: true,
    data: { tone: 'amber', labelKey: 'landing.flow.edge.approvedPatch' },
  },
  {
    id: 'agent-submit',
    source: 'agent',
    sourceHandle: 'source-right',
    target: 'submit',
    targetHandle: 'target-left',
    type: 'landing',
    data: { tone: 'violet', labelKey: 'landing.flow.edge.guardedAction' },
  },
]

const LandingFlowNode = memo(({ data }: NodeProps<Node<LandingFlowNodeData>>) => {
  const { t } = useI18n()
  const tone = landingFlowTones[data.tone]
  const variant = data.variant || 'source'
  return (
    <div
      className={`landing-flow-node variant-${variant}`}
      style={{
        '--flow-tone': tone.solid,
        '--flow-tone-soft': tone.soft,
        '--flow-tone-text': tone.text,
        '--flow-node-width': `${data.width || 220}px`,
      } as CSSProperties}
    >
      <Handle id="target-left" type="target" position={Position.Left} className="landing-flow-handle side-left" />
      <Handle id="target-left-upper" type="target" position={Position.Left} className="landing-flow-handle side-left lane-upper" />
      <Handle id="target-left-lower" type="target" position={Position.Left} className="landing-flow-handle side-left lane-lower" />
      <Handle id="target-right" type="target" position={Position.Right} className="landing-flow-handle side-right" />
      <Handle id="target-top" type="target" position={Position.Top} className="landing-flow-handle side-top" />
      <Handle id="target-bottom" type="target" position={Position.Bottom} className="landing-flow-handle side-bottom" />
      <span className="landing-flow-node-icon">{landingFlowIcon(data.icon)}</span>
      <div className="landing-flow-node-copy">
        <span className="landing-flow-node-kind">{t(data.kindKey)}</span>
        <strong>{t(data.titleKey)}</strong>
        <small>{t(data.subtitleKey)}</small>
        {data.details && (
          <div className="landing-flow-node-tags">
            {data.details.map((detail) => (
              <b key={detail}>{t(detail)}</b>
            ))}
          </div>
        )}
      </div>
      {data.metaKey && <em>{t(data.metaKey)}</em>}
      <LandingFlowNodeVisual variant={variant} />
      <Handle id="source-left" type="source" position={Position.Left} className="landing-flow-handle side-left" />
      <Handle id="source-right" type="source" position={Position.Right} className="landing-flow-handle side-right" />
      <Handle id="source-right-upper" type="source" position={Position.Right} className="landing-flow-handle side-right lane-upper" />
      <Handle id="source-right-lower" type="source" position={Position.Right} className="landing-flow-handle side-right lane-lower" />
      <Handle id="source-top" type="source" position={Position.Top} className="landing-flow-handle side-top" />
      <Handle id="source-bottom" type="source" position={Position.Bottom} className="landing-flow-handle side-bottom" />
    </div>
  )
})

function LandingFlowEdge({
  id,
  animated,
  selected,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<Edge<LandingFlowEdgeData>>) {
  const { t } = useI18n()
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })
  const tone = landingFlowTones[data?.tone || 'blue']
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_')
  const isAnimated = Boolean(animated)

  return (
    <>
      <defs>
        <linearGradient id={`landing-flow-edge-${safeId}`} gradientUnits="userSpaceOnUse" x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}>
          <stop offset="0%" stopColor={tone.solid} stopOpacity={0.18} />
          <stop offset="100%" stopColor={tone.solid} stopOpacity={0.88} />
        </linearGradient>
      </defs>
      <BaseEdge
        className="landing-flow-edge-glow"
        path={edgePath}
        style={{
          stroke: tone.solid,
          strokeWidth: selected ? 8.5 : 6,
          opacity: selected ? 0.14 : 0.08,
          pointerEvents: 'none',
        }}
        interactionWidth={0}
      />
      <BaseEdge
        className="landing-flow-edge-main"
        id={id}
        path={edgePath}
        style={{
          stroke: `url(#landing-flow-edge-${safeId})`,
          strokeWidth: selected ? 3.3 : isAnimated ? 2.6 : 2.35,
          pointerEvents: 'none',
        }}
      />
      <circle cx={targetX} cy={targetY} r={4.4} fill="#ffffff" stroke={tone.solid} strokeWidth={2.1} />
      {data?.labelKey && (
        <EdgeLabelRenderer>
          <span
            className="landing-flow-edge-label"
            style={{
              '--flow-tone': tone.solid,
              '--flow-tone-soft': tone.soft,
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            } as CSSProperties}
          >
            {t(data.labelKey)}
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

function LandingFlowNodeVisual({ variant }: { variant: LandingFlowNodeVariant }) {
  const { t } = useI18n()
  if (variant === 'core') {
    return (
      <div className="landing-flow-visual visual-core" aria-hidden="true">
        <i />
        <i />
        <i />
        <span />
        <span />
        <span />
        <b />
      </div>
    )
  }

  if (variant === 'schema') {
    return (
      <div className="landing-flow-visual visual-schema" aria-hidden="true">
        <span>{t('landing.flow.visual.entity')}</span>
        <span>{t('landing.flow.visual.relation')}</span>
        <span>{t('landing.flow.visual.version')}</span>
      </div>
    )
  }

  if (variant === 'adapter') {
    return (
      <div className="landing-flow-visual visual-adapter" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
    )
  }

  if (variant === 'query') {
    return (
      <div className="landing-flow-visual visual-query" aria-hidden="true">
        <span>{t('landing.flow.visual.ownerQuery')}</span>
        <i />
      </div>
    )
  }

  if (variant === 'review') {
    return (
      <div className="landing-flow-visual visual-review" aria-hidden="true">
        <span className="add" />
        <span />
        <span className="drop" />
      </div>
    )
  }

  if (variant === 'agent') {
    return (
      <div className="landing-flow-visual visual-agent" aria-hidden="true">
        <span>{t('landing.flow.visual.inspect')}</span>
        <span>{t('landing.flow.visual.explain')}</span>
      </div>
    )
  }

  if (variant === 'api') {
    return (
      <div className="landing-flow-visual visual-api" aria-hidden="true">
        <span>POST</span>
        <span>200</span>
      </div>
    )
  }

  return (
    <div className="landing-flow-visual visual-source" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  )
}

function landingFlowIcon(icon: LandingFlowIcon) {
  if (icon === 'agent') return <Bot size={18} />
  if (icon === 'api') return <Code2 size={18} />
  if (icon === 'database') return <Database size={18} />
  if (icon === 'diff') return <GitCompareArrows size={18} />
  if (icon === 'metric') return <Sparkles size={18} />
  if (icon === 'query') return <Search size={18} />
  if (icon === 'schema') return <Network size={18} />
  if (icon === 'workspace') return <Workflow size={18} />
  return <Box size={18} />
}

const landingFlowNodeTypes = { landing: LandingFlowNode }
const landingFlowEdgeTypes = { landing: LandingFlowEdge }

function normalizeApiBase(value: string) {
  return value.trim().replace(/\/+$/, '')
}

function summarizeApiEndpoint(value: string, t: TFunction) {
  const normalized = normalizeApiBase(value)
  if (!normalized) {
    return {
      title: t('landing.api.sameOrigin'),
      detail: '/api proxy',
      full: t('landing.api.sameOriginFull'),
    }
  }
  try {
    const url = new URL(normalized)
    return {
      title: url.host,
      detail: url.protocol.replace(':', '').toUpperCase(),
      full: normalized,
    }
  } catch {
    return {
      title: normalized,
      detail: 'REST',
      full: normalized,
    }
  }
}

function StatusDotLike() {
  return <span className="landing-dot" aria-hidden="true" />
}

function CreateWorkspaceModal({
  api,
  onClose,
  onCreated,
}: {
  api: UModelApi
  onClose: () => void
  onCreated: (workspace: WorkspaceMetadata) => void
}) {
  const { t } = useI18n()
  const [id, setId] = useState('demo')
  const [name, setName] = useState('Demo')
  const [description, setDescription] = useState('Local UModel workspace')
  const [labels, setLabels] = useState('{\n  "env": "local"\n}')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setSaving(true)
    setError('')
    try {
      const workspace = await api.createWorkspace({
        id,
        name,
        description,
        labels: labels.trim() ? parseJson<Record<string, string>>(labels, t('landing.modal.labelsJson')) : undefined,
      })
      onCreated(workspace)
    } catch (nextError) {
      setError(formatCreateWorkspaceError(nextError, t))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={t('landing.modal.create.title')}
      onClose={onClose}
      footer={
        <div className="toolbar" style={{ width: '100%' }}>
          <div />
          <div className="row">
            <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={() => void submit()} disabled={saving || !id.trim()}>
              <FolderPlus size={16} />
              {t('common.create')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="stack">
        {error && <div className="landing-create-error">{error}</div>}
        <Field label={t('landing.modal.workspaceId')}>
          <TextInput value={id} onChange={(event) => setId(event.target.value)} placeholder="demo" />
        </Field>
        <Field label={t('landing.modal.name')}>
          <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="Demo" />
        </Field>
        <Field label={t('landing.modal.description')}>
          <TextInput value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
        <Field label={t('landing.modal.labelsJson')}>
          <JsonEditor value={labels} onChange={setLabels} minHeight={120} />
        </Field>
        <div className="small muted">{t('landing.modal.idHelp')}</div>
      </div>
    </Modal>
  )
}

function formatCreateWorkspaceError(error: unknown, t: TFunction) {
  if (error instanceof ApiError && error.code === 'WORKSPACE_TOMBSTONED') {
    return t('landing.modal.error.tombstoned')
  }
  return formatError(error)
}
