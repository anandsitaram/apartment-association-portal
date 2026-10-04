import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

// A stale chunk reference (the browser still has an old page open, referencing
// a JS chunk file whose hashed name no longer exists after a new deploy)
// throws exactly this kind of error from a dynamic import(); different
// browsers phrase it slightly differently.
const isStaleChunkError = (error: Error) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(
    error?.message || "",
  );

// The fix for a stale chunk is simply "reload the page" (that pulls the new
// index.html, which points at the chunks that actually exist now), so try
// that once automatically before ever showing an error to the person. Guard
// with sessionStorage so a genuine, repeated failure doesn't reload forever.
const RELOAD_FLAG = "rv_stale_chunk_reload";

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("UI rendering error", error, info);
    if (isStaleChunkError(error)) {
      let alreadyTried = false;
      try {
        alreadyTried = sessionStorage.getItem(RELOAD_FLAG) === "1";
      } catch {
        /* sessionStorage unavailable (private mode, etc.) — fall back to a manual reload */
      }
      if (!alreadyTried) {
        try {
          sessionStorage.setItem(RELOAD_FLAG, "1");
        } catch {
          /* ignore */
        }
        window.location.reload();
      }
    }
  }
  render() {
    if (!this.state.error) return this.props.children;
    const stale = isStaleChunkError(this.state.error);
    return (
      <div className="empty-state error-state" role="alert">
        <div className="error-icon" aria-hidden="true">
          !
        </div>
        <h2>
          {stale
            ? "A new version of the app is ready"
            : "We couldn't display this screen"}
        </h2>
        <p>
          {stale
            ? "This tab was open when the app was updated. Reload to get the latest version."
            : this.state.error.message || "An unexpected error occurred."}
        </p>
        <button
          className="btn-primary"
          type="button"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </div>
    );
  }
}
