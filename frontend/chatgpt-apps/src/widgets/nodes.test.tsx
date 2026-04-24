import { render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { NodesWidget } from "./nodes";
import workExp from "../__fixtures__/nodes-work-experience.json";
import skills from "../__fixtures__/nodes-skills.json";
import education from "../__fixtures__/nodes-education.json";

describe("NodesWidget", () => {
  beforeEach(() => {
    (window as unknown as { openai?: unknown }).openai = undefined;
  });

  it("renders work_experience as timeline", () => {
    window.openai = { toolOutput: workExp };
    render(<NodesWidget />);
    expect(screen.getByText("Senior Engineer")).toBeInTheDocument();
    expect(screen.getByText("Engineer")).toBeInTheDocument();
    // Timeline marker: orderly dates visible
    expect(screen.getByText(/2022/)).toBeInTheDocument();
  });

  it("renders skills grouped by category", () => {
    window.openai = { toolOutput: skills };
    render(<NodesWidget />);
    expect(screen.getByText("Backend")).toBeInTheDocument();
    expect(screen.getByText("Frontend")).toBeInTheDocument();
    expect(screen.getByText("Uncategorized")).toBeInTheDocument();
    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(screen.getByText("Figma")).toBeInTheDocument();
  });

  it("renders education as list", () => {
    window.openai = { toolOutput: education };
    render(<NodesWidget />);
    expect(screen.getByText("MSc CS")).toBeInTheDocument();
    expect(screen.getByText(/Politecnico Milano/)).toBeInTheDocument();
  });

  it("empty nodes list shows empty state", () => {
    window.openai = { toolOutput: { node_type: "skill", nodes: [] } };
    render(<NodesWidget />);
    expect(screen.getByText(/nessun nodo/i)).toBeInTheDocument();
  });
});
