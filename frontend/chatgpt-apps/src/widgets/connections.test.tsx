import { render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { ConnectionsWidget } from "./connections";
import fixture from "../__fixtures__/connections.json";

describe("ConnectionsWidget", () => {
  beforeEach(() => {
    (window as unknown as { openai?: unknown }).openai = undefined;
  });

  it("renders focus node and related list", () => {
    window.openai = { toolOutput: fixture };
    render(<ConnectionsWidget />);
    expect(screen.getByText("Senior Eng at Acme")).toBeInTheDocument();
    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(screen.getByText("PostgreSQL")).toBeInTheDocument();
    expect(screen.getByText("Orbis launch")).toBeInTheDocument();
  });

  it("shows relationship labels", () => {
    window.openai = { toolOutput: fixture };
    render(<ConnectionsWidget />);
    expect(screen.getAllByText(/USED_SKILL/).length).toBe(2);
    expect(screen.getByText(/WORKED_ON/)).toBeInTheDocument();
  });

  it("empty related shows empty-state", () => {
    window.openai = {
      toolOutput: { focus: fixture.focus, related: [] },
    };
    render(<ConnectionsWidget />);
    expect(screen.getByText(/nessuna connessione/i)).toBeInTheDocument();
  });
});
