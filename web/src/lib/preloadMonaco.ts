let monacoPreload: Promise<unknown> | null = null

export function preloadMonaco() {
  if (monacoPreload) return monacoPreload

  disableMonacoEditContext()
  monacoPreload = import('@monaco-editor/react')
    .then(({ loader }) => loader.init())
    .catch((error) => {
      monacoPreload = null
      throw error
    })

  return monacoPreload
}

export function scheduleMonacoPreload() {
  const run = () => {
    void preloadMonaco().catch(() => undefined)
  }
  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number
    cancelIdleCallback?: (handle: number) => void
  }

  if (idleWindow.requestIdleCallback) {
    const handle = idleWindow.requestIdleCallback(run, { timeout: 1800 })
    return () => idleWindow.cancelIdleCallback?.(handle)
  }

  const handle = window.setTimeout(run, 600)
  return () => window.clearTimeout(handle)
}

export function disableMonacoEditContext() {
  const editableGlobal = globalThis as typeof globalThis & { EditContext?: unknown }
  if (!('EditContext' in editableGlobal)) return

  try {
    // Monaco's native EditContext path can swallow input in embedded browsers.
    Object.defineProperty(editableGlobal, 'EditContext', { value: undefined, configurable: true })
  } catch {
    editableGlobal.EditContext = undefined
  }
}
