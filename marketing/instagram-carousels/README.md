# Orbis · Instagram Carousels

Three carousel designs for the Orbis launch, matching the project's dark / violet / amber visual identity and the "Beyond the CV" voice.

## Format

- **Dimensions:** 1080 × 1350 (Instagram portrait — maximises feed real estate)
- **Source:** SVG (pixel-perfect, resolution-independent). Convert to PNG/JPG before posting.
- **Fonts:** `Inter` + `Menlo` (system fallbacks embedded for off-platform rendering)
- **Palette:** `#7c3aed` violet · `#a78bfa` lilac · `#fbbf24` amber · `#14b8a6` teal · `#f97316` orange · `#000` bg

## Preview

Open `index.html` in a browser to see all three carousels laid out with the Instagram captions.

## Exporting to PNG

From this directory (requires ImageMagick or `rsvg-convert`):

```bash
for f in */slide-*.svg; do
  rsvg-convert -w 1080 -h 1350 "$f" -o "${f%.svg}.png"
done
```

Or with Inkscape:
```bash
inkscape slide-01.svg --export-type=png --export-dpi=144 --export-filename=slide-01.png
```

## The three carousels

### 01 · Beyond the CV (hero pitch, 6 slides)
Emotional / cosmic. Leads with the vision. For a broad audience.

| # | Slide | Headline |
|---|---|---|
| 1 | Hero | Beyond the CV. |
| 2 | Problem | Your CV is a dead file. |
| 3 | Solution | Meet your Orbis. |
| 4 | How | One upload. One graph. Zero templates. |
| 5 | What | Queryable · Shareable · Portable |
| 6 | CTA | Create your Orbis → |

### 02 · AI-native (tech-forward, 6 slides)
Terminal aesthetic. MCP integration front and centre. For the dev / AI-curious audience.

| # | Slide | Headline |
|---|---|---|
| 1 | Hero | AI reads your CV. |
| 2 | MCP | MCP-native. |
| 3 | Flow | From PDF to graph in 60s. |
| 4 | Share | One link. Everywhere. |
| 5 | Privacy | Your rules. Your graph. |
| 6 | CTA | Give your career an API. |

### 03 · 5 reasons (educational, 7 slides)
List format — highest save/share potential. For organic reach.

| # | Slide | Headline |
|---|---|---|
| 1 | Hook | 5 reasons your CV needs an Orbis |
| 2 | #1 | It's queryable by AI |
| 3 | #2 | It updates everywhere |
| 4 | #3 | Connections become visible |
| 5 | #4 | You control who sees what |
| 6 | #5 | You own it forever |
| 7 | CTA | Claim your Orbis → |

Captions live in `index.html` — copy/paste into the Instagram composer.
