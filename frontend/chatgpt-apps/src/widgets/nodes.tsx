import { createRoot } from "react-dom/client";
import { AppShell, WidgetErrorBoundary } from "../shared/layout";
import { useToolOutput, isNotActivated, isToolError } from "../shared/api";
import { NotActivatedState, ToolErrorState } from "../shared/auth-error";

interface NodesOutput {
  node_type: string;
  nodes: Record<string, unknown>[];
}

const TIMELINE_TYPES = new Set(["work_experience", "project"]);
const LIST_TYPES = new Set([
  "education",
  "certification",
  "language",
  "publication",
  "patent",
  "award",
  "outreach",
  "training",
]);

function Timeline({ nodes }: { nodes: Record<string, unknown>[] }) {
  const sorted = [...nodes].sort((a, b) => {
    const aStart = String((a as { start_date?: string }).start_date ?? "");
    const bStart = String((b as { start_date?: string }).start_date ?? "");
    return bStart.localeCompare(aStart);
  });
  return (
    <ol
      style={{
        listStyle: "none",
        padding: 0,
        margin: 0,
        borderLeft: "2px solid var(--orbis-border)",
      }}
    >
      {sorted.map((n, i) => {
        const o = n as Record<string, string | null>;
        return (
          <li
            key={String(n.uid ?? i)}
            style={{ padding: "8px 0 8px 12px", marginLeft: "8px" }}
          >
            <div style={{ fontWeight: 600 }}>
              {o.title ?? o.name ?? "Untitled"}
            </div>
            <div style={{ fontSize: "0.825rem", color: "var(--orbis-fg-muted)" }}>
              {o.company ?? o.organization ?? ""}
              {o.start_date && ` · ${o.start_date}`}
              {o.end_date ? ` – ${o.end_date}` : o.start_date ? " – present" : ""}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function SkillGrid({ nodes }: { nodes: Record<string, unknown>[] }) {
  const grouped = new Map<string, Record<string, unknown>[]>();
  for (const n of nodes) {
    const cat = String((n as { category?: string }).category ?? "Uncategorized");
    const arr = grouped.get(cat) ?? [];
    arr.push(n);
    grouped.set(cat, arr);
  }
  return (
    <div>
      {[...grouped.entries()].map(([cat, items]) => (
        <div key={cat} style={{ marginBottom: "12px" }}>
          <h4
            style={{
              margin: "0 0 6px",
              fontSize: "0.75rem",
              textTransform: "uppercase",
              color: "var(--orbis-fg-muted)",
              letterSpacing: "0.05em",
            }}
          >
            {cat}
          </h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {items.map((n, i) => (
              <span
                key={String(n.uid ?? i)}
                style={{
                  padding: "4px 10px",
                  background: "var(--orbis-bg-subtle)",
                  border: "1px solid var(--orbis-border)",
                  borderRadius: "999px",
                  fontSize: "0.825rem",
                }}
              >
                {String((n as { name?: string }).name ?? "?")}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function GenericList({ nodes }: { nodes: Record<string, unknown>[] }) {
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {nodes.map((n, i) => {
        const o = n as Record<string, string | null>;
        return (
          <li
            key={String(n.uid ?? i)}
            style={{
              padding: "8px 0",
              borderBottom: "1px solid var(--orbis-border)",
            }}
          >
            <div style={{ fontWeight: 500 }}>
              {o.title ?? o.name ?? "Untitled"}
            </div>
            <div style={{ fontSize: "0.825rem", color: "var(--orbis-fg-muted)" }}>
              {o.institution ?? o.issuer ?? o.publisher ?? ""}
              {o.start_date && ` · ${o.start_date}`}
              {o.end_date && ` – ${o.end_date}`}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function NodesWidget() {
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

  const data = output as NodesOutput;
  if (!data.nodes || data.nodes.length === 0) {
    return (
      <AppShell>
        <p style={{ color: "var(--orbis-fg-muted)" }}>Nessun nodo.</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div style={{ maxHeight: "500px", overflowY: "auto" }}>
        {TIMELINE_TYPES.has(data.node_type) && <Timeline nodes={data.nodes} />}
        {data.node_type === "skill" && <SkillGrid nodes={data.nodes} />}
        {LIST_TYPES.has(data.node_type) && <GenericList nodes={data.nodes} />}
        {!TIMELINE_TYPES.has(data.node_type) &&
          data.node_type !== "skill" &&
          !LIST_TYPES.has(data.node_type) && <GenericList nodes={data.nodes} />}
      </div>
    </AppShell>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <WidgetErrorBoundary>
      <NodesWidget />
    </WidgetErrorBoundary>,
  );
}
