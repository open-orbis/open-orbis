# LaTeX Template-Based CV Export — Design Spec

> Issue #346 — Replace fpdf2/window.print() CV export with LaTeX template system.

## Overview

Replace the current fixed-layout CV export (fpdf2 backend + `window.print()` frontend) with a LaTeX template system. Orb data is injected into `.tex` templates via Jinja2, compiled server-side by Tectonic, and returned as PDF.

```
Orb data (unchanged) → Jinja2 render into .tex → Tectonic → PDF
```

## Architecture

```
┌─────────────┐     GET /templates      ┌──────────────────┐
│  Frontend    │◄──────────────────────►│  FastAPI Backend  │
│             │     POST /templates/     │                  │
│  Template   │      upload             │  cv/templates/    │
│  Picker     │                         │    router.py      │
│  + Editor   │     POST /cv/compile    │    service.py     │
│  + Preview  │────────────────────────►│    models.py      │
└─────────────┘     (tex + template_id) │    security.py    │
                         │              └────────┬─────────┘
                         │                       │
                    ┌────▼────┐          ┌───────▼────────┐
                    │ react-  │          │   Compilation  │
                    │ pdf     │          │   Pipeline     │
                    │ viewer  │          │                │
                    └─────────┘          │ 1. Fetch bundle│
                                         │    from GCS    │
                                         │ 2. Jinja2      │
                                         │    render .tex │
                                         │ 3. Tectonic    │
                                         │    compile     │
                                         │ 4. Return PDF  │
                                         └───────┬────────┘
                                                 │
                                    ┌────────────┼────────────┐
                                    │            │            │
                               ┌────▼───┐  ┌────▼───┐  ┌────▼────┐
                               │  GCS   │  │ Postgres│  │ Tectonic│
                               │ Bundles│  │ Meta +  │  │ Binary  │
                               │(.cls,  │  │ .tex    │  │         │
                               │ fonts) │  │ Jinja2  │  │         │
                               └────────┘  └────────┘  └─────────┘
```

## Templates

Four pre-loaded templates, sourced from open-source projects:

| Template | Engine | Custom Class | Bundled Fonts | Source |
|----------|--------|-------------|---------------|--------|
| **Awesome CV** | XeLaTeX | `awesome-cv.cls` | Source Sans 3 + Roboto (must be bundled, not in original repo) | [posquit0/Awesome-CV](https://github.com/posquit0/Awesome-CV) |
| **SWE Resume** | pdfLaTeX | None (`article` + `custom-commands.tex`) | None (lato via CTAN) | [Overleaf](https://www.overleaf.com/latex/templates/swe-resume-template/bznbzdprjfyy) |
| **techResume** | pdfLaTeX | `cv.cls` (freycv) | None (lato via CTAN) | [alexcalabrese/techResume](https://github.com/alexcalabrese/techResume) |
| **YAAC** | LuaLaTeX | `yaac-another-awesome-cv.cls` | 12 OTF Source Sans Pro (bundled in original repo) | [darwiin/yaac-another-awesome-cv](https://github.com/darwiin/yaac-another-awesome-cv) |

Each template's `.tex` Jinja2 file is a single file that maps Orb data to the template's custom commands (e.g., `\cventry`, `\cvsection`). The original section files (`resume/*.tex`, `src/*.tex`) are not used — all content is generated from Orb data.

### Template Variables (Jinja2)

Available in all templates, derived from existing Orb data:

- `person` — `name`, `headline`, `email`, `phone`, `location`, `summary`
- `nodes` — list of all nodes, each with `_type` and type-specific fields:
  - `WorkExperience`: `title`, `company`, `start_date`, `end_date`, `location`, `description`
  - `Education`: `degree`, `institution`, `start_date`, `end_date`, `location`, `description`
  - `Skill`: `name`, `proficiency`, `category`
  - `Language`: `name`, `proficiency`
  - `Project`: `name`, `role`, `description`
  - `Publication`: `title`, `abstract`, `date`, `venue`
  - `Certification`: `name`, `issuing_organization`, `date`
  - `Award`, `Patent`, `Outreach`, `Training`: respective fields

### Jinja2 Delimiters

Custom delimiters to avoid conflicts with LaTeX braces:

- Variable: `<< variable >>`
- Block: `<% statement %>`
- Comment: `<# comment #>`

## Data Model

### PostgreSQL — `cv_templates` table

```sql
CREATE TABLE cv_templates (
    id            TEXT PRIMARY KEY,
    user_id       TEXT,
    name          TEXT NOT NULL,
    description   TEXT,
    engine        TEXT NOT NULL,
    license       TEXT,
    is_preloaded  BOOLEAN NOT NULL DEFAULT FALSE,
    gcs_bundle_path TEXT NOT NULL,
    thumbnail_path  TEXT,
    tex_content   TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- Pre-loaded templates: `user_id = NULL`, `is_preloaded = TRUE`
- User edits a pre-loaded template: creates a copy with their `user_id`, `is_preloaded = FALSE`, same `gcs_bundle_path`
- User uploads custom template: new GCS bundle at `templates/user/{user_id}/{template_id}/`, new DB row

### GCS — Bundle Structure

```
orbis-cv-files/
  templates/
    awesome-cv/
      awesome-cv.cls
      fonts/
        SourceSans3-*.otf
        Roboto-*.ttf
      thumbnail.png
    swe-resume/
      custom-commands.tex
      thumbnail.png
    tech-resume/
      cv.cls
      thumbnail.png
    yaac/
      yaac-another-awesome-cv.cls
      fonts/
        SourceSansPro-*.otf   (12 files)
      thumbnail.png
    user/{user_id}/{template_id}/
      ...
```

## Backend API

### New module: `backend/app/cv/templates/`

Files:
- `router.py` — endpoint definitions
- `service.py` — compilation pipeline, GCS interaction, Jinja2 rendering
- `models.py` — Pydantic models for request/response
- `security.py` — template validation (block dangerous LaTeX commands)
- `db.py` — PostgreSQL CRUD for `cv_templates`

### Endpoints

#### `GET /api/cv/templates`

List available templates (pre-loaded + user's custom). Requires auth.

Response:
```json
[
  {
    "id": "awesome-cv",
    "name": "Awesome CV",
    "description": "Colorful sections, accent colors, XeLaTeX",
    "engine": "xelatex",
    "thumbnail_url": "https://storage.googleapis.com/...",
    "is_preloaded": true
  }
]
```

#### `GET /api/cv/templates/{template_id}`

Template detail including `tex_content` (for the editor).

Response:
```json
{
  "id": "awesome-cv",
  "name": "Awesome CV",
  "description": "...",
  "engine": "xelatex",
  "license": "LPPL-1.3c",
  "thumbnail_url": "...",
  "is_preloaded": true,
  "tex_content": "\\documentclass{awesome-cv}\n..."
}
```

#### `POST /api/cv/templates/upload`

Upload custom template. Multipart form: `.tex` file, optional `.cls`, optional font files.

Creates GCS bundle + DB row. Validates `.tex` via `security.py` before storing.

Response: the created template object.

#### `POST /api/cv/compile`

Compile template with Orb data, return PDF.

Request:
```json
{
  "template_id": "awesome-cv",
  "tex_content": "...optional edited .tex..."
}
```

If `tex_content` is provided, uses it (user edited in the editor). Otherwise uses `tex_content` from DB.

Response: `application/pdf` streaming response.

**Rate limit: 5/min** (CPU-intensive).

### Compilation Pipeline (`service.py`)

1. Fetch Orb data (same `GET_FULL_ORB_PUBLIC` query + decrypt as `export/router.py`)
2. Jinja2 render: `tex_content` + Orb data → final `.tex` (custom delimiters)
3. Download template bundle from GCS → temp directory
4. Write rendered `.tex` into temp directory
5. `subprocess.run(["tectonic", tex_file], cwd=tempdir, timeout=30)`
6. Read PDF output, return as streaming response
7. Cleanup temp directory

### Security (`security.py`)

Validation applied to all `.tex` content (uploaded and edited):

**Blocked patterns** (regex):
- `\write18` / `\immediate\write`
- `\openin` / `\openout`
- `\input{/...}` (absolute paths)
- `\catcode`

Tectonic has no shell-escape by default, providing an additional safety layer.

Compilation runs with:
- 30-second timeout
- Isolated temp directory
- Tectonic needs network access on first compilation to download CTAN packages (cached after that). In Docker, warm the cache during image build.

## Frontend

### Replaces `CvExportPage.tsx`

The current HTML contentEditable + `window.print()` flow is completely replaced.

URL remains `/cv-export`.

### New Dependencies

- `@codemirror/lang-latex` — LaTeX syntax highlighting for CodeMirror 6
- `codemirror` + core extensions — editor framework
- `react-pdf` — PDF rendering via pdf.js
- `pdfjs-dist` — pdf.js worker (peer dep of react-pdf)

### Components

#### Template Picker (`components/cv/TemplatePicker.tsx`)

- Grid layout (4 columns) showing template cards
- Each card: thumbnail image (from GCS signed URL) + name + description
- "Upload Custom Template" button (top right)
- Click → navigates to editor with selected template

#### Editor Split-Pane (`components/cv/TemplateEditor.tsx`)

- **Toolbar**: Back to Templates, template name, Refresh Preview, Export PDF
- **Left panel**: CodeMirror 6 with LaTeX syntax highlighting, shows the `.tex` Jinja2 source
- **Right panel**: react-pdf viewer with zoom (+/-) and page navigation controls
- **Resize handle**: draggable divider between panels
- **Refresh Preview**: sends edited `.tex` to `POST /cv/compile`, updates PDF preview
- **Export PDF**: downloads the compiled PDF

#### Upload Dialog (`components/cv/TemplateUploadDialog.tsx`)

- Modal dialog
- File inputs: `.tex` (required), `.cls` (optional), font files (optional)
- Name + description fields
- Engine selector (xelatex / pdflatex / lualatex)
- Validates and uploads via `POST /api/cv/templates/upload`

### Data Flow

1. Page loads → `GET /api/cv/templates` → show picker
2. User clicks template → `GET /api/cv/templates/{id}` → load `tex_content` into editor
3. User clicks "Refresh Preview" → `POST /api/cv/compile` with current editor content → render PDF in react-pdf
4. User clicks "Export PDF" → `POST /api/cv/compile` → download blob as file

### State Management

Minimal local state (no Zustand store needed):
- `selectedTemplate`: current template object
- `texContent`: editor content (string)
- `pdfBlob`: last compiled PDF blob
- `isCompiling`: loading state
- `zoom` / `currentPage`: PDF viewer state

## Deployment Considerations

- **Tectonic binary**: install in Docker image (`cargo install tectonic` or download pre-built binary). Adds ~30MB to image.
- **GCS bundles**: uploaded once via script, not part of the container image.
- **Cloud Run memory**: compilation may need 512Mi-1Gi depending on template complexity. Current limit is already 1Gi.
- **Tectonic CTAN cache**: first compilation downloads packages. Consider warming the cache in Docker build or using a persistent volume. Alternatively, accept cold-start latency on first compile.

## What This Does NOT Change

- Orb data model (Neo4j graph, node types, relationships)
- CV upload/import flow (`/cv/upload`, `/cv/import`)
- Other export formats (JSON, JSON-LD still available via `/export/{orb_id}`)
- Backend export module (`export/router.py`) — kept as-is for JSON/JSON-LD, PDF generation there can be deprecated later
