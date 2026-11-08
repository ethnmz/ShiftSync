/**
 * The glass mascots from the "AI Agent Mascot Models" Figma Make file, as
 * ported in ethnmz/Harbor (geometry and materials unchanged). ShiftSync keeps
 * several mascots per canvas, the transparent background, the cursor follow
 * and pausing off screen. It drops Harbor's hop/celebrate animation (finishing
 * a handoff proves nothing is safe) and the drag-to-orbit controls.
 * Loaded lazily by Mascot3D.tsx, so three.js is only fetched where it shows.
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Float, Lightformer, MeshTransmissionMaterial } from "@react-three/drei";
import { useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MASCOTS, type MascotKind } from "./registry";

const INK = "#151515";

// Global pointer so every canvas reacts to the cursor anywhere on the page.
const mouse = { x: 0, y: 0 };
if (typeof window !== "undefined") {
  window.addEventListener(
    "pointermove",
    (e) => {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    },
    { passive: true },
  );
}

const tintOf = (color: string) => new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.86);

/**
 * The refraction buffer is a square snapshot stretched over the whole canvas, so it must match the
 * canvas's device pixels to stay sharp: never below the Figma file's 512, up to 1024 for big canvases.
 */
function useBufferSize() {
  const { size, viewport } = useThree();
  return Math.min(1024, Math.max(512, Math.ceil((Math.max(size.width, size.height) * viewport.dpr) / 128) * 128));
}

const Glass = ({ bg }: { bg: THREE.Color }) => (
  <MeshTransmissionMaterial
    background={bg}
    samples={6}
    resolution={useBufferSize()}
    transmission={1}
    roughness={0.06}
    thickness={0.8}
    ior={1.45}
    chromaticAberration={0.1}
    anisotropy={0.2}
    distortion={0.12}
    distortionScale={0.4}
    temporalDistortion={0.04}
    clearcoat={1}
    clearcoatRoughness={0.04}
  />
);
const Ink = () => <meshPhysicalMaterial color={INK} roughness={0.12} metalness={0.2} clearcoat={1} clearcoatRoughness={0.04} />;
const Glow = ({ color, intensity = 2.2 }: { color: string; intensity?: number }) => (
  <meshStandardMaterial color={color} emissive={color} emissiveIntensity={intensity} toneMapped={false} />
);

type AgentProps = { color: string; bg: THREE.Color };

function Face({ z, y = 0, color, offset = 0 }: { z: number; y?: number; color: string; offset?: number }) {
  const ref = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  useFrame(({ clock }, d) => {
    const g = ref.current;
    if (!g || !eyes.current) return;
    g.position.x = THREE.MathUtils.damp(g.position.x, mouse.x * 0.06, 10, d);
    g.position.y = THREE.MathUtils.damp(g.position.y, y + mouse.y * 0.05, 10, d);
    const blink = (clock.elapsedTime + offset) % 4 < 0.13 ? 0.12 : 1;
    eyes.current.children.forEach((c) => (c.scale.y = THREE.MathUtils.damp(c.scale.y, blink, 30, d)));
  });
  return (
    <group ref={ref} position={[0, y, z]}>
      <group ref={eyes}>
        {[-1, 1].map((i) => (
          <mesh key={i} position={[i * 0.17, 0, 0]}>
            <capsuleGeometry args={[0.055, 0.1, 8, 16]} />
            <Ink />
          </mesh>
        ))}
      </group>
      {[-1, 1].map((i) => (
        <mesh key={i} position={[i * 0.33, -0.13, -0.02]} scale={[1, 0.6, 0.3]}>
          <sphereGeometry args={[0.07, 16, 16]} />
          <Glow color={color} intensity={1.4} />
        </mesh>
      ))}
    </group>
  );
}

/** Orbit: a glass pebble with an antenna and a little moon on a ring. */
function OrbitAgent({ color, bg }: AgentProps) {
  const ring = useRef<THREE.Group>(null);
  const bead = useRef<THREE.Mesh>(null);
  useFrame(({ clock }, d) => {
    if (ring.current) ring.current.rotation.z += d * 0.8;
    if (bead.current) bead.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 4) * 0.15);
  });
  return (
    <group>
      <mesh scale={[1.1, 0.92, 0.8]}>
        <sphereGeometry args={[1, 64, 64]} />
        <Glass bg={bg} />
      </mesh>
      <mesh position={[0.15, 1.08, 0]} rotation={[0, 0, -0.25]}>
        <cylinderGeometry args={[0.025, 0.025, 0.4, 12]} />
        <Ink />
      </mesh>
      <mesh ref={bead} position={[0.21, 1.3, 0]}>
        <sphereGeometry args={[0.09, 24, 24]} />
        <Glow color={color} />
      </mesh>
      <group rotation={[1.2, 0.3, 0]}>
        <group ref={ring}>
          <mesh>
            <torusGeometry args={[1.42, 0.022, 12, 96]} />
            <Ink />
          </mesh>
          <mesh position={[1.42, 0, 0]}>
            <sphereGeometry args={[0.1, 24, 24]} />
            <Glow color={color} />
          </mesh>
        </group>
      </group>
      <Face z={0.8} y={0.08} color={color} />
    </group>
  );
}

/** Facet: a hexagonal crystal with a pulsing core. */
function FacetAgent({ color, bg }: AgentProps) {
  const core = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => {
    const pts = [
      [0, -1.25],
      [0.72, -0.55],
      [0.78, 0.5],
      [0, 1.25],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const g = new THREE.LatheGeometry(pts, 6).toNonIndexed();
    g.computeVertexNormals();
    return g;
  }, []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (core.current) {
      core.current.scale.setScalar(1 + Math.sin(t * 2.2) * 0.12);
      core.current.rotation.set(t * 0.6, t * 0.9, 0);
    }
  });
  return (
    <group>
      <mesh geometry={geometry} rotation={[0, Math.PI / 6, 0]}>
        <Glass bg={bg} />
      </mesh>
      <mesh ref={core} position={[0, -0.3, -0.1]}>
        <octahedronGeometry args={[0.26, 0]} />
        <Glow color={color} intensity={2.6} />
      </mesh>
      <Face z={0.68} y={0.28} color={color} offset={1.4} />
    </group>
  );
}

/** Murmur: a speech bubble that is always mid-thought. */
function MurmurAgent({ color, bg }: AgentProps) {
  const dots = useRef<THREE.Group>(null);
  const geometry = useMemo(() => {
    const [w, h, r] = [2, 1.35, 0.4];
    const s = new THREE.Shape();
    s.moveTo(-w / 2 + r, -h / 2);
    s.lineTo(-w / 2 + 0.5, -h / 2);
    s.lineTo(-w / 2 + 0.18, -h / 2 - 0.45);
    s.lineTo(-w / 2 + 0.95, -h / 2);
    s.lineTo(w / 2 - r, -h / 2);
    s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    s.lineTo(w / 2, h / 2 - r);
    s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    s.lineTo(-w / 2 + r, h / 2);
    s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    s.lineTo(-w / 2, -h / 2 + r);
    s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.14, bevelSegments: 8, curveSegments: 24 });
    g.translate(0, 0, -0.25);
    return g;
  }, []);
  useFrame(({ clock }) => {
    dots.current?.children.forEach((c, i) => {
      c.position.y = -0.22 + Math.max(0, Math.sin(clock.elapsedTime * 5 - i * 0.9)) * 0.12;
    });
  });
  return (
    <group position={[0, 0.1, 0]}>
      <mesh geometry={geometry}>
        <Glass bg={bg} />
      </mesh>
      <group ref={dots}>
        {[-1, 0, 1].map((i) => (
          <mesh key={i} position={[i * 0.3, -0.22, 0]}>
            <sphereGeometry args={[0.09, 24, 24]} />
            <Glow color={color} />
          </mesh>
        ))}
      </group>
      <Face z={0.4} y={0.22} color={color} offset={2.6} />
    </group>
  );
}

/** Nimbus: a glass cloud that drips glowing raindrops. */
function NimbusAgent({ color, bg }: AgentProps) {
  const drops = useRef<THREE.Group>(null);
  const geometry = useMemo(() => {
    const puffs: [number, number, number][] = [
      [-0.62, -0.12, 0.5],
      [0, 0.22, 0.7],
      [0.62, -0.05, 0.52],
      [-0.2, -0.3, 0.5],
      [0.3, -0.32, 0.48],
    ];
    const g = mergeGeometries(puffs.map(([x, y, r]) => new THREE.SphereGeometry(r, 48, 48).translate(x, y, 0)))!;
    g.scale(1, 1, 0.7);
    return g;
  }, []);
  useFrame(({ clock }) => {
    drops.current?.children.forEach((c, i) => {
      const p = (clock.elapsedTime * 0.8 + i * 0.33) % 1;
      c.position.y = -0.35 - p * 0.95;
      c.scale.setScalar(Math.sin(p * Math.PI));
    });
  });
  return (
    <group position={[0, 0.2, 0]}>
      <mesh geometry={geometry}>
        <Glass bg={bg} />
      </mesh>
      <group ref={drops}>
        {[-0.4, 0.05, 0.45].map((x, i) => (
          <mesh key={i} position={[x, -0.4, 0]}>
            <capsuleGeometry args={[0.05, 0.1, 8, 16]} />
            <Glow color={color} />
          </mesh>
        ))}
      </group>
      <Face z={0.48} y={0.12} color={color} offset={0.7} />
    </group>
  );
}

/** Lumen: a glass lightbulb with a spark of an idea inside. */
function LumenAgent({ color, bg }: AgentProps) {
  const spark = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => {
    const pts = [
      [0, 1.05],
      [0.36, 1.0],
      [0.6, 0.85],
      [0.73, 0.55],
      [0.69, 0.18],
      [0.5, -0.16],
      [0.33, -0.42],
      [0.3, -0.56],
      [0, -0.56],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    return new THREE.LatheGeometry(pts.reverse(), 64);
  }, []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (spark.current) {
      spark.current.rotation.set(t * 1.2, t * 0.8, 0);
      spark.current.scale.setScalar(1 + Math.sin(t * 3) * 0.18);
    }
  });
  return (
    <group position={[0, 0.02, 0]}>
      <mesh geometry={geometry}>
        <Glass bg={bg} />
      </mesh>
      <mesh ref={spark} position={[0, 0.5, -0.1]}>
        <icosahedronGeometry args={[0.17, 0]} />
        <Glow color={color} intensity={2.8} />
      </mesh>
      <mesh position={[0, -0.72, 0]}>
        <cylinderGeometry args={[0.29, 0.25, 0.34, 32]} />
        <Ink />
      </mesh>
      {[-0.64, -0.76].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.29, 0.03, 12, 48]} />
          <Ink />
        </mesh>
      ))}
      <mesh position={[0, -0.92, 0]}>
        <sphereGeometry args={[0.11, 24, 24]} />
        <Ink />
      </mesh>
      <Face z={0.7} y={0.28} color={color} offset={3.1} />
    </group>
  );
}

/** Sentry: a glass shield with a spinning gyroscope core. */
function SentryAgent({ color, bg }: AgentProps) {
  const gyro = useRef<THREE.Group>(null);
  const geometry = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-0.85, 0.8);
    s.quadraticCurveTo(0, 1.08, 0.85, 0.8);
    s.lineTo(0.85, 0.1);
    s.quadraticCurveTo(0.8, -0.75, 0, -1.15);
    s.quadraticCurveTo(-0.8, -0.75, -0.85, 0.1);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.4, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.14, bevelSegments: 8, curveSegments: 32 });
    g.translate(0, 0, -0.2);
    return g;
  }, []);
  useFrame((_, d) => {
    const g = gyro.current;
    if (!g) return;
    g.children[0].rotation.y += d * 1.6;
    g.children[1].rotation.x += d * 1.2;
  });
  return (
    <group>
      <mesh geometry={geometry}>
        <Glass bg={bg} />
      </mesh>
      <group ref={gyro} position={[0, -0.32, 0]}>
        <mesh>
          <torusGeometry args={[0.28, 0.025, 12, 64]} />
          <Glow color={color} />
        </mesh>
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.2, 0.025, 12, 64]} />
          <Glow color={color} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.07, 24, 24]} />
          <Glow color={color} intensity={3} />
        </mesh>
      </group>
      <Face z={0.36} y={0.32} color={color} offset={1.9} />
    </group>
  );
}

const AGENTS = { orbit: OrbitAgent, facet: FacetAgent, murmur: MurmurAgent, nimbus: NimbusAgent, lumen: LumenAgent, sentry: SentryAgent };

function Reactive({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, d) => {
    const g = ref.current;
    if (!g) return;
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, mouse.x * 0.4, 4, d);
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, -mouse.y * 0.25, 4, d);
  });
  return <group ref={ref}>{children}</group>;
}

/** Abstract glossy shapes behind the glass so there is something to refract. */
function Backdrop({ color }: { color: string }) {
  const mat = <meshPhysicalMaterial color={color} roughness={0.2} clearcoat={1} clearcoatRoughness={0.05} />;
  return (
    <group position={[0, 0, -1]}>
      <mesh position={[0.95, 0.75, 0]}>
        <sphereGeometry args={[0.75, 48, 48]} />
        {mat}
      </mesh>
      <mesh position={[-1.05, -0.55, 0.2]}>
        <sphereGeometry args={[0.32, 32, 32]} />
        {mat}
      </mesh>
      <mesh position={[-0.6, 0.9, -0.3]} rotation={[0.4, 0.3, 0]}>
        <torusGeometry args={[0.38, 0.11, 24, 64]} />
        {mat}
      </mesh>
      <mesh position={[0.5, -0.95, -0.2]} rotation={[0, 0, 0.5]}>
        <capsuleGeometry args={[0.13, 0.7, 8, 24]} />
        <meshPhysicalMaterial color="#ffffff" roughness={0.15} clearcoat={1} />
      </mesh>
    </group>
  );
}

export type MascotSceneProps = {
  kinds: MascotKind[];
  backdrop?: boolean;
  paused?: boolean;
  still?: boolean;
  /** Soft floor shadow under the mascots. */
  shadow?: boolean;
  onReady?: () => void;
};

export default function MascotScene({ kinds, backdrop = false, paused = false, still = false, shadow = true, onReady }: MascotSceneProps) {
  const n = kinds.length;
  const tints = useMemo(() => kinds.map((k) => tintOf(MASCOTS[k].color)), [kinds]);
  const lead = MASCOTS[kinds[0]].color;
  return (
    <Canvas
      camera={{ position: [0, 0, 5.6 + (n - 1) * 2.8], fov: 35 }}
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true }}
      frameloop={paused ? "never" : still ? "demand" : "always"}
      onCreated={() => onReady?.()}
      style={{ background: "transparent" }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 4, 5]} intensity={1.2} />
      {/* Local studio lighting for glossy reflections (no HDR download). */}
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={4} position={[0, 5, 4]} rotation-x={Math.PI / 2} scale={[6, 2, 1]} />
        <Lightformer form="rect" intensity={3} position={[5, 1, 3]} rotation-y={-Math.PI / 2} scale={[2, 6, 1]} />
        <Lightformer form="circle" intensity={2} position={[-5, 0, 2]} rotation-y={Math.PI / 2} scale={3} />
        <Lightformer form="ring" color={lead} intensity={6} position={[0, -3, 5]} scale={4} />
      </Environment>
      {kinds.map((kind, i) => {
        const Agent = AGENTS[kind];
        const { color } = MASCOTS[kind];
        return (
          <group key={kind} position={[(i - (n - 1) / 2) * 2.75, 0, 0]}>
            {backdrop && <Backdrop color={color} />}
            <Float speed={still ? 0 : 2} rotationIntensity={still ? 0 : 0.25} floatIntensity={still ? 0 : 0.6}>
              <Reactive>
                <Agent color={color} bg={tints[i]} />
              </Reactive>
            </Float>
          </group>
        );
      })}
      {shadow && <ContactShadows position={[0, -1.6, 0]} opacity={0.3} scale={5 * n} blur={2.4} far={3} color={lead} />}
    </Canvas>
  );
}
