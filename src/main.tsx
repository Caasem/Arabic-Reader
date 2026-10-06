import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/shared/ErrorBoundary.tsx'
import { installGlobalErrorLogging } from './diagnostics/diagnosticsLog'
import { runMigrationGate } from './persistence/migrationGate'
import { markDesktopApp } from './utils/desktop'

installGlobalErrorLogging()
markDesktopApp()

// Dev-only console handle on the live dictionary singletons, e.g.
// `await __dbg.dictionaryManager.lookup('كان')`. Never shipped: production
// builds must not hand page scripts a direct line to app services.
if (import.meta.env.DEV) {
  Promise.all([
    import('./dictionary'),
    import('./dictionary/providers/aramorph/AramorphDictionaryProvider'),
  ]).then(([{ dictionaryManager }, { aramorphProvider }]) => {
    ;(window as unknown as { __dbg: unknown }).__dbg = { dictionaryManager, aramorphProvider }
  })
}

const rootElement = document.getElementById('root')!

// The data upgrade (schema v10) must not run before its verified backup exists,
// so nothing renders -- and nothing opens the database -- until the gate passes.
runMigrationGate()
  .then(() => {
    createRoot(rootElement).render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>,
    )
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    rootElement.textContent = `${message} Reload the page to try again. Your data has not been changed.`
    rootElement.style.cssText = 'padding:2rem;font:16px system-ui;max-width:40rem;margin:auto'
  })
