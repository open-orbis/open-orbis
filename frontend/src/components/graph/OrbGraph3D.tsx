import { useCallback, useRef, useState, useMemo, useEffect } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import type { OrbData } from '../../api/orbs';
import { getNodeColor, NODE_TYPE_LABELS } from './NodeColors';
import NodeTooltip from './NodeTooltip';

interface OrbGraph3DProps {
  data: OrbData;
  onNodeClick?: (node: Record<string, unknown>) => void;
  onBackgroundClick?: () => void;
  highlightedNodeIds?: Set<string>;
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

export default function OrbGraph3D({ data, onNodeClick, onBackgroundClick, highlightedNodeIds, width, height }: OrbGraph3DProps) {
  const fgRef = useRef<any>(undefined);
  const [hoveredNode, setHoveredNode] = useState<Record<string, unknown> | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const highlightRingsRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const nodeObjectCacheRef = useRef<Map<string, THREE.Group>>(new Map());
  const prevHighlightKeyRef = useRef<string>('');

  // Use ref for highlights so nodeThreeObject callback stays stable
  const highlightRef = useRef<Set<string>>(new Set());
  highlightRef.current = highlightedNodeIds ?? new Set();
  const hasHighlightsRef = useRef(false);
  hasHighlightsRef.current = (highlightedNodeIds?.size ?? 0) > 0;

  // Clear cache when data changes
  useEffect(() => {
    nodeObjectCacheRef.current.clear();
  }, [data]);

  const graphData = useMemo(() => ({
    nodes: [
      {
        id: (data.person.user_id || data.person.orb_id) as string,
        ...data.person,
        _labels: ['Person'],
      },
      ...data.nodes.map((n) => ({ id: n.uid, ...n })),
    ],
    links: data.links.map((l) => ({
      source: l.source,
      target: l.target,
      label: l.type,
    })),
  }), [data]);

  // Add ambient light + particle background
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const scene = fg.scene();
    if (!scene) return;

    // Ambient light
    if (!scene.getObjectByName('__orb_ambient')) {
      const ambient = new THREE.AmbientLight(0x222222, 0.5);
      ambient.name = '__orb_ambient';
      scene.add(ambient);
    }

    // Particle background
    if (!scene.getObjectByName('__bg_particles')) {
      const count = 600;
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
        // Distribute in a large sphere
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

  // Slowly rotate background particles
  useEffect(() => {
    let animId: number;
    const animate = () => {
      const fg = fgRef.current;
      if (fg) {
        const scene = fg.scene();
        const particles = scene?.getObjectByName('__bg_particles');
        if (particles) {
          particles.rotation.y += 0.00008;
          particles.rotation.x += 0.00003;
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
      nodeObjectCacheRef.current.clear(); // Force rebuild with new highlight states
      highlightRingsRef.current.clear();
      const fg = fgRef.current;
      if (fg) fg.refresh();
    }
  }, [highlightedNodeIds]);

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
      if (onNodeClick && node) onNodeClick(node);
    },
    [onNodeClick]
  );

  const handleBackgroundClick = useCallback(() => {
    if (onBackgroundClick) onBackgroundClick();
  }, [onBackgroundClick]);

  // Stable callback — reads highlight state from refs, uses cache
  const nodeThreeObject = useCallback((node: any) => {
    const nodeId = node.id || node.uid;

    // Return cached object if available
    const cached = nodeObjectCacheRef.current.get(nodeId);
    if (cached) return cached;

    const isPerson = node._labels?.[0] === 'Person';
    const color = getNodeColor(node._labels || []);
    const radius = isPerson ? 5 : 3;

    const hasHighlights = hasHighlightsRef.current;
    const isHighlighted = hasHighlights && highlightRef.current.has(nodeId);
    const isDimmed = hasHighlights && !isHighlighted;

    const group = new THREE.Group();
    const col = new THREE.Color(color);

    if (isPerson) {
      // ── Distinct Person node: orbital ring design (large) ──
      const pr = 6; // person radius — bigger than regular nodes

      // Central bright core
      const coreGeo = new THREE.SphereGeometry(pr, 48, 48);
      const coreMat = new THREE.MeshStandardMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: isDimmed ? 0.1 : isHighlighted ? 0.9 : 0.6,
        transparent: true,
        opacity: isDimmed ? 0.2 : 0.9,
        roughness: 0.15,
        metalness: 0.3,
      });
      group.add(new THREE.Mesh(coreGeo, coreMat));

      // Inner white glow
      const innerGlowGeo = new THREE.SphereGeometry(pr * 0.4, 24, 24);
      const innerGlowMat = new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: isDimmed ? 0.05 : 0.55,
      });
      group.add(new THREE.Mesh(innerGlowGeo, innerGlowMat));

      // Orbital ring 1 (horizontal)
      const ring1Geo = new THREE.TorusGeometry(pr * 1.6, 0.15, 16, 100);
      const ring1Mat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: isDimmed ? 0.05 : 0.5,
      });
      const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
      ring1.rotation.x = Math.PI / 2;
      ring1.name = '__orbit_ring_1';
      group.add(ring1);

      // Orbital ring 2 (tilted)
      const ring2Geo = new THREE.TorusGeometry(pr * 1.9, 0.1, 16, 100);
      const ring2Mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color('#a78bfa'),
        transparent: true,
        opacity: isDimmed ? 0.03 : 0.3,
      });
      const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
      ring2.rotation.x = Math.PI / 3;
      ring2.rotation.z = Math.PI / 6;
      ring2.name = '__orbit_ring_2';
      group.add(ring2);

      // Mid glow
      const midGeo = new THREE.SphereGeometry(pr * 1.4, 24, 24);
      const midMat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: isDimmed ? 0.01 : 0.06,
      });
      group.add(new THREE.Mesh(midGeo, midMat));

      // Outer glow
      const outerGeo = new THREE.SphereGeometry(pr * 2.5, 16, 16);
      const outerMat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: isDimmed ? 0.005 : 0.025,
      });
      group.add(new THREE.Mesh(outerGeo, outerMat));

      // Point light
      if (!isDimmed) {
        const light = new THREE.PointLight(col, 35, 100);
        light.decay = 2;
        group.add(light);
      }
    } else {
      // ── Regular nodes ──

      // Inner bright core
      const coreGeo = new THREE.SphereGeometry(radius * 0.35, 24, 24);
      const coreMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color('#ffffff'),
        transparent: true,
        opacity: isDimmed ? 0.05 : isHighlighted ? 0.95 : 0.7,
      });
      group.add(new THREE.Mesh(coreGeo, coreMat));

      // Main sphere
      const mainGeo = new THREE.SphereGeometry(radius, 32, 32);
      const mainMat = new THREE.MeshStandardMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: isDimmed ? 0.1 : isHighlighted ? 0.9 : 0.55,
        transparent: true,
        opacity: isDimmed ? 0.2 : 0.85,
        roughness: 0.2,
        metalness: 0.15,
      });
      group.add(new THREE.Mesh(mainGeo, mainMat));

      // Mid glow
      const midGeo = new THREE.SphereGeometry(radius * 1.5, 24, 24);
      const midMat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: isDimmed ? 0.01 : isHighlighted ? 0.18 : 0.07,
      });
      group.add(new THREE.Mesh(midGeo, midMat));

      // Outer glow
      const outerGeo = new THREE.SphereGeometry(radius * 2.2, 16, 16);
      const outerMat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: isDimmed ? 0.005 : isHighlighted ? 0.08 : 0.03,
      });
      group.add(new THREE.Mesh(outerGeo, outerMat));

      // Point light
      if (!isDimmed) {
        const light = new THREE.PointLight(col, 10, 45);
        light.decay = 2;
        group.add(light);
      }

      // Highlight ring
      if (isHighlighted) {
        const ringGeo = new THREE.RingGeometry(radius * 1.7, radius * 2.0, 48);
        const ringMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color('#ffffff'),
          transparent: true,
          opacity: 0.8,
          side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        highlightRingsRef.current.set(nodeId, ring);
        group.add(ring);
      }
    }

    // Text label sprite
    const name = getNodeName(node);
    if (name) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      const dpr = 2;
      canvas.width = 512 * dpr;
      canvas.height = 80 * dpr;
      ctx.scale(dpr, dpr);

      ctx.clearRect(0, 0, 512, 80);

      ctx.font = `600 ${isPerson ? 20 : 15}px Inter, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = isDimmed ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.9)';
      const displayName = name.length > 28 ? name.slice(0, 26) + '\u2026' : name;
      ctx.fillText(displayName, 256, isPerson ? 32 : 28);

      if (!isPerson) {
        const typeLabel = getTypeLabel(node);
        if (typeLabel) {
          ctx.font = '500 11px Inter, -apple-system, sans-serif';
          ctx.fillStyle = isDimmed ? 'rgba(255,255,255,0.06)' : color;
          ctx.fillText(typeLabel, 256, 46);
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
      sprite.scale.set(24, 3.8, 1);
      sprite.position.y = -(isPerson ? 10 : radius + 5);
      group.add(sprite);
    }

    nodeObjectCacheRef.current.set(nodeId, group);
    return group;
  }, []); // Stable — no dependencies, reads from refs

  // Animate highlight rings + person orbital rings
  useEffect(() => {
    let animId: number;
    const animate = () => {
      const t = Date.now() * 0.003;

      // Animate highlight rings
      if (hasHighlightsRef.current) {
        highlightRingsRef.current.forEach((ring) => {
          (ring.material as THREE.MeshBasicMaterial).opacity = 0.4 + 0.4 * Math.sin(t);
          ring.rotation.x = t * 0.5;
          ring.rotation.y = t * 0.3;
        });
      }

      // Animate person orbital rings
      const fg = fgRef.current;
      if (fg) {
        const scene = fg.scene();
        if (scene) {
          scene.traverse((child: THREE.Object3D) => {
            if (child.name === '__orbit_ring_1') {
              child.rotation.z = t * 0.15;
            } else if (child.name === '__orbit_ring_2') {
              child.rotation.y = t * 0.1;
            }
          });
        }
      }

      animId = requestAnimationFrame(animate);
    };
    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, [highlightedNodeIds]);

  // Link color — reads from ref
  const linkColorRef = useRef<(link: any) => string>(() => 'rgba(255,255,255,0.2)');
  linkColorRef.current = (link: any) => {
    if (hasHighlightsRef.current) return 'rgba(255,255,255,0.04)';
    const source = link.source;
    if (source && source._labels) {
      const c = getNodeColor(source._labels || []);
      const r = parseInt(c.slice(1, 3), 16);
      const g = parseInt(c.slice(3, 5), 16);
      const b = parseInt(c.slice(5, 7), 16);
      return `rgba(${r},${g},${b},0.35)`;
    }
    return 'rgba(255,255,255,0.2)';
  };
  const stableLinkColor = useCallback((link: any) => linkColorRef.current(link), []);

  return (
    <div className="relative w-full h-full" onPointerMove={handlePointerMove}>
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
        linkWidth={1.5}
        linkOpacity={0.6}
        linkCurvature={0.2}
        linkCurveRotation={0.5}
        onNodeHover={handleNodeHover}
        onNodeClick={handleNodeClick}
        onBackgroundClick={handleBackgroundClick}
      />
      <NodeTooltip node={hoveredNode} position={tooltipPos} />
    </div>
  );
}
