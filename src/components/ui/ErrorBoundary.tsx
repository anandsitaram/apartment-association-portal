import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("UI rendering error", error, info);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty-state error-state" role="alert">
        <div className="error-icon" aria-hidden="true">
          !
        </div>
        <h2>We couldn't display this screen</h2>
        <p>{this.state.error.message || "An unexpected error occurred."}</p>
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
