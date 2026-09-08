import { Component, type ErrorInfo, type ReactNode } from 'react';
import './ErrorBoundary.css';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time exceptions anywhere below it and shows a recovery
 * screen instead of leaving the whole app blank — the previous state (no
 * boundary at all) meant a single unexpected null, a malformed EPUB, or
 * any other uncaught error anywhere in the tree took down the entire app
 * for a real visitor with no way to recover short of guessing to reload.
 *
 * Deliberately reassures rather than alarms: everything this app persists
 * lives in the browser's own IndexedDB, completely unaffected by a React
 * render crash, so "reload" is a genuinely safe first suggestion — no data
 * is at risk from this specific failure mode.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No telemetry is wired up (this app doesn't send anything off-device
    // by design) — logging to the console is the only trace a developer
    // debugging via a shared screen recording or remote console has.
    console.error('Unhandled error in the app UI:', error, info.componentStack);
  }

  private reload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="error-boundary">
        <div className="error-boundary__card">
          <h1>Something went wrong</h1>
          <p>
            The app hit an unexpected error and couldn't continue. Your saved books, vocabulary, and reading
            progress are stored in this browser and are not affected — reloading should get you back to normal.
          </p>
          <button className="btn btn--primary" onClick={this.reload}>
            Reload
          </button>
          <details className="error-boundary__details">
            <summary>Technical details</summary>
            <pre>{this.state.error.message}</pre>
          </details>
        </div>
      </div>
    );
  }
}
