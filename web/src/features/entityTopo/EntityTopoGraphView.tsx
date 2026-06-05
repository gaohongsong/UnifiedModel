import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Crosshair, LocateFixed, RotateCcw } from 'lucide-react'
import { useI18n } from '../../i18n'
import { CosmosTopoGraph } from './cosmosTopo/cosmosTopoGraph'
import type { LayoutOptions, TopoData, TopoEdge, TopoGraphRef, TopoNode } from './cosmosTopo/types'
import type {
  EntityTopoData,
  EntityTopoDisplaySettings,
  EntityTopoEdge,
  EntityTopoNode,
  TopoSelection,
  TopoZoomLevel,
} from './entityTopoModel'

const FOCUSED_DETAIL_NODE_LIMIT = 120

export function EntityTopoGraphView({
  data,
  enableFocusActions = true,
  showViewportToolbar = true,
  focusIds,
  selected,
  settings,
  zoomLevel,
  onSelect,
  onFocusNode,
  onZoomLevelChange,
}: {
  data: EntityTopoData
  enableFocusActions?: boolean
  showViewportToolbar?: boolean
  focusIds: string[]
  selected: TopoSelection | null
  settings: EntityTopoDisplaySettings
  zoomLevel: TopoZoomLevel
  onSelect: (selection: TopoSelection | null) => void
  onFocusNode: (node: EntityTopoNode) => void
  onZoomLevelChange: (level: TopoZoomLevel) => void
}) {
  const { t } = useI18n()
  const graphRef = useRef<TopoGraphRef | null>(null)
  const topoData = useMemo(() => toCosmosTopoData(data), [data])
  const validTopoEdges = useMemo(() => getValidTopoEdges(topoData), [topoData])
  const layout = useMemo(
    () => createCosmosLayout(settings, data.nodes.length, data.edges.length, focusIds.length > 0),
    [data.edges.length, data.nodes.length, focusIds.length, settings],
  )
  const selectedKey = selected?.kind === 'node'
    ? `node:${selected.node.id}`
    : selected?.kind === 'edge'
      ? `edge:${selected.edge.id}`
      : 'none'
  const selectedNode = selected?.kind === 'node' ? selected.node : undefined

  useEffect(() => {
    const graph = graphRef.current?.getGraph()
    if (!graph) return
    if (selected?.kind === 'node') {
      graph.focusNodeView(selected.node.id)
    } else if (!selected) {
      graph.clearFocus()
    }
  }, [selected, selectedKey])

  useEffect(() => {
    if (zoomLevel !== 'full') onZoomLevelChange('full')
  }, [onZoomLevelChange, zoomLevel])

  const handleNodeClick = useCallback((rawNode: TopoNode) => {
    const node = readEntityNode(rawNode)
    if (node) onSelect({ kind: 'node', node })
  }, [onSelect])

  const handleEdgeClick = useCallback((context: { source?: string; target?: string; edgeIndex?: number }) => {
    const edge = readEntityEdge(
      context.edgeIndex === undefined
        ? findTopoEdgeByEndpoints(topoData.edges, context.source, context.target)
        : validTopoEdges[context.edgeIndex],
    )
    if (edge) onSelect({ kind: 'edge', edge })
  }, [onSelect, topoData.edges, validTopoEdges])

  const handleNodeIsolate = useCallback((nodeId: string | null) => {
    if (!nodeId) {
      onSelect(null)
      return
    }
    const node = data.nodes.find((item) => item.id === nodeId)
    if (node) onFocusNode(node)
  }, [data.nodes, onFocusNode, onSelect])

  return (
    <div className="eto-graph-shell eto-cosmos-shell">
      <CosmosTopoGraph
        ref={graphRef}
        data={topoData}
        layout={layout}
        className="eto-cosmos-graph"
        style={{ width: '100%', height: '100%', background: 'transparent' }}
        handleNodeClick={handleNodeClick}
        handleEdgeClick={handleEdgeClick}
        handleNodeIsolate={enableFocusActions ? handleNodeIsolate : undefined}
        handleCloseInfo={() => onSelect(null)}
      >
        {showViewportToolbar && (
          <div className="eto-cosmos-toolbar">
            <button type="button" onClick={() => void graphRef.current?.getGraph().fitView()} title={t('entityTopoExplorer.action.fitView')}>
              <LocateFixed size={14} />
            </button>
            <button type="button" onClick={() => graphRef.current?.getGraph().resetView()} title={t('entityTopoExplorer.action.resetView')}>
              <RotateCcw size={14} />
            </button>
            {enableFocusActions && selectedNode && (
              <button type="button" onClick={() => onFocusNode(selectedNode)} title={t('entityTopoExplorer.action.focusNeighbors')}>
                <Crosshair size={14} />
              </button>
            )}
          </div>
        )}
      </CosmosTopoGraph>
    </div>
  )
}

function createCosmosLayout(
  settings: EntityTopoDisplaySettings,
  nodeCount: number,
  edgeCount: number,
  hasFocus: boolean,
): LayoutOptions {
  const detailedView = hasFocus && nodeCount <= FOCUSED_DETAIL_NODE_LIMIT
  const edgeVisual = edgeVisualForCount(edgeCount)
  const isGrouped = settings.layoutAlgorithm === 'grouped'
  return {
    mode: isGrouped ? 'graphviz' : 'force',
    clusterByType: isGrouped,
    adaptiveNodeSize: true,
    nodeSizeMode: 'default',
    enableDrag: settings.enableDrag,
    showLabels: settings.showLabels,
    showClusterLabels: isGrouped && settings.showClusterLabels,
    showEdgeLabels: false,
    hoverMode: 'panel',
    minZoomLevel: 0.04,
    maxZoomLevel: 8,
    simulationDuration: 5000,
    graphvizEngine: 'sfdp',
    graphvizRankdir: settings.layoutDirection,
    externalFocusMode: true,
    focusActive: hasFocus,
    forceDetailedView: detailedView,
    showMiniMap: settings.showMiniMap,
    linkWidthScale: edgeVisual.widthScale,
    linkOpacity: edgeVisual.opacity,
  }
}

function toCosmosTopoData(data: EntityTopoData): TopoData {
  const nodes: TopoNode[] = data.nodes.map((node) => ({
    id: node.id,
    type: node.endpoint.cluster,
    title: node.title,
    subTitle: node.endpoint.entityType,
    label: node.title,
    style: {
      fill: node.visual.color,
      iconFill: node.visual.color,
      iconPreset: iconPresetForNode(node),
    },
    data: {
      cluster: node.endpoint.cluster,
      subTitle: node.endpoint.entityType,
      entityTopoNode: node,
      style: {
        fill: node.visual.color,
        iconFill: node.visual.color,
        iconPreset: iconPresetForNode(node),
      },
    },
  }))
  const nodeById = new Map(data.nodes.map((node) => [node.id, node]))
  const edges: TopoEdge[] = data.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.relationType,
    style: {
      stroke: nodeById.get(edge.target)?.visual.color || nodeById.get(edge.source)?.visual.color || '#8fa1b7',
      opacity: 1,
    },
    data: {
      label: edge.relationType,
      entityTopoEdge: edge,
      sourceNode: nodeById.get(edge.source),
      targetNode: nodeById.get(edge.target),
    },
  }))
  return { nodes, edges }
}

function edgeVisualForCount(edgeCount: number) {
  if (edgeCount <= 20) return { widthScale: 1.95, opacity: 0.82 }
  if (edgeCount <= 80) return { widthScale: 1.65, opacity: 0.74 }
  if (edgeCount <= 240) return { widthScale: 1.32, opacity: 0.64 }
  if (edgeCount <= 800) return { widthScale: 1.08, opacity: 0.56 }
  return { widthScale: 0.92, opacity: 0.48 }
}

function iconPresetForNode(node: EntityTopoNode) {
  const value = `${node.endpoint.entityType} ${node.title}`.toLowerCase()
  if (value.includes('service')) return 'service'
  if (value.includes('operation') || value.includes('http')) return 'endpoint'
  if (value.includes('database') || value.includes('db')) return 'database'
  if (value.includes('instance')) return 'instance'
  return 'default'
}

function getValidTopoEdges(data: TopoData): TopoEdge[] {
  const nodeIds = new Set(data.nodes.map((node) => node.id))
  return data.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
}

function findTopoEdgeByEndpoints(edges: TopoEdge[], source?: string, target?: string) {
  if (!source || !target) return undefined
  return edges.find((edge) => edge.source === source && edge.target === target)
}

function readEntityNode(rawNode: TopoNode | undefined): EntityTopoNode | undefined {
  return rawNode?.data?.entityTopoNode as EntityTopoNode | undefined
}

function readEntityEdge(rawEdge: TopoEdge | undefined): EntityTopoEdge | undefined {
  return rawEdge?.data?.entityTopoEdge as EntityTopoEdge | undefined
}
