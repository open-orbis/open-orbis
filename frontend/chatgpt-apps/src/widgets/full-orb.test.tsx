import { render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { FullOrbWidget, selectHeroNodes } from "./full-orb";
import fixture from "../__fixtures__/full-orb.json";

describe("selectHeroNodes", () => {
  it("keeps person + top-10 experiences/projects + top-15 skills by degree", () => {
    const many = {
      person: { uid: "p1", name: "A", orb_id: "o" },
      nodes: [
        ...Array.from({ length: 20 }, (_, i) => ({
          uid: `w${i}`,
          type: "work_experience",
          title: `W${i}`,
          degree: 20 - i,
        })),
        ...Array.from({ length: 30 }, (_, i) => ({
          uid: `s${i}`,
          type: "skill",
          name: `S${i}`,
          degree: 30 - i,
        })),
      ],
      edges: [],
      total_nodes: 50,
    };
    const heroes = selectHeroNodes(many);
    const wExp = heroes.nodes.filter((n) => n.type === "work_experience");
    const skills = heroes.nodes.filter((n) => n.type === "skill");
    expect(wExp.length).toBe(10);
    expect(skills.length).toBe(15);
    // Highest degree preserved:
    expect(wExp[0].degree).toBe(20);
    expect(skills[0].degree).toBe(30);
  });
});

describe("FullOrbWidget", () => {
  beforeEach(() => {
    (window as unknown as { openai?: unknown }).openai = undefined;
  });

  it("renders person name and SVG element", () => {
    window.openai = { toolOutput: fixture };
    const { container } = render(<FullOrbWidget />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("shows 'N nodi non mostrati' badge when total_nodes > hero count", () => {
    window.openai = { toolOutput: fixture };
    render(<FullOrbWidget />);
    // fixture has 6 nodes, all will be shown (< 30 cap); total_nodes=42 > 6
    expect(screen.getByText(/36 nodi non mostrati/i)).toBeInTheDocument();
  });

  it("shows explore CTA", () => {
    window.openai = { toolOutput: fixture };
    render(<FullOrbWidget />);
    expect(screen.getByText(/esplora.*open-orbis/i)).toBeInTheDocument();
  });
});
