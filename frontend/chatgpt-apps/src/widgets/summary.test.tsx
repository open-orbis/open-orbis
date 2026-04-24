import { render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { SummaryWidget } from "./summary";
import fixture from "../__fixtures__/summary.json";

describe("SummaryWidget", () => {
  beforeEach(() => {
    (window as unknown as { openai?: unknown }).openai = undefined;
  });

  it("renders name and headline from toolOutput", () => {
    window.openai = { toolOutput: fixture };
    render(<SummaryWidget />);
    expect(screen.getByText("Alice Rossi")).toBeInTheDocument();
    expect(screen.getByText("Senior Software Engineer")).toBeInTheDocument();
    expect(screen.getByText(/Milano/)).toBeInTheDocument();
  });

  it("renders node counts", () => {
    window.openai = { toolOutput: fixture };
    render(<SummaryWidget />);
    expect(screen.getByText(/36/)).toBeInTheDocument();  // total
    expect(screen.getByText(/work_experience/i)).toBeInTheDocument();
  });

  it("shows not-activated state when tool returns state:not_activated", () => {
    window.openai = { toolOutput: { state: "not_activated" } };
    render(<SummaryWidget />);
    expect(screen.getByText(/attivazione/i)).toBeInTheDocument();
  });

  it("shows tool-error state on error envelope", () => {
    window.openai = { toolOutput: { error: "Orb non accessibile" } };
    render(<SummaryWidget />);
    expect(screen.getByText(/Orb non accessibile/)).toBeInTheDocument();
  });

  it("renders empty-state when toolOutput is null", () => {
    render(<SummaryWidget />);
    expect(screen.getByText(/nessun dato/i)).toBeInTheDocument();
  });
});
