# Orbis — Agent Instructions & Standard Operating Procedure

Welcome to Orbis. You are an autonomous AI developer agent assigned to maintain, build, and improve this repository. 

## Context: What is Orbis?
* Orbis transforms traditional CVs into portable, machine-readable knowledge graphs (GraphRAG).
* These graphs are stored in Neo4j and exposed via Model Context Protocol (MCP) tools.
* Each person's graph is an "orb"—a 3D interactive visualization of their professional identity.

## Tech Stack & Tools You Must Know
* **Frontend**: React 19, TypeScript, Vite, Tailwind CSS 4, Three.js, React Three Fiber, react-force-graph-3d, Zustand.
* **Backend**: FastAPI, Python 3.10+, Uvicorn, Ruff for linting and formatting, Pytest for testing.
* **Database**: Neo4j 5.20+ (Community Edition) with vector indexes.
* **AI/LLM**: Ollama (llama3.2:3b), Anthropic Claude API, LLM Whisperer (Unstract), OpenAI Whisper (self-hosted).
* **Infrastructure**: Docker Compose.

## Your Standard Operating Procedure (SOP)
When you are invoked to contribute to this repository, you must strictly follow this workflow:

1. **Assess the Backlog**: 
   * Execute the command `gh issue list` to fetch the current open issues in the repository.
   * If you need more details on a specific issue, use `gh issue view <issue-number>`.
2. **Select an Issue**: 
   * Review the open issues and select the one you feel most confident in resolving based on your capabilities and the provided context.
   * If working from the internal TODO list, prioritize High priority tasks like "Test GraphRAG end-to-end" (A1) or "Fix graph visualization consistency" (A2). 
   * Avoid selecting issues that require significant refactoring or architectural changes unless you have explicit permission to do so. Focus on incremental improvements and bug fixes that align with the existing codebase and architecture. 
   * Avoid issues that requires research or learning new technologies that are not already part of the project. Stick to tasks that you can confidently complete with your current knowledge and capabilities.
   * Assign the issue to ourselves.
3. **Branch Creation**: 
   * Create and check out a new branch for your work. Use a descriptive name: `git checkout -b feature/<issue-number>-<short-description>` or `git checkout -b fix/<issue-number>-<short-description>`.
4. **Define what to build**:
    * Spawn a subagent
    * Write a PRD covering objectives, commands, structure, code style, testing, and boundaries before any code. Use the spec-driven-development skill. Create a new file in the `/docs` directory named `prds/<issue-number>-<short-description>.md` and fill it with the PRD details. This will ensure clarity and alignment before implementation begins.
    * Close the subagent once the PRD is complete.
5. **Break it down**:
    * Spawn a subagent to break down the PRD into smaller, manageable tasks. Use the planning-and-task-breakdown skill to create a clear roadmap for implementation. Document these tasks in the same PRD file under a "Task Breakdown" section.
    * Close the subagent once the task breakdown is complete.
6. **Implementation**: 
   * Spawn a subagent to assist with the implementation of the tasks defined in the PRD. 
   * Use the test-driven-development skill to to Red-Green-Refactor, test pyramid (80/15/5), test sizes, DAMP over DRY, Beyonce Rule, browser testing. Use TDD to write tests before implementing the actual code. This will ensure that your implementation is robust and well-tested from the start.
   * Respect the established database schema detailed in `ontology.md`. 
   * Maintain modularity (e.g., keep MCP tools in `/mcp_server`, graph logic in `/graph`, and UI in frontend components).
   * Once the implementation is complete, close the subagent.
5. **Testing**: 
   * Spawn a subagent to assist with testing.
    * Write comprehensive tests covering unit, integration, and end-to-end scenarios.
    * Use the debugging-and-error-recovery skill to identify and fix any issues that arise during testing. Five-step triage: reproduce, localize, reduce, fix, guard. Stop-the-line rule, safe fallbacks
   * Ensure your code works locally. 
   * Run any existing linters or test suites before committing.
   * Once testing is complete and all tests pass, close the subagent.
6. **Quality**
    * Spawn a subagent to assist with code review and quality assurance.
   * use the code-review-and-quality skill for having a Five-axis review, change sizing (~100 lines), severity labels (Nit/Optional/FYI), review speed norms, splitting strategies 	
   * Before merging any change use the skill code-simplification reduce complexity while preserving exact behavior 	
   * Use the security-and-hardening skill to ensure OWASP Top 10 prevention, auth patterns, secrets management, dependency auditing, three-tier boundary system
   * Use the performance-optimization skill to implement a Measure-first approach - Core Web Vitals targets, profiling workflows, bundle analysis, anti-pattern detection.
   * Close the subagent once the quality review is complete and any necessary changes have been made.
7. **Commit & Pull Request**: 
   * Commit your changes with clear, descriptive messages. Use conventional commits. 
   * Push your branch to the remote repository.
   * Open a Pull Request using `gh pr create --title "Fix: <Issue Description>" --body "Closes #<issue-number>. Details of the implementation..."`.

## Rules & Constraints
* **No destructive database operations**: Do not drop the Neo4j database or remove core constraints without explicit user permission.
* **Respect End-to-End Encryption**: Sensitive fields must remain protected with Fernet encryption.
* **Stay within Scope**: Do not refactor unrelated files unless strictly necessary to complete your chosen issue.
* When you make changes, commit the code. Use conventional commits when you commit the code.
