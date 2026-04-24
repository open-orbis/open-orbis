import { test, expect } from "@playwright/test";

// Visual regression baseline for each widget bundle in both colour schemes.
// The harness HTML pages in e2e/fixtures/ inject a known window.openai.toolOutput
// then load the compiled widget JS from the sibling static server.
const widgets = [
  "summary",
  "nodes",
  "full-orb",
  "connections",
  "skills-for-experience",
];

for (const w of widgets) {
  test(`${w} widget renders`, async ({ page }) => {
    await page.goto(`/${w}.html`);
    // Wait for the widget to mount something inside #root.
    await page.waitForSelector("#root *", {
      state: "attached",
      timeout: 10_000,
    });
    // The d3-force simulation in full-orb needs a moment to settle before the
    // SVG is screenshot-stable. Other widgets have no animation.
    if (w === "full-orb") {
      await page.waitForTimeout(1500);
    }
    await expect(page).toHaveScreenshot(`${w}.png`, {
      maxDiffPixelRatio: 0.02,
    });
  });
}
