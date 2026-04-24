import { createRoot } from "react-dom/client";
import { AppShell, WidgetErrorBoundary } from "../shared/layout";
import {
  useToolOutput,
  isNotActivated,
  isToolError,
} from "../shared/api";
import { NotActivatedState, ToolErrorState } from "../shared/auth-error";

interface SummaryData {
  name: string;
  headline: string;
  location: string;
  orb_id: string;
  open_to_work: boolean;
  node_counts: Record<string, number>;
  total_nodes: number;
}

export function SummaryWidget() {
  const output = useToolOutput<unknown>();

  if (output == null) {
    return (
      <AppShell>
        <p style={{ color: "var(--orbis-fg-muted)" }}>Nessun dato.</p>
      </AppShell>
    );
  }
  if (isNotActivated(output)) return <NotActivatedState />;
  if (isToolError(output)) return <ToolErrorState error={output.error} />;

  const data = output as SummaryData;
  return (
    <AppShell>
      <div>
        <h2
          style={{
            margin: "0 0 4px",
            fontSize: "1.25rem",
            fontWeight: 600,
          }}
        >
          {data.name}
        </h2>
        <p
          style={{
            margin: "0 0 4px",
            fontSize: "0.95rem",
            color: "var(--orbis-fg-muted)",
          }}
        >
          {data.headline}
        </p>
        <p
          style={{
            margin: "0 0 12px",
            fontSize: "0.825rem",
            color: "var(--orbis-fg-muted)",
          }}
        >
          {data.location}
          {data.open_to_work && " · Open to work"}
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
            gap: "8px",
          }}
        >
          {Object.entries(data.node_counts).map(([type, count]) => (
            <div
              key={type}
              style={{
                padding: "8px",
                border: "1px solid var(--orbis-border)",
                borderRadius: "6px",
                fontSize: "0.825rem",
              }}
            >
              <div style={{ color: "var(--orbis-fg-muted)" }}>{type}</div>
              <div style={{ fontWeight: 600, fontSize: "1rem" }}>{count}</div>
            </div>
          ))}
        </div>

        <p
          style={{
            marginTop: "12px",
            fontSize: "0.75rem",
            color: "var(--orbis-fg-muted)",
          }}
        >
          {data.total_nodes} nodi totali
        </p>
      </div>
    </AppShell>
  );
}

// Entry point — mount on #root when loaded in iframe.
const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <WidgetErrorBoundary>
      <SummaryWidget />
    </WidgetErrorBoundary>,
  );
}
