import { useCallback, useRef, useState, useMemo, useEffect } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import type { OrbData } from '../../api/orbs';
import { getNodeColor } from './NodeColors';
import NodeTooltip from './NodeTooltip';
import { buildAdjacencyMap } from './adjacency';

interface OrbGraph3DProps {
  data: OrbData;
  onNodeClick?: (node: Record<string, unknown>) => void;
  onBackgroundClick?: () => void;
  highlightedNodeIds?: Set<string>;
  /** Node IDs that match the active visibility filter — rendered as transparent */
  filteredNodeIds?: Set<string>;
  /** PascalCase node types to hide completely (e.g., "Skill", "Education") */
  hiddenNodeTypes?: Set<string>;
  width?: number;
  height?: number;
  enableZoom?: boolean;
  enablePan?: boolean;
  cameraDistance?: number;
  focusNodeId?: string | null;
  focusNodeToken?: number;
  onCameraDistanceChange?: (distance: number) => void;
  /** When false, node hover tooltips are suppressed (e.g. when a menu/modal is open) */
  tooltipEnabled?: boolean;
}


// Hover one-hop highlight (issue #414) — see design doc.
const HOVER_LEAVE_DEBOUNCE_MS = 80;
const HOVER_FADE_MS = 200;
const HOVER_DIM_OPACITY = 0.2;
const HOVER_DIM_LINK_ALPHA = 0.05;

// ── Shared geometry pool (created once, reused for all nodes) ──
const SHARED_GEO = {
  personCore: new THREE.SphereGeometry(6, 24, 24),
  personInnerGlow: new THREE.SphereGeometry(2.4, 12, 12),
  personInnerDot: new THREE.SphereGeometry(1.1, 12, 12),
  personMidGlow: new THREE.SphereGeometry(8.4, 12, 12),
  personRing1: new THREE.TorusGeometry(9.6, 0.15, 8, 48),
  personRing2: new THREE.TorusGeometry(11.4, 0.1, 8, 48),
  nodeCore: new THREE.SphereGeometry(1.05, 12, 12),
  nodeMain: new THREE.SphereGeometry(3, 16, 16),
  nodeGlow: new THREE.SphereGeometry(4.5, 10, 10),
  highlightRing: new THREE.RingGeometry(5.1, 6.0, 24),
};

export default function OrbGraph3D({
  data,
  onNodeClick,
  onBackgroundClick,
  highlightedNodeIds,
  filteredNodeIds,
  hiddenNodeTypes,
  width,
  height,
  enableZoom = true,
  enablePan = true,
  cameraDistance = 400,
  focusNodeId = null,
  focusNodeToken = 0,
  onCameraDistanceChange,
  tooltipEnabled = true,
}: OrbGraph3DProps) {
  const fgRef = useRef<any>(undefined);
  const [hoveredNode, setHoveredNode] = useState<Record<string, unknown> | null>(null);
  const hoveredNodeRef = useRef<Record<string, unknown> | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const highlightRingsRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const nodeObjectCacheRef = useRef<Map<string, THREE.Group>>(new Map());
  const materialHandlesRef = useRef<Map<string, THREE.Material[]>>(new Map());
  const hoverEmphasizedUidsRef = useRef<Set<string>>(new Set());
  const [hoverTick, setHoverTick] = useState(0);
  const hoverLeaveTimerRef = useRef<number | null>(null);
  const fadeAnimationRef = useRef<number | null>(null);
  const prevHighlightKeyRef = useRef<string>('');
  const isHoveringRef = useRef(false);
  // Direct refs to orbital rings — avoids scene.traverse() every frame
  const orbitRing1Ref = useRef<THREE.Mesh | null>(null);
  const orbitRing2Ref = useRef<THREE.Mesh | null>(null);

  const highlightRef = useRef<Set<string>>(new Set());
  highlightRef.current = highlightedNodeIds ?? new Set();
  const hasHighlightsRef = useRef(false);
  hasHighlightsRef.current = (highlightedNodeIds?.size ?? 0) > 0;

  // Use ref for filtered nodes (visibility filter)
  const filteredRef = useRef<Set<string>>(new Set());
  filteredRef.current = filteredNodeIds ?? new Set();

  // Use ref for hidden node types
  const hiddenTypesRef = useRef<Set<string>>(new Set());
  hiddenTypesRef.current = hiddenNodeTypes ?? new Set();

  // Clear cache when data changes & zoom to fit
  useEffect(() => {
    nodeObjectCacheRef.current.clear();
    materialHandlesRef.current.clear();
    orbitRing1Ref.current = null;
    orbitRing2Ref.current = null;
    // Start camera closer to the graph
    if (fgRef.current) {
      fgRef.current.cameraPosition({ x: 0, y: 0, z: cameraDistance });
    }
  }, [data, cameraDistance]);

  // Disable zoom/pan — intercept at capture phase on the graph's own DOM element
  useEffect(() => {
    if (enableZoom && enablePan) return;
    const fg = fgRef.current;
    if (!fg) return;
    // The renderer's DOM element is where Three.js attaches its listeners
    const renderer = fg.renderer();
    const el = renderer?.domElement as HTMLElement | undefined;
    if (!el) return;

    const blockWheel = (e: Event) => { if (!enableZoom) { e.stopPropagation(); } };
    const blockRightMouse = (e: Event) => {
      const me = e as MouseEvent;
      if (!enablePan && (me.button === 1 || me.button === 2)) { e.stopPropagation(); e.preventDefault(); }
    };

    el.addEventListener('wheel', blockWheel, { capture: true, passive: false });
    el.addEventListener('mousedown', blockRightMouse, { capture: true });
    el.addEventListener('contextmenu', (e) => { if (!enablePan) e.preventDefault(); });

    return () => {
      el.removeEventListener('wheel', blockWheel, { capture: true } as EventListenerOptions);
      el.removeEventListener('mousedown', blockRightMouse, { capture: true } as EventListenerOptions);
    };
  }, [enableZoom, enablePan, data]);

  // Track camera distance changes (debounced) for zoom persistence
  useEffect(() => {
    if (!onCameraDistanceChange) return;
    let lastReported = cameraDistance;
    const interval = setInterval(() => {
      const fg = fgRef.current;
      if (!fg) return;
      const pos = fg.cameraPosition();
      if (!pos) return;
      const dist = Math.round(Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z));
      if (Math.abs(dist - lastReported) > 10) {
        lastReported = dist;
        onCameraDistanceChange(dist);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [onCameraDistanceChange, cameraDistance]);

  const graphData = useMemo(() => {
    const personId = (data.person.user_id || data.person.orb_id) as string;

    const seenIds = new Set<string>([personId]);
    const deduped = data.nodes.filter((n) => {
      if (seenIds.has(n.uid)) return false;
      seenIds.add(n.uid);
      return true;
    });

    const nodeIds = new Set(seenIds);

    const validLinks = data.links
      .filter((l) => nodeIds.has(l.source) && nodeIds.has(l.target))
      .map((l) => ({ source: l.source, target: l.target, label: l.type }));

    return {
      nodes: [
        { id: personId, ...data.person, _labels: ['Person'] },
        ...deduped.map((n) => ({ id: n.uid, ...n })),
      ],
      links: validLinks,
    };
  }, [data]);

  // Adjacency map for one-hop hover highlight (#414). Recomputes whenever
  // `graphData.links` changes — which includes: manual add/delete of a node,
  // CV import (bulk add), undo/redo, and any other mutation that routes
  // through the orb store's `data` state. `graphData` rebuilds a fresh links
  // array on every `data` change, so the reference check here is reliable.
  const adjacencyMap = useMemo(
    () => buildAdjacencyMap(graphData.links as Array<{ source: string | { id: string }; target: string | { id: string } }>),
    [graphData.links],
  );
  const adjacencyMapRef = useRef(adjacencyMap);
  adjacencyMapRef.current = adjacencyMap;

  // Add ambient light + particle background
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const scene = fg.scene();
    if (!scene) return;

    if (!scene.getObjectByName('__orb_ambient')) {
      const ambient = new THREE.AmbientLight(0xffffff, 0.4);
      ambient.name = '__orb_ambient';
      scene.add(ambient);
    }

    if (!scene.getObjectByName('__bg_particles')) {
      const count = 400;
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const palette = [
        new THREE.Color('#8b5cf6'),
        new THREE.Color('#6366f1'),
        new THREE.Color('#a78bfa'),
        new THREE.Color('#3b82f6'),
        new THREE.Color('#14b8a6'),
      ];

      for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = 150 + Math.random() * 350;
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);

        const col = palette[Math.floor(Math.random() * palette.length)];
        colors[i * 3] = col.r;
        colors[i * 3 + 1] = col.g;
        colors[i * 3 + 2] = col.b;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      const mat = new THREE.PointsMaterial({
        size: 0.8,
        transparent: true,
        opacity: 0.25,
        vertexColors: true,
        sizeAttenuation: true,
      });

      const points = new THREE.Points(geo, mat);
      points.name = '__bg_particles';
      scene.add(points);
    }
  }, [data]);

  // Single unified animation loop
  useEffect(() => {
    let animId: number;
    const animate = () => {
      const fg = fgRef.current;
      if (fg) {
        const scene = fg.scene();

        // Rotate background particles
        const particles = scene?.getObjectByName('__bg_particles');
        if (particles) {
          particles.rotation.y += 0.00008;
          particles.rotation.x += 0.00003;
        }

        // Auto-rotate graph when no node is hovered
        if (!hoveredNodeRef.current && !hasHighlightsRef.current && scene) {
          scene.rotation.y += 0.0012;
        }

        // Animate orbital rings via direct refs (no scene.traverse)
        const t = Date.now() * 0.003;
        if (orbitRing1Ref.current) orbitRing1Ref.current.rotation.z = t * 0.15;
        if (orbitRing2Ref.current) orbitRing2Ref.current.rotation.y = t * 0.1;

        // Animate highlight rings
        if (hasHighlightsRef.current) {
          const opacity = 0.4 + 0.4 * Math.sin(t);
          highlightRingsRef.current.forEach((ring) => {
            (ring.material as THREE.MeshBasicMaterial).opacity = opacity;
            ring.rotation.x = t * 0.5;
            ring.rotation.y = t * 0.3;
          });
        }
      }
      animId = requestAnimationFrame(animate);
    };
    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, []);

  // When highlights change, invalidate cache and refresh
  useEffect(() => {
    const newKey = highlightedNodeIds ? Array.from(highlightedNodeIds).sort().join(',') : '';
    if (newKey !== prevHighlightKeyRef.current) {
      prevHighlightKeyRef.current = newKey;
      nodeObjectCacheRef.current.clear();
      materialHandlesRef.current.clear();
      highlightRingsRef.current.clear();
      orbitRing1Ref.current = null;
      orbitRing2Ref.current = null;
      const fg = fgRef.current;
      if (fg) fg.refresh();
    }
  }, [highlightedNodeIds]);

  // When filtered nodes change, invalidate cache and refresh
  const prevFilterKeyRef = useRef<string>('');
  useEffect(() => {
    const newKey = filteredNodeIds ? Array.from(filteredNodeIds).sort().join(',') : '';
    if (newKey !== prevFilterKeyRef.current) {
      prevFilterKeyRef.current = newKey;
      nodeObjectCacheRef.current.clear();
      materialHandlesRef.current.clear();
      const fg = fgRef.current;
      if (fg) fg.refresh();
    }
  }, [filteredNodeIds]);

  // When hidden node types change, invalidate cache and refresh
  const prevHiddenTypesKeyRef = useRef<string>('');
  useEffect(() => {
    const newKey = hiddenNodeTypes ? Array.from(hiddenNodeTypes).sort().join(',') : '';
    if (newKey !== prevHiddenTypesKeyRef.current) {
      prevHiddenTypesKeyRef.current = newKey;
      nodeObjectCacheRef.current.clear();
      materialHandlesRef.current.clear();
      const fg = fgRef.current;
      if (fg) fg.refresh();
    }
  }, [hiddenNodeTypes]);

  // Center camera on requested node (chat result selection).
  useEffect(() => {
    if (!focusNodeId || focusNodeToken <= 0) return;
    const fg = fgRef.current;
    if (!fg) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 60;

    const centerOnNode = () => {
      if (cancelled || !fgRef.current) return;
      attempts += 1;

      const liveGraph = fgRef.current.graphData?.() as { nodes?: any[] } | undefined;
      const nodes = liveGraph?.nodes || graphData.nodes;
      const targetNode = nodes.find((n: any) => (n.id || n.uid) === focusNodeId);

      if (!targetNode) return;

      const x = Number(targetNode.x);
      const y = Number(targetNode.y);
      const z = Number(targetNode.z);

      if (![x, y, z].every(Number.isFinite)) {
        if (attempts < maxAttempts) requestAnimationFrame(centerOnNode);
        return;
      }

      const camera = fgRef.current.camera?.();
      const controls = fgRef.current.controls?.();
      const camPos = camera?.position;
      const currentTarget = controls?.target;

      const offset = new THREE.Vector3(0, 0, cameraDistance);
      if (camPos && currentTarget) {
        offset.set(
          camPos.x - currentTarget.x,
          camPos.y - currentTarget.y,
          camPos.z - currentTarget.z,
        );
      }
      if (!Number.isFinite(offset.length()) || offset.length() < 1) {
        offset.set(0, 0, cameraDistance);
      }

      fgRef.current.cameraPosition(
        { x: x + offset.x, y: y + offset.y, z: z + offset.z },
        { x, y, z },
        900,
      );
    };

    requestAnimationFrame(centerOnNode);
    return () => { cancelled = true; };
  }, [focusNodeId, focusNodeToken, graphData.nodes, cameraDistance]);

  const handleNodeHover = useCallback((node: any) => {
    setHoveredNode(node || null);
    hoveredNodeRef.current = node || null;
    const el = document.querySelector('canvas');
    if (el) el.style.cursor = node ? 'pointer' : 'default';

    // Any new hover event cancels a pending leave debounce and any running fade.
    if (hoverLeaveTimerRef.current !== null) {
      clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }
    if (fadeAnimationRef.current !== null) {
      cancelAnimationFrame(fadeAnimationRef.current);
      fadeAnimationRef.current = null;
    }

    if (node) {
      // Immediate emphasize — snap on enter, no delay.
      const uid = (node.id || node.uid) as string;
      const neighbors = adjacencyMapRef.current.get(uid);
      const emphasized = new Set<string>([uid]);
      if (neighbors) for (const n of neighbors) emphasized.add(n);
      hoverEmphasizedUidsRef.current = emphasized;
      setHoverTick((t) => t + 1);
    } else {
      // Debounced leave — if no new hover arrives within 80 ms, clear and fade.
      hoverLeaveTimerRef.current = window.setTimeout(() => {
        hoverLeaveTimerRef.current = null;
        const startTime = performance.now();
        const materialsAtStart: Array<{ mat: THREE.Material; from: number; to: number }> = [];
        materialHandlesRef.current.forEach((materials) => {
          for (const mat of materials) {
            const base = (mat.userData.__baseOpacity as number | undefined) ?? 1;
            materialsAtStart.push({ mat, from: mat.opacity, to: base });
          }
        });
        hoverEmphasizedUidsRef.current = new Set();

        const step = () => {
          const elapsed = performance.now() - startTime;
          const t = Math.min(1, elapsed / HOVER_FADE_MS);
          for (const { mat, from, to } of materialsAtStart) {
            mat.opacity = from + (to - from) * t;
          }
          if (t < 1) {
            fadeAnimationRef.current = requestAnimationFrame(step);
          } else {
            fadeAnimationRef.current = null;
            setHoverTick((n) => n + 1); // final state + link recolor
          }
        };
        fadeAnimationRef.current = requestAnimationFrame(step);
        // Snap link opacities back to their un-hovered value while node opacity
        // animates — visually indistinguishable over 200 ms and avoids extra
        // refreshes per frame. See the [hoverTick] effect for why link opacity
        // is mutated directly instead of via linkColor.
        const fg = fgRef.current;
        if (fg) {
          const liveLinks = (fg.graphData?.()?.links ?? []) as Array<{
            __lineObj?: { material?: THREE.Material & { opacity: number; transparent: boolean } };
          }>;
          for (const link of liveLinks) {
            const mat = link.__lineObj?.material;
            if (mat) mat.opacity = 0.5;
          }
          fg.refresh();
        }
      }, HOVER_LEAVE_DEBOUNCE_MS);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (hoverLeaveTimerRef.current !== null) clearTimeout(hoverLeaveTimerRef.current);
      if (fadeAnimationRef.current !== null) cancelAnimationFrame(fadeAnimationRef.current);
    };
  }, []);

  useEffect(() => {
    // Skip this effect's snap-set while a fade animation is running; the fade
    // loop is driving opacity directly and will setHoverTick again on completion.
    if (fadeAnimationRef.current !== null) return;

    const emphasized = hoverEmphasizedUidsRef.current;
    const filterHighlights = highlightRef.current;
    const isHovering = emphasized.size > 0;

    materialHandlesRef.current.forEach((materials, uid) => {
      const isEmphasized = emphasized.has(uid);
      const isFilterHighlighted = filterHighlights.has(uid);
      const shouldDim = isHovering && !isEmphasized && !isFilterHighlighted;
      for (const mat of materials) {
        const base = (mat.userData.__baseOpacity as number | undefined) ?? 1;
        mat.opacity = shouldDim ? base * HOVER_DIM_OPACITY : base;
        mat.transparent = true;
      }
    });

    // Link opacity: THREE.Color ignores alpha in rgba() strings, so `linkColor`
    // alone cannot dim edges — only re-tint them. Mutate each link's material
    // directly. react-force-graph-3d exposes the rendered line mesh as
    // `link.__lineObj` on each item in the live links array.
    const fg = fgRef.current;
    if (fg) {
      const liveLinks = (fg.graphData?.()?.links ?? []) as Array<{
        source: string | { id: string };
        target: string | { id: string };
        __lineObj?: { material?: THREE.Material & { opacity: number; transparent: boolean } };
      }>;
      for (const link of liveLinks) {
        const mat = link.__lineObj?.material;
        if (!mat) continue;
        const srcId = typeof link.source === 'object' ? link.source.id : link.source;
        const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
        const bothEmphasized = emphasized.has(srcId) && emphasized.has(tgtId);
        const shouldDim = isHovering && !bothEmphasized;
        mat.transparent = true;
        mat.opacity = shouldDim ? HOVER_DIM_LINK_ALPHA : 0.5;
      }
      fg.refresh();
    }
  }, [hoverTick]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    setTooltipPos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleNodeClick = useCallback(
    (node: any) => {
      if (onNodeClick && node) onNodeClick(node);
    },
    [onNodeClick]
  );

  const handleBackgroundClick = useCallback(() => {
    if (onBackgroundClick) onBackgroundClick();
  }, [onBackgroundClick]);

  const nodeThreeObject = useCallback((node: any) => {
    const nodeId = node.id || node.uid;

    const cached = nodeObjectCacheRef.current.get(nodeId);
    if (cached) return cached;

    const isPerson = node._labels?.[0] === 'Person';
    const nodeType = node._labels?.[0] || '';
    const isHidden = !isPerson && hiddenTypesRef.current.has(nodeType);

    // Hidden nodes: return an empty invisible group
    if (isHidden) {
      const empty = new THREE.Group();
      empty.visible = false;
      nodeObjectCacheRef.current.set(nodeId, empty);
      return empty;
    }

    // Reset any prior handles for this uid (happens on cache rebuild).
    const handles: THREE.Material[] = [];

    const color = getNodeColor(node._labels || []);
    const radius = isPerson ? 5 : 3;

    const hasHighlights = hasHighlightsRef.current;
    const isHighlighted = hasHighlights && highlightRef.current.has(nodeId);
    const isDimmed = hasHighlights && !isHighlighted;
    const isFiltered = filteredRef.current.has(nodeId);

    const fo = isFiltered ? 0.15 : 1; // filter opacity multiplier
    const nodeCol = isFiltered ? new THREE.Color('#ffffff') : new THREE.Color(color);

    const group = new THREE.Group();

    if (isPerson) {
      // ── Person node: styled after the top-left myorbis logo mark — a
      // semi-transparent purple-600 outer disc with a solid purple-400
      // inner dot. Orbital rings + mid-glow retained so the root node
      // still reads as the graph's focal point. ──
      const coreMat = new THREE.MeshBasicMaterial({
        color: isFiltered ? new THREE.Color('#ffffff') : new THREE.Color('#9333ea'),
        transparent: true,
        opacity: (isDimmed ? 0.12 : 0.35) * fo,
      });
      handles.push(coreMat);
      group.add(new THREE.Mesh(SHARED_GEO.personCore, coreMat));

      // Inner solid — matches purple-400 inner dot in the logo
      const innerGlowMat = new THREE.MeshBasicMaterial({
        color: isFiltered ? new THREE.Color('#ffffff') : new THREE.Color('#c084fc'),
        transparent: true,
        opacity: (isDimmed ? 0.3 : 1) * fo,
      });
      handles.push(innerGlowMat);
      group.add(new THREE.Mesh(SHARED_GEO.personInnerGlow, innerGlowMat));

      // Innermost bright dot — a third, brighter purple layer at the very
      // centre reinforces the logo's concentric-circle identity in 3D.
      const innerDotMat = new THREE.MeshBasicMaterial({
        color: isFiltered ? new THREE.Color('#ffffff') : new THREE.Color('#e9d5ff'),
        transparent: true,
        opacity: (isDimmed ? 0.4 : 1) * fo,
      });
      handles.push(innerDotMat);
      group.add(new THREE.Mesh(SHARED_GEO.personInnerDot, innerDotMat));

      // Orbital ring 1
      const ring1Mat = new THREE.MeshBasicMaterial({
        color: nodeCol,
        transparent: true,
        opacity: (isDimmed ? 0.05 : 0.5) * fo,
      });
      handles.push(ring1Mat);
      const ring1 = new THREE.Mesh(SHARED_GEO.personRing1, ring1Mat);
      ring1.rotation.x = Math.PI / 2;
      orbitRing1Ref.current = ring1;
      group.add(ring1);

      // Orbital ring 2
      const ring2Mat = new THREE.MeshBasicMaterial({
        color: isFiltered ? new THREE.Color('#ffffff') : new THREE.Color('#a78bfa'),
        transparent: true,
        opacity: (isDimmed ? 0.03 : 0.3) * fo,
      });
      handles.push(ring2Mat);
      const ring2 = new THREE.Mesh(SHARED_GEO.personRing2, ring2Mat);
      ring2.rotation.x = Math.PI / 3;
      ring2.rotation.z = Math.PI / 6;
      orbitRing2Ref.current = ring2;
      group.add(ring2);

      // Mid glow
      const midMat = new THREE.MeshBasicMaterial({
        color: nodeCol,
        transparent: true,
        opacity: (isDimmed ? 0.01 : 0.06) * fo,
      });
      handles.push(midMat);
      group.add(new THREE.Mesh(SHARED_GEO.personMidGlow, midMat));

      // White wireframe sphere border for filtered person node
      if (isFiltered) {
        const borderGeo = new THREE.SphereGeometry(6 * 1.5, 16, 12);
        const borderMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color('#ffffff'),
          transparent: true,
          opacity: 0.5,
          wireframe: true,
        });
        const border = new THREE.Mesh(borderGeo, borderMat);
        border.name = '__filter_border';
        group.add(border);
      }

    } else {
      // ── Regular nodes: 2 meshes (core + main), no PointLight ──

      // White core
      const coreMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: (isDimmed ? 0.05 : isHighlighted ? 0.95 : 0.7) * fo,
      });
      handles.push(coreMat);
      group.add(new THREE.Mesh(SHARED_GEO.nodeCore, coreMat));

      // Main sphere — emissive color via MeshBasicMaterial (no light needed)
      const mainMat = new THREE.MeshBasicMaterial({
        color: nodeCol,
        transparent: true,
        opacity: (isDimmed ? 0.2 : 0.85) * fo,
      });
      handles.push(mainMat);
      group.add(new THREE.Mesh(SHARED_GEO.nodeMain, mainMat));

      // Single glow layer
      const glowMat = new THREE.MeshBasicMaterial({
        color: nodeCol,
        transparent: true,
        opacity: (isDimmed ? 0.01 : isHighlighted ? 0.15 : 0.05) * fo,
      });
      handles.push(glowMat);
      group.add(new THREE.Mesh(SHARED_GEO.nodeGlow, glowMat));

      // White wireframe sphere border for filtered node
      if (isFiltered) {
        const borderGeo = new THREE.SphereGeometry(radius * 1.4, 16, 12);
        const borderMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color('#ffffff'),
          transparent: true,
          opacity: 0.5,
          wireframe: true,
        });
        const border = new THREE.Mesh(borderGeo, borderMat);
        border.name = '__filter_border';
        group.add(border);
      }

      // Highlight ring
      if (isHighlighted && !isFiltered) {
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.8,
          side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(SHARED_GEO.highlightRing, ringMat);
        highlightRingsRef.current.set(nodeId, ring);
        group.add(ring);
      }

    }

    for (const mat of handles) {
      mat.userData.__baseOpacity = mat.opacity;
    }
    materialHandlesRef.current.set(nodeId, handles);
    nodeObjectCacheRef.current.set(nodeId, group);
    return group;
  }, []);

  // Pre-compute node ID → color map so link coloring works even before
  // the force graph resolves source/target strings into objects.
  const nodeColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of graphData.nodes) {
      map.set(n.id as string, getNodeColor((n as any)._labels || []));
    }
    return map;
  }, [graphData]);

  // Node type map for link visibility
  const nodeTypeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of graphData.nodes) {
      map.set(n.id as string, (n as any)._labels?.[0] || '');
    }
    return map;
  }, [graphData]);

  const nodeTypeMapRef = useRef(nodeTypeMap);
  nodeTypeMapRef.current = nodeTypeMap;

  // Link color
  const nodeColorMapRef = useRef(nodeColorMap);
  nodeColorMapRef.current = nodeColorMap;

  const linkColorRef = useRef<(link: any) => string>(() => 'rgba(255,255,255,0.2)');
  linkColorRef.current = (link: any) => {
    const sourceId = typeof link.source === 'object' ? (link.source.id || link.source.uid) : link.source;
    const targetId = typeof link.target === 'object' ? (link.target.id || link.target.uid) : link.target;

    // Hide links to hidden node types
    const sourceType = nodeTypeMapRef.current.get(sourceId) || '';
    const targetType = nodeTypeMapRef.current.get(targetId) || '';
    if (hiddenTypesRef.current.has(sourceType) || hiddenTypesRef.current.has(targetType)) {
      return 'rgba(0,0,0,0)';
    }

    const isLinkFiltered = filteredRef.current.has(sourceId) || filteredRef.current.has(targetId);
    if (isLinkFiltered) return 'rgba(255,255,255,0.02)';

    // Hover dim is applied via direct material.opacity mutation in the
    // [hoverTick] useEffect — three.js's THREE.Color parser ignores the alpha
    // channel in rgba() strings, so we can't dim via color alone.

    const hex = nodeColorMapRef.current.get(sourceId);
    if (hex) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      const alpha = hasHighlightsRef.current ? 0.08 : 0.45;
      return `rgba(${r},${g},${b},${alpha})`;
    }
    return hasHighlightsRef.current ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.2)';
  };
  // Depend on hoverTick so react-force-graph sees a new function reference on
  // each hover change and re-evaluates link colors. Without this, the library
  // caches per-link colors and hover-driven dimming never reaches the links.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableLinkColor = useCallback((link: any) => linkColorRef.current(link), [hoverTick]);

  return (
    <div
      className="relative w-full h-full"
      onPointerMove={handlePointerMove}
      onPointerEnter={() => { isHoveringRef.current = true; }}
      onPointerLeave={() => {
        isHoveringRef.current = false;
        setHoveredNode(null);
        hoveredNodeRef.current = null;
        // Clear hover emphasis immediately when the pointer exits the canvas
        // (no 80 ms debounce — matches the tooltip-dismiss UX).
        if (hoverLeaveTimerRef.current !== null) {
          clearTimeout(hoverLeaveTimerRef.current);
          hoverLeaveTimerRef.current = null;
        }
        if (fadeAnimationRef.current !== null) {
          cancelAnimationFrame(fadeAnimationRef.current);
          fadeAnimationRef.current = null;
        }
        hoverEmphasizedUidsRef.current = new Set();
        setHoverTick((t) => t + 1);
      }}
    >
      <ForceGraph3D
        ref={fgRef}
        graphData={graphData}
        width={width}
        height={height}
        backgroundColor="#000000"
        showNavInfo={false}
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend={false}
        nodeLabel={() => ''}
        linkColor={stableLinkColor}
        linkWidth={1}
        linkOpacity={0.5}
        linkCurvature={0.15}
        linkCurveRotation={0.5}
        onNodeHover={handleNodeHover}
        onNodeClick={handleNodeClick}
        onBackgroundClick={handleBackgroundClick}
      />
      <NodeTooltip node={tooltipEnabled ? hoveredNode : null} position={tooltipPos} />
    </div>
  );
}
