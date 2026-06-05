import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEventHandler,
  type PointerEventHandler,
  type ReactNode,
} from 'react'
import ReactDOM from 'react-dom'
import {
  Activity,
  ArrowRight,
  CalendarClock,
  CircleHelp,
  Crosshair,
  Database,
  FilterX,
  Layers,
  Play,
  RefreshCcw,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import type { QueryResult, UModelElement } from '../../api/types'
import { UModelApi } from '../../api/client'
import { Button, EmptyState } from '../../design/components'
import { useI18n } from '../../i18n'
import { formatError } from '../../lib/json'
import { EntityTopoGraphView } from './EntityTopoGraphView'
import {
  DEFAULT_ENTITY_TOPO_DISPLAY_SETTINGS,
  DEFAULT_ENTITY_TOPO_FILTERS,
  ENTITY_PROPERTY_LIMIT,
  ENTITY_TOPO_LIMIT,
  buildEntityTopoData,
  endpointLabel,
  filterEntityTopoData,
  formatTopoValue,
  getAttributeFilterKey,
  hasEntityTopoFilters,
  toggleFilterValue,
  type EntityTopoClusterMeta,
  type EntityTopoData,
  type EntityTopoDisplaySettings,
  type EntityTopoEdge,
  type EntityTopoFilters,
  type EntityTopoNode,
  type TopoSelection,
  type TopoZoomLevel,
} from './entityTopoModel'
import './entityTopo.css'

type SidebarTab = 'summary' | 'display'

const emptyTopoData: EntityTopoData = {
  nodes: [],
  edges: [],
  clusters: [],
  relationTypes: [],
  domains: [],
  attributeAggregations: {},
  limitInfo: { reached: false, limit: ENTITY_TOPO_LIMIT, rowCount: 0 },
}

export function EntityTopoPage({
  api,
  workspaceId,
  refreshToken,
}: {
  api: UModelApi
  workspaceId: string
  refreshToken: number
}) {
  const { t } = useI18n()
  const defaultRange = useMemo(() => createDefaultTimeRange(), [])
  const [timeRangeDraft, setTimeRangeDraft] = useState(defaultRange)
  const [queryTimeRange, setQueryTimeRange] = useState(defaultRange)
  const [data, setData] = useState<EntityTopoData>(emptyTopoData)
  const [loading, setLoading] = useState(false)
  const [sampleImporting, setSampleImporting] = useState(false)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState<EntityTopoFilters>(DEFAULT_ENTITY_TOPO_FILTERS)
  const [displaySettings, setDisplaySettings] = useState<EntityTopoDisplaySettings>(DEFAULT_ENTITY_TOPO_DISPLAY_SETTINGS)
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('summary')
  const [searchDraft, setSearchDraft] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [selected, setSelected] = useState<TopoSelection | null>(null)
  const [zoomLevel, setZoomLevel] = useState<TopoZoomLevel>('full')
  const searchBlurRef = useRef<number | null>(null)

  const load = useCallback(async (range = queryTimeRange) => {
    setLoading(true)
    setError('')
    try {
      const timeRange = {
        from: toIsoOrUndefined(range.from),
        to: toIsoOrUndefined(range.to),
      }
      const umodelPromise = api.listUModel(workspaceId, 100).catch(() => null)
      const { topoResult, entityRows } = await loadEntityTopoData(api, workspaceId, timeRange)
      const umodelResult = await umodelPromise
      const umodelElements = (umodelResult?.rows || []).map(rowToElement).filter((element) => element.kind && element.domain && element.name)
      const nextData = buildEntityTopoData(topoResult, umodelElements, entityRows)
      setData(nextData)
      setSelected((current) => resolveSelection(current, nextData))
    } catch (nextError) {
      setError(formatError(nextError))
      setData(emptyTopoData)
      setSelected(null)
    } finally {
      setLoading(false)
    }
  }, [api, queryTimeRange, workspaceId])

  useEffect(() => {
    void load(queryTimeRange)
  }, [load, queryTimeRange, refreshToken])

  const importSample = useCallback(async () => {
    setSampleImporting(true)
    setError('')
    try {
      await api.importSampleData(workspaceId)
      setFilters(DEFAULT_ENTITY_TOPO_FILTERS)
      await load(queryTimeRange)
    } catch (nextError) {
      setError(formatError(nextError))
    } finally {
      setSampleImporting(false)
    }
  }, [api, load, queryTimeRange, workspaceId])

  const filteredData = useMemo(() => filterEntityTopoData(data, filters), [data, filters])
  const activeFilterCount = filters.domains.length + filters.types.length + filters.relations.length + filters.attributeFilters.length + filters.focusIds.length + (filters.searchText.trim() ? 1 : 0)

  const focusNode = useCallback((node: EntityTopoNode) => {
    setFilters((current) => ({
      ...current,
      focusIds: current.focusIds.includes(node.id) ? current.focusIds : [node.id],
      filterStacking: current.filterStacking,
    }))
    setSelected({ kind: 'node', node })
  }, [])

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_ENTITY_TOPO_FILTERS)
    setSearchDraft('')
  }, [])

  const applySearch = useCallback((text = searchDraft) => {
    const value = text.trim()
    setFilters((current) => ({ ...current, searchText: value }))
    setSearchDraft(value)
    setSearchOpen(false)
  }, [searchDraft])

  const applyPresetRange = useCallback((minutes: number) => {
    const end = new Date()
    const start = new Date(end.getTime() - minutes * 60 * 1000)
    setTimeRangeDraft({ from: toDateTimeLocal(start), to: toDateTimeLocal(end) })
  }, [])

  const executeTimeRange = useCallback(() => {
    if (timeRangeDraft.from === queryTimeRange.from && timeRangeDraft.to === queryTimeRange.to) {
      void load(timeRangeDraft)
      return
    }
    setQueryTimeRange(timeRangeDraft)
  }, [load, queryTimeRange.from, queryTimeRange.to, timeRangeDraft])

  const searchMatches = useMemo(() => {
    const query = searchDraft.trim().toLowerCase()
    if (!query) return []
    return data.nodes
      .filter((node) => node.searchText.toLowerCase().includes(query))
      .slice(0, 8)
  }, [data.nodes, searchDraft])

  return (
    <div className="eto-root">
      <aside className="eto-sidebar">
        <div className="eto-sidebar-tabs">
          <button className={sidebarTab === 'summary' ? 'active' : ''} onClick={() => setSidebarTab('summary')} type="button" title={t('entityTopoExplorer.tabs.summary')}>
            <Layers size={15} />
          </button>
          <button className={sidebarTab === 'display' ? 'active' : ''} onClick={() => setSidebarTab('display')} type="button" title={t('entityTopoExplorer.tabs.display')}>
            <Settings2 size={15} />
          </button>
        </div>

        {sidebarTab === 'summary' ? (
          <SummarySidebar
            data={data}
            filteredData={filteredData}
            filters={filters}
            onFiltersChange={setFilters}
          />
        ) : (
          <DisplaySidebar
            settings={displaySettings}
            onSettingsChange={setDisplaySettings}
          />
        )}
      </aside>

      <section className="eto-main">
        <header className="eto-topbar">
          <div className="eto-search-wrap">
            <Search size={14} />
            <input
              value={searchDraft}
              onBlur={() => {
                searchBlurRef.current = window.setTimeout(() => setSearchOpen(false), 160)
              }}
              onChange={(event) => {
                setSearchDraft(event.target.value)
                setSearchOpen(true)
              }}
              onFocus={() => {
                if (searchBlurRef.current) window.clearTimeout(searchBlurRef.current)
                setSearchOpen(true)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') applySearch()
                if (event.key === 'Escape') setSearchOpen(false)
              }}
              placeholder={t('entityTopoExplorer.search.placeholder')}
            />
            {searchOpen && (
              <SearchPopover
                query={searchDraft}
                nodes={searchMatches}
                clusters={data.clusters.slice(0, 8)}
                onApplySearch={applySearch}
                onFocusNode={(node) => {
                  focusNode(node)
                  setSearchOpen(false)
                }}
                onToggleType={(cluster) => {
                  setFilters((current) => ({ ...current, types: toggleFilterValue(current.types, cluster) }))
                  setSearchOpen(false)
                }}
              />
            )}
          </div>

          <div className="eto-timebar">
            <CalendarClock size={14} />
            <input
              aria-label={t('entityTopoExplorer.time.from')}
              type="datetime-local"
              value={timeRangeDraft.from}
              onChange={(event) => setTimeRangeDraft((current) => ({ ...current, from: event.target.value }))}
            />
            <span>{t('entityTopoExplorer.time.toSeparator')}</span>
            <input
              aria-label={t('entityTopoExplorer.time.to')}
              type="datetime-local"
              value={timeRangeDraft.to}
              onChange={(event) => setTimeRangeDraft((current) => ({ ...current, to: event.target.value }))}
            />
            <button type="button" onClick={() => applyPresetRange(15)}>15m</button>
            <button type="button" onClick={() => applyPresetRange(60)}>1h</button>
            <button type="button" onClick={() => applyPresetRange(24 * 60)}>24h</button>
            <button type="button" onClick={() => setTimeRangeDraft({ from: '', to: '' })}>{t('entityTopoExplorer.action.all')}</button>
            <button className="eto-execute-button" type="button" onClick={executeTimeRange}>
              <Play size={12} />
              {t('entityTopoExplorer.action.execute')}
            </button>
          </div>
        </header>

        <FilterBar
          activeCount={activeFilterCount}
          filters={filters}
          data={data}
          onFiltersChange={setFilters}
          onClear={clearFilters}
        />

        <div className="eto-content-area">
          <main className="eto-canvas-panel">
            {loading && data.nodes.length === 0 && <div className="eto-loading"><Activity size={16} /> {t('entityTopoExplorer.loading.topology')}</div>}
            {loading && data.nodes.length > 0 && <div className="eto-floating-badge">{t('entityTopoExplorer.loading.refreshing')}</div>}
            {!loading && error && (
              <div className="eto-empty-wrap">
                <EmptyState title={t('entityTopoExplorer.empty.queryFailed')} detail={error} action={<Button onClick={() => void load(queryTimeRange)}><RefreshCcw size={15} />{t('entityTopoExplorer.action.retry')}</Button>} />
              </div>
            )}
            {!loading && !error && data.nodes.length === 0 && (
              <div className="eto-empty-wrap">
                <EmptyState
                  title={t('entityTopoExplorer.empty.noData.title')}
                  detail={t('entityTopoExplorer.empty.noData.detail')}
                  action={
                    <Button variant="primary" disabled={sampleImporting} onClick={() => void importSample()}>
                      <Sparkles size={15} />
                      {sampleImporting ? t('entityTopoExplorer.action.importingSample') : t('entityTopoExplorer.action.importQuickstartSample')}
                    </Button>
                  }
                />
              </div>
            )}
            {!loading && !error && data.nodes.length > 0 && filteredData.nodes.length === 0 && (
              <div className="eto-empty-wrap">
                <EmptyState
                  title={t('entityTopoExplorer.empty.noMatching.title')}
                  detail={t('entityTopoExplorer.empty.noMatching.detail')}
                  action={<Button variant="primary" onClick={clearFilters}><FilterX size={15} />{t('entityTopoExplorer.action.clearFilters')}</Button>}
                />
              </div>
            )}
            {filteredData.nodes.length > 0 && (
              <EntityTopoGraphView
                data={filteredData}
                focusIds={filters.focusIds}
                selected={selected}
                settings={displaySettings}
                zoomLevel={zoomLevel}
                onSelect={setSelected}
                onFocusNode={focusNode}
                onZoomLevelChange={setZoomLevel}
              />
            )}
          </main>

          <DetailPanel
            selection={selected}
            data={data}
            onClose={() => setSelected(null)}
            onFocusNode={focusNode}
          />
        </div>

        <footer className="eto-statusbar">
          <span><strong>{filteredData.nodes.length.toLocaleString()}</strong> {t('entityTopoExplorer.status.entities')}</span>
          <span className="eto-status-sep" />
          <span><strong>{filteredData.edges.length.toLocaleString()}</strong> {t('entityTopoExplorer.status.relations')}</span>
          {data.limitInfo.reached && (
            <>
              <span className="eto-status-sep" />
              <span className="eto-status-warning"><span /> {t('entityTopoExplorer.status.limit', { limit: data.limitInfo.limit.toLocaleString() })}</span>
            </>
          )}
        </footer>
      </section>
    </div>
  )
}

function SummarySidebar({
  data,
  filteredData,
  filters,
  onFiltersChange,
}: {
  data: EntityTopoData
  filteredData: EntityTopoData
  filters: EntityTopoFilters
  onFiltersChange: (filters: EntityTopoFilters) => void
}) {
  const { t } = useI18n()
  const [domainShowCount, setDomainShowCount] = useState(8)
  const hasDomainFilter = filters.domains.length > 0
  const hasTypeFilter = filters.types.length > 0

  return (
    <div className="eto-sidebar-body">
      <div className="eto-stats-grid">
        <StatCard label={t('entityTopoExplorer.stat.entities')} value={data.nodes.length} filtered={filteredData.nodes.length} />
        <StatCard label={t('entityTopoExplorer.stat.relations')} value={data.edges.length} filtered={filteredData.edges.length} />
      </div>

      <SidebarSection title={t('entityTopoExplorer.sidebar.domains')}>
        {data.domains.slice(0, domainShowCount).map((item) => (
          <FilterRow
            key={item.domain}
            label={item.domain}
            count={item.count}
            active={filters.domains.includes(item.domain)}
            dimmed={hasDomainFilter && !filters.domains.includes(item.domain)}
            color="#10a37f"
            onClick={() => onFiltersChange({ ...filters, domains: toggleFilterValue(filters.domains, item.domain) })}
          />
        ))}
        {domainShowCount < data.domains.length && (
          <button className="eto-sidebar-more" type="button" onClick={() => setDomainShowCount((count) => count + 10)}>
            {t('entityTopoExplorer.sidebar.showMore', { count: Math.min(10, data.domains.length - domainShowCount) })}
          </button>
        )}
      </SidebarSection>

      <SidebarSection title={t('entityTopoExplorer.sidebar.entityTypes')}>
        {data.clusters.map((item) => (
          <FilterRow
            key={item.cluster}
            label={item.displayName}
            count={item.count}
            active={filters.types.includes(item.cluster)}
            dimmed={hasTypeFilter && !filters.types.includes(item.cluster)}
            color={item.visual.color}
            onClick={() => onFiltersChange({ ...filters, types: toggleFilterValue(filters.types, item.cluster) })}
          />
        ))}
      </SidebarSection>

      <SidebarSection title={t('entityTopoExplorer.sidebar.relations')}>
        {data.relationTypes.map((item) => (
          <FilterRow
            key={item.type}
            label={item.type}
            count={item.count}
            active={filters.relations.includes(item.type)}
            dimmed={filters.relations.length > 0 && !filters.relations.includes(item.type)}
            color="#64748b"
            onClick={() => onFiltersChange({ ...filters, relations: toggleFilterValue(filters.relations, item.type) })}
          />
        ))}
      </SidebarSection>
    </div>
  )
}

function DisplaySidebar({
  settings,
  onSettingsChange,
}: {
  settings: EntityTopoDisplaySettings
  onSettingsChange: (settings: EntityTopoDisplaySettings) => void
}) {
  const { t } = useI18n()
  const update = (partial: Partial<EntityTopoDisplaySettings>) => {
    onSettingsChange({ ...settings, ...partial })
  }
  const updateLayoutAlgorithm = (layoutAlgorithm: EntityTopoDisplaySettings['layoutAlgorithm']) => {
    update({
      layoutAlgorithm,
      showClusterLabels: layoutAlgorithm === 'grouped',
    })
  }

  return (
    <div className="eto-sidebar-body eto-layout-tab">
      <div className="eto-layout-block">
        <div className="eto-sidebar-section-title">{t('entityTopoExplorer.settings.view')}</div>
        <div className="eto-layout-options">
          <LayoutRadioOption
            active={settings.layoutAlgorithm === 'force'}
            label={t('entityTopoExplorer.settings.force')}
            desc={t('entityTopoExplorer.settings.forceDesc')}
            onClick={() => updateLayoutAlgorithm('force')}
          />
          <LayoutRadioOption
            active={settings.layoutAlgorithm === 'grouped'}
            label={t('entityTopoExplorer.settings.grouped')}
            desc={t('entityTopoExplorer.settings.groupedDesc')}
            onClick={() => updateLayoutAlgorithm('grouped')}
          />
        </div>
      </div>

      <div className="eto-layout-block">
        <div className="eto-sidebar-section-title">{t('entityTopoExplorer.settings.display')}</div>
        <LayoutToggleRow label={t('entityTopoExplorer.settings.entityLabels')} value={settings.showLabels} onChange={(showLabels) => update({ showLabels })} />
        <LayoutToggleRow
          label={t('entityTopoExplorer.settings.groupLabels')}
          value={settings.layoutAlgorithm === 'grouped' && settings.showClusterLabels}
          disabled={settings.layoutAlgorithm !== 'grouped'}
          disabledReason={t('entityTopoExplorer.settings.groupLabelsDisabled')}
          onChange={(showClusterLabels) => update({ showClusterLabels: settings.layoutAlgorithm === 'grouped' ? showClusterLabels : false })}
        />
        <LayoutToggleRow label={t('entityTopoExplorer.settings.overviewMap')} value={settings.showMiniMap} onChange={(showMiniMap) => update({ showMiniMap })} />
        <LayoutToggleRow label={t('entityTopoExplorer.settings.dragEntities')} value={settings.enableDrag} onChange={(enableDrag) => update({ enableDrag })} />
      </div>
    </div>
  )
}

function FilterBar({
  activeCount,
  filters,
  data,
  onFiltersChange,
  onClear,
}: {
  activeCount: number
  filters: EntityTopoFilters
  data: EntityTopoData
  onFiltersChange: (filters: EntityTopoFilters) => void
  onClear: () => void
}) {
  const { t } = useI18n()
  const [helpOpen, setHelpOpen] = useState(false)
  const [focusPanelOpen, setFocusPanelOpen] = useState(false)
  const helpRef = useRef<HTMLSpanElement | null>(null)
  const focusRef = useRef<HTMLSpanElement | null>(null)
  const helpTimerRef = useRef<number | null>(null)
  const focusTimerRef = useRef<number | null>(null)
  const clusterById = new Map(data.clusters.map((cluster) => [cluster.cluster, cluster]))
  const nodeById = new Map(data.nodes.map((node) => [node.id, node]))
  const hasFilters = hasEntityTopoFilters(filters)
  const hasFocus = filters.focusIds.length > 0
  const secondaryFiltersDisabled = hasFocus && !filters.filterStacking
  const focusItems = filters.focusIds.map((id) => nodeById.get(id)).filter(Boolean) as EntityTopoNode[]

  const openHelp = () => {
    if (helpTimerRef.current) window.clearTimeout(helpTimerRef.current)
    helpTimerRef.current = null
    setHelpOpen(true)
  }
  const closeHelpDelayed = () => {
    if (helpTimerRef.current) window.clearTimeout(helpTimerRef.current)
    helpTimerRef.current = window.setTimeout(() => setHelpOpen(false), 180)
  }
  const openFocusPanel = () => {
    if (focusTimerRef.current) window.clearTimeout(focusTimerRef.current)
    focusTimerRef.current = null
    setFocusPanelOpen(true)
  }
  const closeFocusPanelDelayed = () => {
    if (focusTimerRef.current) window.clearTimeout(focusTimerRef.current)
    focusTimerRef.current = window.setTimeout(() => setFocusPanelOpen(false), 180)
  }

  return (
    <div className="eto-filterbar">
      <span
        ref={helpRef}
        className="eto-filter-help"
        onMouseEnter={openHelp}
        onMouseLeave={closeHelpDelayed}
        tabIndex={0}
      >
        <CircleHelp size={14} />
      </span>
      {helpOpen && helpRef.current && typeof document !== 'undefined' && ReactDOM.createPortal(
        <FilterHelpTooltip
          anchorRect={helpRef.current.getBoundingClientRect()}
          onMouseEnter={openHelp}
          onMouseLeave={closeHelpDelayed}
        />,
        document.body,
      )}
      <span className="eto-filter-count-label"><SlidersHorizontal size={13} /> {activeCount}</span>
      {!hasFilters && <span className="eto-filter-empty">{t('entityTopoExplorer.filter.noActive')}</span>}
      {hasFocus && (
        <>
          <span
            ref={focusRef}
            className="eto-focus-chip"
            onClick={openFocusPanel}
            onMouseEnter={openFocusPanel}
            onMouseLeave={closeFocusPanelDelayed}
          >
            <Crosshair size={12} />
            {t('entityTopoExplorer.filter.focus')} ({filters.focusIds.length})
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onFiltersChange({ ...filters, focusIds: [] })
              }}
              aria-label={t('entityTopoExplorer.action.clearFocus')}
            >
              <X size={10} />
            </button>
          </span>
          {focusPanelOpen && focusRef.current && typeof document !== 'undefined' && ReactDOM.createPortal(
            <FocusDropdown
              items={focusItems}
              anchorRect={focusRef.current.getBoundingClientRect()}
              onRemove={(id) => onFiltersChange({ ...filters, focusIds: filters.focusIds.filter((item) => item !== id) })}
              onClearAll={() => {
                onFiltersChange({ ...filters, focusIds: [] })
                setFocusPanelOpen(false)
              }}
              onMouseEnter={openFocusPanel}
              onMouseLeave={closeFocusPanelDelayed}
            />,
            document.body,
          )}
          <span className="eto-filter-separator" />
          <button
            className={filters.filterStacking ? 'eto-stack-toggle active' : 'eto-stack-toggle'}
            onClick={() => onFiltersChange({ ...filters, filterStacking: !filters.filterStacking })}
            type="button"
          >
            <span><i /></span>
            {t('entityTopoExplorer.filter.stack')}
          </button>
        </>
      )}
      {filters.types.map((type) => (
        <FilterChip
          key={type}
          label={clusterById.get(type)?.displayName || type}
          color={clusterById.get(type)?.visual.color}
          dimmed={secondaryFiltersDisabled}
          onRemove={() => onFiltersChange({ ...filters, types: filters.types.filter((item) => item !== type) })}
        />
      ))}
      {filters.attributeFilters.map((filter) => {
        const meta = clusterById.get(filter.cluster)
        return (
          <FilterChip
            key={getAttributeFilterKey(filter)}
            label={`${filter.field}=${filter.value}`}
            prefix={meta?.displayName || filter.cluster}
            color={meta?.visual.color}
            dimmed={secondaryFiltersDisabled}
            onRemove={() => onFiltersChange({
              ...filters,
              attributeFilters: filters.attributeFilters.filter((item) => getAttributeFilterKey(item) !== getAttributeFilterKey(filter)),
            })}
          />
        )
      })}
      {filters.domains.map((domain) => (
        <FilterChip
          key={domain}
          label={domain}
          prefix={t('entityTopoExplorer.filter.domainPrefix')}
          dimmed={secondaryFiltersDisabled}
          onRemove={() => onFiltersChange({ ...filters, domains: filters.domains.filter((item) => item !== domain) })}
        />
      ))}
      {filters.relations.map((relation) => (
        <FilterChip
          key={relation}
          label={relation}
          prefix={t('entityTopoExplorer.filter.relationPrefix')}
          dimmed={secondaryFiltersDisabled}
          onRemove={() => onFiltersChange({ ...filters, relations: filters.relations.filter((item) => item !== relation) })}
        />
      ))}
      {filters.searchText && (
        <FilterChip
          label={filters.searchText}
          prefix={t('entityTopoExplorer.filter.searchPrefix')}
          dimmed={secondaryFiltersDisabled}
          onRemove={() => onFiltersChange({ ...filters, searchText: '' })}
        />
      )}
      {hasFilters && <button className="eto-clear-filters" onClick={onClear} type="button"><Trash2 size={13} />{t('entityTopoExplorer.action.clear')}</button>}
    </div>
  )
}

function FilterHelpTooltip({
  anchorRect,
  onMouseEnter,
  onMouseLeave,
}: {
  anchorRect: DOMRect
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  const { t } = useI18n()
  const width = 320
  const left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - width - 8))
  const top = Math.min(anchorRect.bottom + 8, window.innerHeight - 196)
  return (
    <div
      className="eto-filter-help-panel"
      style={{ left, top, width }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <strong>{t('entityTopoExplorer.filter.help.title')}</strong>
      <p><b>{t('entityTopoExplorer.filter.help.focusLabel')}</b> {t('entityTopoExplorer.filter.help.line1')}</p>
      <p>{t('entityTopoExplorer.filter.help.line2')}</p>
      <p>{t('entityTopoExplorer.filter.help.line3')}</p>
    </div>
  )
}

function FocusDropdown({
  items,
  anchorRect,
  onRemove,
  onClearAll,
  onMouseEnter,
  onMouseLeave,
}: {
  items: EntityTopoNode[]
  anchorRect: DOMRect
  onRemove: (id: string) => void
  onClearAll: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  const { t } = useI18n()
  const panelWidth = 320
  const panelMaxHeight = Math.min(320, Math.max(160, window.innerHeight - 16))
  const left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - panelWidth - 8))
  const top = Math.max(8, Math.min(anchorRect.bottom + 6, window.innerHeight - panelMaxHeight - 8))
  return (
    <div
      className="eto-focus-dropdown"
      style={{ left, top, width: panelWidth, maxHeight: panelMaxHeight }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="eto-focus-dropdown-head">
        <strong>{t('entityTopoExplorer.filter.focusedEntities', { count: items.length })}</strong>
        <button type="button" onClick={onClearAll}>{t('entityTopoExplorer.action.clear')}</button>
      </div>
      {items.map((item) => (
        <div className="eto-focus-dropdown-row" key={item.id} title={`${item.title}\n${endpointLabel(item.endpoint)}`}>
          <span className="eto-type-dot" style={{ background: item.visual.color }} />
          <span>
            <b>{item.title}</b>
            <small>{endpointLabel(item.endpoint)}</small>
          </span>
          <button type="button" onClick={() => onRemove(item.id)} aria-label={t('entityTopoExplorer.action.removeFocusItem', { label: item.title })}>
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}

function DetailPanel({
  selection,
  data,
  onClose,
  onFocusNode,
}: {
  selection: TopoSelection | null
  data: EntityTopoData
  onClose: () => void
  onFocusNode: (node: EntityTopoNode) => void
}) {
  const { t } = useI18n()
  if (!selection) return null
  const nodeById = new Map(data.nodes.map((node) => [node.id, node]))

  if (selection.kind === 'edge') {
    const edge = selection.edge
    const source = nodeById.get(edge.source)
    const target = nodeById.get(edge.target)
    return (
      <aside className="eto-detail-panel open">
        <DetailHeader title={edge.relationType} subtitle={t('entityTopoExplorer.detail.relation')} icon={<ArrowRight size={16} />} onClose={onClose} />
        <div className="eto-detail-body">
          {source && target && (
            <div className="eto-edge-route">
              <RouteNode node={source} label={t('entityTopoExplorer.detail.source')} onFocus={onFocusNode} />
              <div className="eto-route-line"><span>{edge.relationType}</span></div>
              <RouteNode node={target} label={t('entityTopoExplorer.detail.target')} onFocus={onFocusNode} />
            </div>
          )}
          <DetailTable rows={detailRows(edge.row)} />
        </div>
      </aside>
    )
  }

  const node = selection.node
  return (
    <aside className="eto-detail-panel open">
      <DetailHeader
        title={node.title}
        subtitle={node.endpoint.entityType}
        icon={<Database size={16} />}
        color={node.visual.color}
        onClose={onClose}
      />
      <div className="eto-detail-body">
        <div className="eto-detail-summary">
          <span><strong>{node.inDegree}</strong> {t('entityTopoExplorer.detail.inbound')}</span>
          <span><strong>{node.outDegree}</strong> {t('entityTopoExplorer.detail.outbound')}</span>
          <span><strong>{node.relationCount}</strong> {t('entityTopoExplorer.detail.total')}</span>
        </div>
        <DetailTable
          rows={[
            ...(node.titleSource ? [['label_source', node.titleSource] as [string, unknown]] : []),
            ...detailRows(node.properties),
            ['domain', node.endpoint.domain],
            ['entity_type', node.endpoint.entityType],
            ['entity_id', node.endpoint.entityId],
            ['cluster', node.endpoint.cluster],
          ]}
        />
      </div>
    </aside>
  )
}

function SearchPopover({
  query,
  nodes,
  clusters,
  onApplySearch,
  onFocusNode,
  onToggleType,
}: {
  query: string
  nodes: EntityTopoNode[]
  clusters: EntityTopoClusterMeta[]
  onApplySearch: (query: string) => void
  onFocusNode: (node: EntityTopoNode) => void
  onToggleType: (cluster: string) => void
}) {
  const { t } = useI18n()
  return (
    <div className="eto-search-popover" onMouseDown={(event) => event.preventDefault()}>
      {query.trim() && (
        <button className="eto-search-command" onClick={() => onApplySearch(query)} type="button">
          <Search size={13} />
          {t('entityTopoExplorer.search.command', { query: query.trim() })}
        </button>
      )}
      <div className="eto-search-section">
        <strong>{t('entityTopoExplorer.search.entities')}</strong>
        {nodes.length === 0 ? <span className="eto-search-empty">{t('entityTopoExplorer.search.noMatchingEntities')}</span> : nodes.map((node) => (
          <button key={node.id} onClick={() => onFocusNode(node)} type="button">
            <span className="eto-search-dot" style={{ background: node.visual.color }} />
            <span>
              <b>{node.title}</b>
              <small>{endpointLabel(node.endpoint)}</small>
            </span>
          </button>
        ))}
      </div>
      <div className="eto-search-section">
        <strong>{t('entityTopoExplorer.search.types')}</strong>
        <div className="eto-token-cloud">
          {clusters.map((cluster) => (
            <button key={cluster.cluster} onClick={() => onToggleType(cluster.cluster)} type="button">
              <span style={{ background: cluster.visual.color }} />
              {cluster.displayName}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function SidebarSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="eto-sidebar-section">
      <div className="eto-sidebar-section-title">{title}</div>
      <div className="eto-sidebar-section-body">{children}</div>
    </section>
  )
}

function FilterRow({
  label,
  meta,
  count,
  color,
  active,
  dimmed,
  suffix,
  onPointerEnter,
  onPointerMove,
  onPointerLeave,
  onMouseEnter,
  onMouseMove,
  onMouseLeave,
  onClick,
}: {
  label: string
  meta?: string
  count: number
  color: string
  active: boolean
  dimmed: boolean
  suffix?: ReactNode
  onPointerEnter?: PointerEventHandler<HTMLButtonElement>
  onPointerMove?: PointerEventHandler<HTMLButtonElement>
  onPointerLeave?: PointerEventHandler<HTMLButtonElement>
  onMouseEnter?: MouseEventHandler<HTMLButtonElement>
  onMouseMove?: MouseEventHandler<HTMLButtonElement>
  onMouseLeave?: MouseEventHandler<HTMLButtonElement>
  onClick: () => void
}) {
  return (
    <button
      className={`eto-filter-row ${active ? 'active' : ''} ${dimmed ? 'dimmed' : ''}`}
      onClick={onClick}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onMouseEnter={onMouseEnter}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      type="button"
    >
      <span className="eto-type-dot" style={{ background: color }} />
      <span className="eto-filter-label">
        <b>{label}</b>
        {meta && <small>{meta}</small>}
      </span>
      <span className="eto-filter-row-meta">
        <span className="eto-filter-count">{count.toLocaleString()}</span>
        {suffix && <span className="eto-filter-suffix">{suffix}</span>}
      </span>
    </button>
  )
}

function LayoutRadioOption({
  active,
  label,
  desc,
  onClick,
}: {
  active: boolean
  label: string
  desc?: string
  onClick: () => void
}) {
  return (
    <button className={active ? 'eto-layout-radio active' : 'eto-layout-radio'} onClick={onClick} type="button">
      <span className="eto-layout-radio-mark"><i /></span>
      <span className="eto-layout-radio-copy">
        <b>{label}</b>
        {desc && <small>{desc}</small>}
      </span>
    </button>
  )
}

function LayoutToggleRow({
  label,
  value,
  disabled = false,
  disabledReason,
  onChange,
}: {
  label: string
  value: boolean
  disabled?: boolean
  disabledReason?: string
  onChange: (value: boolean) => void
}) {
  return (
    <button
      className={value ? 'eto-layout-toggle active' : 'eto-layout-toggle'}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      onClick={() => onChange(!value)}
      type="button"
    >
      <span>{label}</span>
      <span className="eto-layout-switch"><i /></span>
    </button>
  )
}

function StatCard({ label, value, filtered }: { label: string; value: number; filtered: number }) {
  const { t } = useI18n()
  return (
    <div className="eto-stat-card">
      <strong>{filtered.toLocaleString()}</strong>
      <span>{label}</span>
      {filtered !== value && <small>{t('entityTopoExplorer.stat.filteredOf', { count: value.toLocaleString() })}</small>}
    </div>
  )
}

function FilterChip({
  label,
  prefix,
  color,
  dimmed,
  onRemove,
}: {
  label: string
  prefix?: string
  color?: string
  dimmed?: boolean
  onRemove: () => void
}) {
  const { t } = useI18n()
  return (
    <span className={dimmed ? 'eto-filter-chip dimmed' : 'eto-filter-chip'} title={`${prefix ? `${prefix}: ` : ''}${label}`}>
      {color && <span className="eto-filter-chip-dot" style={{ background: color }} />}
      {prefix && <span className="eto-filter-chip-prefix">{prefix}</span>}
      <span>{label}</span>
      <button onClick={onRemove} type="button" aria-label={t('entityTopoExplorer.action.removeFilter', { label })}><X size={12} /></button>
    </span>
  )
}

function DetailHeader({
  title,
  subtitle,
  icon,
  color = '#64748b',
  onClose,
}: {
  title: string
  subtitle: string
  icon: React.ReactNode
  color?: string
  onClose: () => void
}) {
  const { t } = useI18n()
  return (
    <header className="eto-detail-header">
      <div className="eto-detail-icon" style={{ color, background: `${color}14`, borderColor: `${color}33` }}>
        {icon}
      </div>
      <div className="eto-detail-title">
        <strong>{title}</strong>
        <code>{subtitle}</code>
      </div>
      <button className="eto-icon-button subtle" onClick={onClose} type="button" title={t('entityTopoExplorer.action.close')}>
        <X size={15} />
      </button>
    </header>
  )
}

function RouteNode({ node, label, onFocus }: { node: EntityTopoNode; label: string; onFocus: (node: EntityTopoNode) => void }) {
  return (
    <button className="eto-route-node" onClick={() => onFocus(node)} type="button">
      <span className="eto-route-icon" style={{ background: node.visual.bg, color: node.visual.text }}>
        <Database size={14} />
      </span>
      <span>
        <b>{node.title}</b>
        <small>{label} · {node.endpoint.entityType}</small>
      </span>
    </button>
  )
}

function DetailTable({ rows }: { rows: Array<[string, unknown]> }) {
  const { t } = useI18n()
  if (rows.length === 0) return <div className="eto-detail-empty">{t('entityTopoExplorer.detail.noProperties')}</div>
  return (
    <table className="eto-detail-table">
      <tbody>
        {rows.map(([key, value]) => (
          <tr key={key}>
            <td>{key}</td>
            <td>{formatTopoValue(value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function detailRows(row: Record<string, unknown>) {
  return Object.entries(row)
    .filter(([, value]) => value !== undefined && value !== null && formatTopoValue(value).trim() !== '')
    .slice(0, 28)
}

function resolveSelection(selection: TopoSelection | null, data: EntityTopoData): TopoSelection | null {
  if (!selection) return null
  if (selection.kind === 'node') {
    const node = data.nodes.find((item) => item.id === selection.node.id)
    return node ? { kind: 'node', node } : null
  }
  const edge = data.edges.find((item) => item.id === selection.edge.id)
  return edge ? { kind: 'edge', edge } : null
}

function createDefaultTimeRange() {
  return { from: '', to: '' }
}

type QueryTimeRange = {
  from?: string
  to?: string
}

async function loadEntityTopoData(api: UModelApi, workspaceId: string, timeRange: QueryTimeRange) {
  try {
    const topoResult = await api.query(workspaceId, {
      query: entityTopoCypherQuery(ENTITY_TOPO_LIMIT),
      limit: ENTITY_TOPO_LIMIT,
      time_range: timeRange,
    })
    return { topoResult, entityRows: [] }
  } catch {
    const [topoResult, entityResult] = await Promise.all([
      api.query(workspaceId, {
        query: `.topo | limit ${ENTITY_TOPO_LIMIT}`,
        limit: ENTITY_TOPO_LIMIT,
        time_range: timeRange,
      }),
      api.query(workspaceId, {
        query: `.entity | limit ${ENTITY_PROPERTY_LIMIT}`,
        limit: ENTITY_PROPERTY_LIMIT,
        time_range: timeRange,
      }).catch(() => null),
    ])
    return { topoResult, entityRows: entityResult?.rows || [] }
  }
}

function entityTopoCypherQuery(limit: number) {
  return `.topo | graph-call cypher(\`MATCH (src)-[r]->(dest) RETURN properties(src) AS src, properties(r) AS relation, properties(dest) AS dest LIMIT ${limit}\`) | limit ${limit}`
}

function toDateTimeLocal(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function toIsoOrUndefined(value: string) {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function rowToElement(row: Record<string, unknown>): UModelElement {
  const metadata = isObject(row.metadata) ? row.metadata : undefined
  const domain = optionalString(row.domain) || optionalString(metadata?.domain)
  const name = optionalString(row.name) || optionalString(metadata?.name)
  return {
    kind: String(row.kind || ''),
    domain: domain || '',
    name: name || '',
    version: optionalString(row.version) || optionalString(metadata?.version),
    spec: isObject(row.spec) ? row.spec : undefined,
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}
