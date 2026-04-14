#!/usr/bin/env bash
# Multi-agent UX evaluation runner for OpenOrbis.
#
# Spawns N concurrent Claude Code sessions, each navigating the app
# with a unique synthetic CV and persona.
#
# Prerequisites:
#   - docker compose up -d (Neo4j + Ollama)
#   - Backend running: cd backend && uv run uvicorn app.main:app --reload
#   - Frontend running: cd frontend && npm run dev
#   - Playwright MCP configured in .mcp.json
#   - claude CLI available
#
# Usage:
#   bash tests/agents/run_evaluation.sh            # 3 agents (default)
#   bash tests/agents/run_evaluation.sh -n 5        # 5 agents
#   bash tests/agents/run_evaluation.sh -n 1 -v     # 1 agent, verbose

set -euo pipefail

# ── Defaults ────────────────────────────────────────────────────────────

NUM_AGENTS=3
VERBOSE=false
BACKEND_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PROJECT_ROOT="$(cd "$BACKEND_DIR/.." && pwd)"
REPORTS_DIR="$BACKEND_DIR/tests/agents/reports"
PROMPT_TEMPLATE="$BACKEND_DIR/tests/agents/ux-evaluation-prompt.md"
STAGGER_SECONDS=5

# ── Parse args ──────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
    case "$1" in
        -n|--agents)
            NUM_AGENTS="$2"
            shift 2
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -s|--stagger)
            STAGGER_SECONDS="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [-n NUM_AGENTS] [-s STAGGER_SECONDS] [-v]"
            echo ""
            echo "  -n, --agents    Number of concurrent agents (default: 3)"
            echo "  -s, --stagger   Seconds between agent starts (default: 5)"
            echo "  -v, --verbose   Show agent output in real-time"
            echo "  -h, --help      Show this help"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# ── Pre-flight checks ──────────────────────────────────────────────────

echo "=== OpenOrbis Multi-Agent UX Evaluation ==="
echo "Agents: $NUM_AGENTS"
echo "Stagger: ${STAGGER_SECONDS}s between starts"
echo "Reports: $REPORTS_DIR"
echo ""

# Check claude CLI
if ! command -v claude &>/dev/null; then
    echo "ERROR: 'claude' CLI not found. Install Claude Code first."
    exit 1
fi

# Check backend is running
if ! curl -sf http://localhost:8000/docs &>/dev/null; then
    echo "WARNING: Backend does not appear to be running at localhost:8000"
    echo "  Start it with: cd backend && uv run uvicorn app.main:app --reload"
fi

# Check frontend is running
if ! curl -sf http://localhost:5173 &>/dev/null; then
    echo "WARNING: Frontend does not appear to be running at localhost:5173"
    echo "  Start it with: cd frontend && npm run dev"
fi

# Create reports directory
mkdir -p "$REPORTS_DIR/screenshots"

# ── Generate CVs ────────────────────────────────────────────────────────

echo ""
echo "--- Generating synthetic CVs ---"
for i in $(seq 0 $((NUM_AGENTS - 1))); do
    echo -n "  Agent $i: "
    cd "$BACKEND_DIR"
    uv run python tests/agents/generate_cv.py \
        --seed "$i" \
        --output "/tmp/agent_cv_${i}.pdf" 2>&1 | head -1
done

# ── Build per-agent prompts ─────────────────────────────────────────────

echo ""
echo "--- Preparing agent prompts ---"

# Read persona details from the generator
get_persona_info() {
    local seed=$1
    cd "$BACKEND_DIR"
    uv run python -c "
from tests.agents.generate_cv import generate_persona
p = generate_persona(seed=$seed)
print(f'{p.name}|{p.email}')
"
}

PIDS=()
AGENT_IDS=()

# ── Launch agents ───────────────────────────────────────────────────────

echo ""
echo "--- Launching $NUM_AGENTS agents ---"

for i in $(seq 0 $((NUM_AGENTS - 1))); do
    IFS='|' read -r NAME EMAIL <<< "$(get_persona_info "$i")"
    echo "  Agent $i: $NAME ($EMAIL)"

    # Build the prompt with substituted variables
    AGENT_PROMPT=$(cat "$PROMPT_TEMPLATE")
    AGENT_PROMPT="${AGENT_PROMPT//\{\{SEED\}\}/$i}"
    AGENT_PROMPT="${AGENT_PROMPT//\{\{AGENT_ID\}\}/$i}"
    AGENT_PROMPT="${AGENT_PROMPT//\{\{NAME\}\}/$NAME}"
    AGENT_PROMPT="${AGENT_PROMPT//\{\{EMAIL\}\}/$EMAIL}"

    # Write the instantiated prompt to a temp file
    PROMPT_FILE="/tmp/agent_${i}_prompt.md"
    echo "$AGENT_PROMPT" > "$PROMPT_FILE"

    # Launch Claude Code in non-interactive mode
    LOG_FILE="$REPORTS_DIR/agent_${i}_log.txt"
    MCP_CONFIG="$PROJECT_ROOT/.mcp.json"

    ALLOWED_TOOLS="mcp__playwright__browser_navigate,mcp__playwright__browser_click,mcp__playwright__browser_type,mcp__playwright__browser_screenshot,mcp__playwright__browser_take_screenshot,mcp__playwright__browser_file_upload,mcp__playwright__browser_tab_list,mcp__playwright__browser_tab_new,mcp__playwright__browser_tab_select,mcp__playwright__browser_tab_close,mcp__playwright__browser_close,mcp__playwright__browser_resize,mcp__playwright__browser_handle_dialog,mcp__playwright__browser_console_messages,mcp__playwright__browser_wait,mcp__playwright__browser_select_option,mcp__playwright__browser_hover,mcp__playwright__browser_drag,mcp__playwright__browser_press_key,mcp__playwright__browser_snapshot,mcp__playwright__browser_pdf_save,mcp__playwright__browser_install,mcp__playwright__browser_evaluate,mcp__playwright__browser_network_requests,Bash,Read,Write"

    if [ "$VERBOSE" = true ]; then
        claude --print -p "$(cat "$PROMPT_FILE")" \
            --mcp-config "$MCP_CONFIG" \
            --allowedTools "$ALLOWED_TOOLS" \
            2>&1 | tee "$LOG_FILE" &
    else
        claude --print -p "$(cat "$PROMPT_FILE")" \
            --mcp-config "$MCP_CONFIG" \
            --allowedTools "$ALLOWED_TOOLS" \
            > "$LOG_FILE" 2>&1 &
    fi

    PIDS+=($!)
    AGENT_IDS+=("$i")

    # Stagger agent starts
    if [ "$i" -lt "$((NUM_AGENTS - 1))" ]; then
        echo "  Waiting ${STAGGER_SECONDS}s before next agent..."
        sleep "$STAGGER_SECONDS"
    fi
done

# ── Wait for all agents ────────────────────────────────────────────────

echo ""
echo "--- Waiting for all agents to complete ---"
echo "  (this may take 5-15 minutes depending on CV extraction speed)"

FAILED=0
for idx in "${!PIDS[@]}"; do
    pid=${PIDS[$idx]}
    agent_id=${AGENT_IDS[$idx]}
    if wait "$pid"; then
        echo "  Agent $agent_id: DONE"
    else
        echo "  Agent $agent_id: FAILED (exit code $?)"
        FAILED=$((FAILED + 1))
    fi
done

# ── Extract YAML reports from agent logs ───────────────────────────────
# --print mode doesn't execute Write tools, so the YAML report is embedded
# in the agent's stdout. Extract it and save as a separate file.

echo ""
echo "--- Extracting reports from agent logs ---"
for i in $(seq 0 $((NUM_AGENTS - 1))); do
    LOG_FILE="$REPORTS_DIR/agent_${i}_log.txt"
    REPORT_FILE="$REPORTS_DIR/agent_${i}_report.md"
    if [ -f "$LOG_FILE" ] && [ -s "$LOG_FILE" ]; then
        # Try YAML block first, fall back to full log as the report
        sed -n '/^```yaml$/,/^```$/p' "$LOG_FILE" | sed '1d;$d' > "$REPORT_FILE"
        if [ -s "$REPORT_FILE" ]; then
            echo "  Agent $i: YAML report extracted ($(wc -l < "$REPORT_FILE") lines)"
        else
            # Use the full agent output as the report (it contains the markdown summary)
            cp "$LOG_FILE" "$REPORT_FILE"
            echo "  Agent $i: full log saved as report ($(wc -l < "$REPORT_FILE") lines)"
        fi
    else
        echo "  Agent $i: log empty or missing"
    fi
done

# ── Aggregate report ───────────────────────────────────────────────────

COMPLETED=$((NUM_AGENTS - FAILED))

# Collect all individual reports into one blob for the aggregation prompt
REPORTS_BLOB=""
for f in "$REPORTS_DIR"/agent_*_report.md; do
    [ -f "$f" ] || continue
    REPORTS_BLOB+="--- $(basename "$f") ---"$'\n'
    REPORTS_BLOB+="$(cat "$f")"$'\n\n'
done

if [ -n "$REPORTS_BLOB" ]; then
    echo ""
    echo "--- Generating aggregate report ---"

    AGGREGATE_PROMPT="You are given the individual UX evaluation reports from $COMPLETED agents that navigated the OpenOrbis web app independently, each with their own synthetic CV and persona.

Read all reports below and write a single aggregate Markdown report to stdout. The report should contain:

1. **Overview**: how many agents ran, how many completed, total actions attempted/succeeded/failed
2. **Findings confirmed by multiple agents**: issues found by 2+ agents (strongest signal)
3. **All unique findings**: deduplicated list with severity, grouped by type (broken_flow, confusion, latency, accessibility, etc.)
4. **What worked well**: positive observations that were consistent across agents
5. **Paths coverage matrix**: which paths each agent covered or skipped

Be concise. Use tables where helpful. Do NOT repeat the raw YAML — synthesize it.

Here are the individual reports:

$REPORTS_BLOB"

    claude --print -p "$AGGREGATE_PROMPT" > "$REPORTS_DIR/aggregate_report.md" 2>/dev/null

    if [ -f "$REPORTS_DIR/aggregate_report.md" ] && [ -s "$REPORTS_DIR/aggregate_report.md" ]; then
        echo "  Aggregate report: $REPORTS_DIR/aggregate_report.md"
    else
        echo "  WARNING: Failed to generate aggregate report"
    fi
fi

# ── Summary ─────────────────────────────────────────────────────────────

echo ""
echo "=== Evaluation Complete ==="
echo "  Agents completed: $COMPLETED/$NUM_AGENTS"
echo "  Reports saved to: $REPORTS_DIR/"
echo ""
echo "  Per-agent reports:  $REPORTS_DIR/agent_*_report.md"
echo "  Aggregate report:   $REPORTS_DIR/aggregate_report.md"
echo "  Agent logs:         $REPORTS_DIR/agent_*_log.txt"
echo "  Screenshots:        $REPORTS_DIR/screenshots/"
echo ""

if [ "$FAILED" -gt 0 ]; then
    echo "  WARNING: $FAILED agent(s) failed. Check logs for details."
    exit 1
fi
