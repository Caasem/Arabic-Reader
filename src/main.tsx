import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/shared/ErrorBoundary.tsx'
import { dictionaryManager } from './dictionary/DictionaryManager'
import { aramorphProvider } from './dictionary/providers/aramorph/AramorphDictionaryProvider'

// Temporary on-device debugging aid (see the "no definition found on Android"
// investigation) -- lets chrome://inspect's console run
// `await __dbg.dictionaryManager.lookup('كان')` directly against the live
// singletons instead of us having to guess what's happening on a device we
// can't attach a debugger to any other way. Safe to leave in: read-only,
// no PII, same objects the app itself already uses.
;(window as unknown as { __dbg: unknown }).__dbg = { dictionaryManager, aramorphProvider }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
