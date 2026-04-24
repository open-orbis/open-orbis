import { render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { SkillsForExperienceWidget } from "./skills-for-experience";
import fixture from "../__fixtures__/skills-for-experience.json";

describe("SkillsForExperienceWidget", () => {
  beforeEach(() => {
    (window as unknown as { openai?: unknown }).openai = undefined;
  });

  it("renders experience title and skills grouped by category", () => {
    window.openai = { toolOutput: fixture };
    render(<SkillsForExperienceWidget />);
    expect(screen.getByText(/Senior Eng at Acme/)).toBeInTheDocument();
    expect(screen.getByText("Backend")).toBeInTheDocument();
    expect(screen.getByText("Frontend")).toBeInTheDocument();
    expect(screen.getByText("Uncategorized")).toBeInTheDocument();
    expect(screen.getByText("Python")).toBeInTheDocument();
  });

  it("empty skills shows empty state", () => {
    window.openai = {
      toolOutput: { experience: fixture.experience, skills: [] },
    };
    render(<SkillsForExperienceWidget />);
    expect(screen.getByText(/nessuna skill/i)).toBeInTheDocument();
  });
});
