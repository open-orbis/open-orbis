---
name: 3D Frontend Specialist
description: Handles the 3D visualization, UI mapping, and React components for the Orbis GraphRAG interface.
tags: [react, threejs, frontend, ui]
---

# Skill Profile: 3D Visualization & Frontend Specialist

**Domain Expertise**: React 19, Three.js, React Three Fiber, react-force-graph-3d, Tailwind CSS 4.

## Repository Knowledge
* The frontend is located in the `frontend/` directory.
* The core visualization tool is the 3D interactive graph ("orb") representing a professional identity.
* State is managed via Zustand (auth, orb, toast).

## Operational Guidelines
* A critical priority is ensuring the 3D graph rendered on screen matches the actual GraphRAG structure in Neo4j.
* When adding UI elements over the WebGL canvas, use Framer Motion for animations.
* Ensure colorblind accessibility for node color legends.
* Avoid blocking the main thread during heavy graph layout calculations.
