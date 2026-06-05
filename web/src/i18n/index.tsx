import {
  Fragment,
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Check, ChevronDown, Languages } from 'lucide-react'
import { useLocalStorageState } from '../lib/storage'
import { enUS } from './locales/en-US'
import { zhCN } from './locales/zh-CN'

export type MessageKey = keyof typeof enUS
export type MessageParams = Record<string, string | number>
export type RichTextRenderer = (chunks: ReactNode) => ReactNode
export type RichTextRenderers = Record<string, RichTextRenderer>

export interface TFunction {
  (key: MessageKey, params?: MessageParams): string
  rich: (key: MessageKey, renderers: RichTextRenderers, params?: MessageParams) => ReactNode
}

export const localeOptions = [
  { value: 'en-US', labelKey: 'language.english' },
  { value: 'zh-CN', labelKey: 'language.simplifiedChinese' },
] as const satisfies ReadonlyArray<{ value: string; labelKey: MessageKey }>

export type Locale = (typeof localeOptions)[number]['value']

const defaultLocale: Locale = 'en-US'
const localeStorageKey = 'openumodel.locale'

const messages = {
  'en-US': enUS,
  'zh-CN': zhCN,
} satisfies Record<Locale, Partial<Record<MessageKey, string>>>

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: TFunction
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setStoredLocale] = useLocalStorageState<Locale>(localeStorageKey, detectLocale())
  const safeLocale = isLocale(locale) ? locale : defaultLocale

  useEffect(() => {
    document.documentElement.lang = safeLocale
  }, [safeLocale])

  const value = useMemo<I18nContextValue>(() => {
    const t = ((key, params) => interpolate(getMessage(safeLocale, key), params)) as TFunction
    t.rich = (key, renderers, params) => renderRichMessage(getMessage(safeLocale, key), renderers, params)

    return {
      locale: safeLocale,
      setLocale: setStoredLocale,
      t,
    }
  }, [safeLocale, setStoredLocale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const value = useContext(I18nContext)
  if (!value) {
    throw new Error('useI18n must be used inside I18nProvider')
  }
  return value
}

export function LanguageSelect({
  className = '',
  showLabel = true,
}: {
  className?: string
  showLabel?: boolean
}) {
  const { locale, setLocale, t } = useI18n()
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const activeOption = localeOptions.find((option) => option.value === locale) ?? localeOptions[0]

  useEffect(() => {
    if (!open) return

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div className={`language-select ${showLabel ? '' : 'compact'} ${className}`} ref={rootRef}>
      {showLabel && <span className="om-label">{t('language.label')}</span>}
      <button
        type="button"
        className="language-trigger"
        aria-label={t('language.label')}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <Languages size={15} />
        <span>{t(activeOption.labelKey)}</span>
        <ChevronDown className="language-trigger-chevron" size={15} />
      </button>
      {open && (
        <div className="language-menu" id={menuId} role="menu" aria-label={t('language.label')}>
          {localeOptions.map((option) => {
            const selected = option.value === locale
            return (
              <button
                key={option.value}
                type="button"
                className={selected ? 'active' : ''}
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  setLocale(option.value)
                  setOpen(false)
                }}
              >
                <span>{t(option.labelKey)}</span>
                {selected && <Check size={14} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function getMessage(locale: Locale, key: MessageKey) {
  return messages[locale][key] ?? enUS[key]
}

function interpolate(template: string, params?: MessageParams) {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key]
    return value === undefined ? match : String(value)
  })
}

type RichMessagePart = string | { tag: string; children: RichMessagePart[] }

function renderRichMessage(template: string, renderers: RichTextRenderers, params?: MessageParams) {
  const parts = parseRichMessage(template)
  if (!parts) return interpolate(template, params)
  return renderRichParts(parts, renderers, params)
}

function parseRichMessage(template: string): RichMessagePart[] | null {
  const root = { tag: '', children: [] as RichMessagePart[] }
  const stack = [root]
  const tokens = template.split(/(<\/?[A-Za-z][\w-]*>)/g).filter(Boolean)

  for (const token of tokens) {
    const open = token.match(/^<([A-Za-z][\w-]*)>$/)
    if (open) {
      stack.push({ tag: open[1], children: [] })
      continue
    }

    const close = token.match(/^<\/([A-Za-z][\w-]*)>$/)
    if (close) {
      const current = stack.pop()
      if (!current || current.tag !== close[1]) return null
      stack[stack.length - 1].children.push(current)
      continue
    }

    stack[stack.length - 1].children.push(token)
  }

  return stack.length === 1 ? root.children : null
}

function renderRichParts(
  parts: RichMessagePart[],
  renderers: RichTextRenderers,
  params: MessageParams | undefined,
  path = 'r',
): ReactNode[] {
  return parts.map((part, index) => {
    const key = `${path}-${index}`
    if (typeof part === 'string') {
      return <Fragment key={key}>{interpolate(part, params)}</Fragment>
    }

    const children = renderRichParts(part.children, renderers, params, key)
    const content = children.length === 1 ? children[0] : children
    const rendered = renderers[part.tag]?.(content) ?? content
    return <Fragment key={key}>{rendered}</Fragment>
  })
}

function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return defaultLocale
  const language = navigator.language.toLowerCase()
  return language.startsWith('zh') ? 'zh-CN' : defaultLocale
}

function isLocale(value: string): value is Locale {
  return localeOptions.some((option) => option.value === value)
}
