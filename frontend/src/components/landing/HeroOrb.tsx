import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import * as THREE from 'three';

function OrbSphere() {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (meshRef.current) {
      meshRef.current.rotation.y = t * 0.15;
      meshRef.current.rotation.x = Math.sin(t * 0.1) * 0.1;
    }
    if (glowRef.current) {
      glowRef.current.scale.setScalar(1 + Math.sin(t * 0.8) * 0.05);
    }
  });

  return (
    <group>
      {/* Inner glow sphere */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[2.2, 32, 32]} />
        <meshBasicMaterial color="#7c3aed" transparent opacity={0.08} />
      </mesh>

      {/* Main orb */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[1.8, 64, 64]} />
        <meshStandardMaterial
          color="#6d28d9"
          emissive="#7c3aed"
          emissiveIntensity={0.6}
          roughness={0.3}
          metalness={0.8}
        />
      </mesh>

      {/* Highlight ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.0, 0.015, 16, 100]} />
        <meshBasicMaterial color="#a78bfa" transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

function Particles() {
  const count = 300;
  const ref = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 2.5 + Math.random() * 2.5;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    return pos;
  }, []);

  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = clock.getElapsedTime() * 0.03;
      ref.current.rotation.x = clock.getElapsedTime() * 0.01;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#a78bfa"
        size={0.03}
        transparent
        opacity={0.7}
        sizeAttenuation
      />
    </points>
  );
}

function Rays() {
  const groupRef = useRef<THREE.Group>(null);
  const rayCount = 12;

  const rays = useMemo(() => {
    return Array.from({ length: rayCount }, (_, i) => {
      const angle = (i / rayCount) * Math.PI * 2;
      const length = 1.5 + Math.random() * 1.5;
      return { angle, length, phase: Math.random() * Math.PI * 2 };
    });
  }, []);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    groupRef.current.children.forEach((child, i) => {
      const ray = rays[i];
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.2 + ray.phase);
      (child as THREE.Mesh).scale.set(1, pulse, 1);
    });
  });

  return (
    <group ref={groupRef}>
      {rays.map((ray, i) => (
        <mesh
          key={i}
          position={[
            Math.cos(ray.angle) * 2.1,
            Math.sin(ray.angle) * 2.1,
            0,
          ]}
          rotation={[0, 0, ray.angle - Math.PI / 2]}
        >
          <planeGeometry args={[0.02, ray.length]} />
          <meshBasicMaterial
            color="#8b5cf6"
            transparent
            opacity={0.3}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

export default function HeroOrb() {
  return (
    <div className="w-64 h-64 md:w-80 md:h-80">
      <Canvas
        camera={{ position: [0, 0, 8], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.3} />
        <pointLight position={[5, 5, 5]} intensity={1} color="#a78bfa" />
        <pointLight position={[-5, -3, 3]} intensity={0.5} color="#6d28d9" />

        <OrbSphere />
        <Particles />
        <Rays />

        <EffectComposer>
          <Bloom
            intensity={1.2}
            luminanceThreshold={0.2}
            luminanceSmoothing={0.9}
            mipmapBlur
          />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
