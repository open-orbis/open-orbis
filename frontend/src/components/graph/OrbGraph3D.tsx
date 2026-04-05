import { useCallback, useRef, useState, useMemo, useEffect } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import type { OrbData } from '../../api/orbs';
import { getNodeColor, NODE_TYPE_LABELS, NODE_SHAPE_MARKERS } from './NodeColors';
import NodeTooltip from './NodeTooltip';
import { trackEvent } from '../../analytics/tracker';

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
}

function getNodeName(node: any): string {
  const label = node._labels?.[0];
  if (label === 'Person') return node.name || 'You';
  return node.name || node.title || node.company || node.institution || '';
}

function getTypeLabel(node: any): string {
  const label = node._labels?.[0];
  if (label === 'Person') return '';
  const snakeCase = label?.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '') || '';
  return NODE_TYPE_LABELS[snakeCase] || label || '';
}

// ── Shared geometry pool (created once, reused for all nodes) ──
const SHARED_GEO = {
  personCore: new THREE.SphereGeometry(6, 24, 24),
  personInnerGlow: new THREE.SphereGeometry(2.4, 12, 12),
  personMidGlow: new THREE.SphereGeometry(8.4, 12, 12),
  personRing1: new THREE.TorusGeometry(9.6, 0.15, 8, 48),
  personRing2: new THREE.TorusGeometry(11.4, 0.1, 8, 48),
  nodeCore: new THREE.SphereGeometry(1.05, 12, 12),
  nodeMain: new THREE.SphereGeometry(3, 16, 16),
  nodeGlow: new THREE.SphereGeometry(4.5, 10, 10),
  highlightRing: new THREE.RingGeometry(5.1, 6.0, 24),
};

export default function OrbGraph3D({ data, onNodeClick, onBackgroundClick, highlightedNodeIds, filteredNodeIds, hiddenNodeTypes, width, height }: OrbGraph3DProps) {
  const fgRef = useRef<any>(undefined);
  const [hoveredNode, setHoveredNode] = useState<Record<string, unknown> | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const highlightRingsRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const nodeObjectCacheRef = useRef<Map<string, THREE.Group>>(new Map());
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
    orbitRing1Ref.current = null;
    orbitRing2Ref.current = null;
    // Start camera closer to the graph
    if (fgRef.current) {
      fgRef.current.cameraPosition({ x: 0, y: 0, z: 400 });
    }
  }, [data]);

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

        // Auto-rotate graph when not hovering
        if (!isHoveringRef.current && scene) {
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
      const fg = fgRef.current;
      if (fg) fg.refresh();
    }
  }, [hiddenNodeTypes]);

  const handleNodeHover = useCallback((node: any) => {
    setHoveredNode(node || null);
    const el = document.querySelector('canvas');
    if (el) el.style.cursor = node ? 'pointer' : 'default';
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    setTooltipPos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleNodeClick = useCallback(
    (node: any) => {
      if (onNodeClick && node) {
        trackEvent('graph_interaction', { type: 'node_click', nodeType: node._labels?.[0] });
        onNodeClick(node);
      }
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
      // ── Person node: emissive core + orbital rings (no PointLight) ──
      const coreMat = new THREE.MeshBasicMaterial({
        color: nodeCol,
        transparent: true,
        opacity: (isDimmed ? 0.2 : 0.9) * fo,
      });
      group.add(new THREE.Mesh(SHARED_GEO.personCore, coreMat));

      // Inner white glow
      const innerGlowMat = new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: (isDimmed ? 0.05 : 0.55) * fo,
      });
      group.add(new THREE.Mesh(SHARED_GEO.personInnerGlow, innerGlowMat));

      // Orbital ring 1
      const ring1Mat = new THREE.MeshBasicMaterial({
        color: nodeCol,
        transparent: true,
        opacity: (isDimmed ? 0.05 : 0.5) * fo,
      });
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
      group.add(new THREE.Mesh(SHARED_GEO.nodeCore, coreMat));

      // Main sphere — emissive color via MeshBasicMaterial (no light needed)
      const mainMat = new THREE.MeshBasicMaterial({
        color: nodeCol,
        transparent: true,
        opacity: (isDimmed ? 0.2 : 0.85) * fo,
      });
      group.add(new THREE.Mesh(SHARED_GEO.nodeMain, mainMat));

      // Single glow layer
      const glowMat = new THREE.MeshBasicMaterial({
        color: nodeCol,
        transparent: true,
        opacity: (isDimmed ? 0.01 : isHighlighted ? 0.15 : 0.05) * fo,
      });
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

    // Text label sprite
    const name = getNodeName(node);
    if (name) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      canvas.width = 512;
      canvas.height = 64;

      ctx.clearRect(0, 0, 512, 64);

      ctx.font = `600 ${isPerson ? 18 : 13}px Inter, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      const textAlpha = isFiltered ? 0.06 : isDimmed ? 0.12 : 0.9;
      ctx.fillStyle = `rgba(255,255,255,${textAlpha})`;
      const displayName = name.length > 28 ? name.slice(0, 26) + '\u2026' : name;
      ctx.fillText(displayName, 256, isPerson ? 24 : 20);

      if (!isPerson) {
        const typeLabel = getTypeLabel(node);
        const marker = NODE_SHAPE_MARKERS[node._labels?.[0] || ''] || '';
        if (typeLabel) {
          ctx.font = '500 10px Inter, -apple-system, sans-serif';
          ctx.fillStyle = isFiltered ? 'rgba(255,255,255,0.03)' : isDimmed ? 'rgba(255,255,255,0.06)' : color;
          ctx.fillText(`${marker} ${typeLabel}`, 256, 38);
        }
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      const spriteMat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(22, 2.8, 1);
      sprite.position.y = -(isPerson ? 10 : radius + 5);
      group.add(sprite);
    }

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
  const stableLinkColor = useCallback((link: any) => linkColorRef.current(link), []);

  return (
    <div
      className="relative w-full h-full"
      onPointerMove={handlePointerMove}
      onPointerEnter={() => { isHoveringRef.current = true; }}
      onPointerLeave={() => { isHoveringRef.current = false; }}
    >
      <ForceGraph3D
        ref={fgRef}
        graphData={graphData}
        width={width}
        height={height}
        backgroundColor="#000000"
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
      <NodeTooltip node={hoveredNode} position={tooltipPos} />
    </div>
  );
}
