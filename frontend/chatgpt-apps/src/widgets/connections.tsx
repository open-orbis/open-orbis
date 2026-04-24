import { createRoot } from "react-dom/client";
import { AppShell, WidgetErrorBoundary } from "../shared/layout";
import { useToolOutput, isNotActivated, isToolError } from "../shared/api";
import { NotActivatedState, ToolErrorState } from "../shared/auth-error";

interface ConnectionsData {
  focus: { uid: string; type: string; title?: string; name?: string };
  related: Array<{
    uid: string;
    type: string;
    title?: string;
    name?: string;
    relationship: string;
  }>;
}

export function ConnectionsWidget() {
  const output = useToolOutput<unknown>();
  if (output == null)
    return (
      <AppShell>
        <p style={{ color: "var(--orbis-fg-muted)" }}>Nessun dato.</p>
      </AppShell>
    );
  if (isNotActivated(output)) return <NotActivatedState />;
  if (isToolError(output)) return <ToolErrorState error={output.error} />;

  const data = output as ConnectionsData;
  const focusLabel = data.focus.title ?? data.focus.name ?? data.focus.uid;

  return (
    <AppShell>
      <div style={{ maxHeight: "360px", overflowY: "auto" }}>
        <div
          style={{
            padding: "12px",
            background: "var(--orbis-bg-subtle)",
            border: "1px solid var(--orbis-border)",
            borderRadius: "8px",
            marginBottom: "12px",
          }}
        >
          <div style={{ fontWeight: 600 }}>{focusLabel}</div>
          <div
            style={{ fontSize: "0.75rem", color: "var(--orbis-fg-muted)" }}
          >
            {data.focus.type}
          </div>
        </div>

        {data.related.length === 0 ? (
          <p style={{ color: "var(--orbis-fg-muted)" }}>
            Nessuna connessione.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {data.related.map((n) => (
              <li
                key={n.uid}
                style={{
                  padding: "8px 0",
                  borderBottom: "1px solid var(--orbis-border)",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "8px",
                }}
              >
                <div>
                  <div>{n.title ?? n.name ?? n.uid}</div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--orbis-fg-muted)",
                    }}
                  >
                    {n.type}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: "0.7rem",
                    padding: "2px 8px",
                    background: "var(--orbis-bg-subtle)",
                    borderRadius: "4px",
                    color: "var(--orbis-fg-muted)",
                    alignSelf: "flex-start",
                  }}
                >
                  {n.relationship}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <WidgetErrorBoundary>
      <ConnectionsWidget />
    </WidgetErrorBoundary>,
  );
}
