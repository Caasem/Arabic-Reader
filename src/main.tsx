import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/shared/ErrorBoundary.tsx'
import { installGlobalErrorLogging } from './diagnostics/diagnosticsLog'

installGlobalErrorLogging()

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
