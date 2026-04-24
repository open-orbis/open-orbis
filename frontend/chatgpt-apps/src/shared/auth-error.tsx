import { AppShell } from "./layout";

export function NotActivatedState() {
  return (
    <AppShell>
      <div
        style={{
          padding: "16px",
          border: "1px solid var(--orbis-border)",
          borderRadius: "8px",
          background: "var(--orbis-bg-subtle)",
        }}
      >
        <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>
          Orbis non attivo
        </h3>
        <p
          style={{
            margin: "0 0 12px",
            fontSize: "0.875rem",
            color: "var(--orbis-fg-muted)",
          }}
        >
          Completa l'attivazione del tuo Orbis per continuare.
        </p>
        <a
          href="https://open-orbis.com/activate"
          target="_blank"
          rel="noopener"
          style={{
            color: "var(--orbis-accent)",
            fontSize: "0.875rem",
            textDecoration: "none",
          }}
        >
          Attiva su open-orbis.com →
        </a>
      </div>
    </AppShell>
  );
}

export function ToolErrorState({ error }: { error: string }) {
  return (
    <AppShell>
      <div
        style={{
          padding: "16px",
          border: "1px solid var(--orbis-border)",
          borderRadius: "8px",
          color: "var(--orbis-fg-muted)",
          fontSize: "0.875rem",
        }}
      >
        {error}
      </div>
    </AppShell>
  );
}
