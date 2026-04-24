import type { ReactNode } from "react";
import { Component, type ErrorInfo } from "react";
import "./theme.css";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        maxWidth: "640px",
        padding: "16px",
        boxSizing: "border-box",
      }}
    >
      {children}
    </div>
  );
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class WidgetErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Client-side only log. No network: preserves privacy + simplicity.
    console.error("[orbis-widget] render crash", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <AppShell>
          <p style={{ color: "var(--orbis-fg-muted)" }}>
            Widget non disponibile. I dati restano visibili nella risposta
            in chat.
          </p>
        </AppShell>
      );
    }
    return this.props.children;
  }
}
