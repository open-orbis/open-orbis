import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";

import { AppShell, WidgetErrorBoundary } from "../shared/layout";
import { useToolOutput, isNotActivated, isToolError } from "../shared/api";
import { NotActivatedState, ToolErrorState } from "../shared/auth-error";

interface OrbNode {
  uid: string;
  type: string;
  title?: string;
  name?: string;
  degree: number;
}
interface Edge {
  source: string;
  target: string;
}
interface FullOrbData {
  person: { uid: string; name: string; orb_id: string };
  nodes: OrbNode[];
  edges: Edge[];
  total_nodes: number;
}

const MAX_EXP = 10; // top work_experience + project by degree
const MAX_SKILL = 15;

export function selectHeroNodes(data: FullOrbData): FullOrbData {
  const exps = data.nodes
    .filter((n) => n.type === "work_experience" || n.type === "project")
    .slice()
    .sort((a, b) => b.degree - a.degree)
    .slice(0, MAX_EXP);
  const skills = data.nodes
    .filter((n) => n.type === "skill")
    .slice()
    .sort((a, b) => b.degree - a.degree)
    .slice(0, MAX_SKILL);
  const others = data.nodes.filter(
    (n) =>
      n.type !== "work_experience" &&
      n.type !== "project" &&
      n.type !== "skill",
  );

  const heroUids = new Set([
    ...exps.map((n) => n.uid),
    ...skills.map((n) => n.uid),
    ...others.map((n) => n.uid),
  ]);

  return {
    person: data.person,
    nodes: [...exps, ...skills, ...others],
    edges: data.edges.filter(
      (e) =>
        (e.source === data.person.uid || heroUids.has(e.source)) &&
        (e.target === data.person.uid || heroUids.has(e.target)),
    ),
    total_nodes: data.total_nodes,
  };
}

const COLOR_BY_TYPE: Record<string, string> = {
  work_experience: "#4f46e5",
  project: "#059669",
  skill: "#db2777",
  education: "#d97706",
};

type SimNode = SimulationNodeDatum & {
  uid: string;
  label: string;
  color: string;
};
type SimLink = SimulationLinkDatum<SimNode>;

export function FullOrbWidget() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [tick, setTick] = useState(0);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);

  const output = useToolOutput<unknown>();

  useEffect(() => {
    if (!output || typeof output !== "object") return;
    if (isNotActivated(output) || isToolError(output)) return;

    const raw = output as FullOrbData;
    const hero = selectHeroNodes(raw);

    const simNodes: SimNode[] = [
      {
        uid: hero.person.uid,
        label: hero.person.name,
        color: "#111827",
      } as SimNode,
      ...hero.nodes.map<SimNode>((n) => ({
        uid: n.uid,
        label: n.title ?? n.name ?? n.uid,
        color: COLOR_BY_TYPE[n.type] ?? "#6b7280",
      })),
    ];
    const nodeByUid = new Map(simNodes.map((n) => [n.uid, n]));
    const simLinks: SimLink[] = hero.edges
      .filter((e) => nodeByUid.has(e.source) && nodeByUid.has(e.target))
      .map((e) => ({
        source: nodeByUid.get(e.source)!,
        target: nodeByUid.get(e.target)!,
      }));

    nodesRef.current = simNodes;
    linksRef.current = simLinks;

    const WIDTH = 600;
    const HEIGHT = 440;
    const sim = forceSimulation<SimNode>(simNodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks).distance(80).strength(0.4),
      )
      .force("charge", forceManyBody().strength(-160))
      .force("center", forceCenter(WIDTH / 2, HEIGHT / 2))
      .force("collide", forceCollide(28))
      .on("tick", () => setTick((t) => t + 1));

    simRef.current = sim;
    return () => {
      sim.stop();
    };
  }, [output]);

  if (output == null) {
    return (
      <AppShell>
        <p style={{ color: "var(--orbis-fg-muted)" }}>Nessun dato.</p>
      </AppShell>
    );
  }
  if (isNotActivated(output)) return <NotActivatedState />;
  if (isToolError(output)) return <ToolErrorState error={output.error} />;

  const data = output as FullOrbData;
  const hero = selectHeroNodes(data);
  const hiddenCount = Math.max(0, data.total_nodes - hero.nodes.length);

  // Touch `tick` so React re-renders on simulation updates:
  void tick;

  return (
    <AppShell>
      <div>
        <h2 style={{ margin: "0 0 4px", fontSize: "1rem", fontWeight: 600 }}>
          {data.person.name}
        </h2>
        <svg
          ref={svgRef}
          viewBox="0 0 600 440"
          style={{
            width: "100%",
            height: "440px",
            background: "var(--orbis-bg-subtle)",
            borderRadius: "8px",
          }}
        >
          {linksRef.current.map((l, i) => {
            const s = l.source as SimNode;
            const t = l.target as SimNode;
            return (
              <line
                key={i}
                x1={s.x ?? 0}
                y1={s.y ?? 0}
                x2={t.x ?? 0}
                y2={t.y ?? 0}
                stroke="var(--orbis-border)"
                strokeWidth={1}
              />
            );
          })}
          {nodesRef.current.map((n) => (
            <g key={n.uid} transform={`translate(${n.x ?? 0},${n.y ?? 0})`}>
              <circle r={14} fill={n.color} opacity={0.85} />
              <text
                y={28}
                textAnchor="middle"
                fontSize={10}
                fill="var(--orbis-fg)"
              >
                {n.label.length > 16 ? n.label.slice(0, 16) + "…" : n.label}
              </text>
            </g>
          ))}
        </svg>

        {hiddenCount > 0 && (
          <p
            style={{
              margin: "8px 0 0",
              fontSize: "0.75rem",
              color: "var(--orbis-fg-muted)",
            }}
          >
            +{hiddenCount} nodi non mostrati
          </p>
        )}
        <a
          href={`https://open-orbis.com/orb/${data.person.orb_id}`}
          target="_blank"
          rel="noopener"
          style={{
            display: "inline-block",
            marginTop: "8px",
            fontSize: "0.825rem",
            color: "var(--orbis-accent)",
            textDecoration: "none",
          }}
        >
          Esplora l'Orb completo su open-orbis.com →
        </a>
      </div>
    </AppShell>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <WidgetErrorBoundary>
      <FullOrbWidget />
    </WidgetErrorBoundary>,
  );
}
