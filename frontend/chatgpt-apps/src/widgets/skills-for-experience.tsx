import { createRoot } from "react-dom/client";
import { AppShell, WidgetErrorBoundary } from "../shared/layout";
import { useToolOutput, isNotActivated, isToolError } from "../shared/api";
import { NotActivatedState, ToolErrorState } from "../shared/auth-error";

interface Skill {
  uid: string;
  name: string;
  category?: string;
}
interface Data {
  experience: { uid: string; title: string; start_date?: string };
  skills: Skill[];
}

export function SkillsForExperienceWidget() {
  const output = useToolOutput<unknown>();
  if (output == null)
    return (
      <AppShell>
        <p style={{ color: "var(--orbis-fg-muted)" }}>Nessun dato.</p>
      </AppShell>
    );
  if (isNotActivated(output)) return <NotActivatedState />;
  if (isToolError(output)) return <ToolErrorState error={output.error} />;

  const data = output as Data;
  const grouped = new Map<string, Skill[]>();
  for (const s of data.skills) {
    const cat = s.category ?? "Uncategorized";
    const arr = grouped.get(cat) ?? [];
    arr.push(s);
    grouped.set(cat, arr);
  }

  return (
    <AppShell>
      <div style={{ maxHeight: "320px", overflowY: "auto" }}>
        <h3
          style={{
            margin: "0 0 12px",
            fontSize: "0.95rem",
            fontWeight: 600,
          }}
        >
          Skill per: {data.experience.title}
        </h3>

        {data.skills.length === 0 ? (
          <p style={{ color: "var(--orbis-fg-muted)" }}>Nessuna skill.</p>
        ) : (
          [...grouped.entries()].map(([cat, items]) => (
            <div key={cat} style={{ marginBottom: "12px" }}>
              <h4
                style={{
                  margin: "0 0 6px",
                  fontSize: "0.7rem",
                  textTransform: "uppercase",
                  color: "var(--orbis-fg-muted)",
                  letterSpacing: "0.05em",
                }}
              >
                {cat}
              </h4>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {items.map((s) => (
                  <span
                    key={s.uid}
                    style={{
                      padding: "4px 10px",
                      background: "var(--orbis-bg-subtle)",
                      border: "1px solid var(--orbis-border)",
                      borderRadius: "999px",
                      fontSize: "0.825rem",
                    }}
                  >
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </AppShell>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <WidgetErrorBoundary>
      <SkillsForExperienceWidget />
    </WidgetErrorBoundary>,
  );
}
