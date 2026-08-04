import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { useThree } from "../lib/threeLoader";
import { FiArrowDown, FiArrowLeft, FiArrowRight, FiArrowUp, FiArrowUpRight, FiCpu, FiGlobe, FiLayers, FiShield, FiZap } from "react-icons/fi";

const particles = Array.from({ length: 42 }, (_, index) => ({
  id: index,
  left: `${(index * 37) % 100}%`,
  top: `${(index * 61) % 100}%`,
  size: 2 + (index % 4),
  delay: (index % 9) * 0.35,
  duration: 7 + (index % 5),
}));

const signalCards = [
  { label: "Active Worlds", value: "128", icon: FiGlobe, accent: "from-cyan-300 to-blue-400" },
  { label: "Latency", value: "12ms", icon: FiZap, accent: "from-violet-300 to-fuchsia-400" },
  { label: "Identity Vault", value: "ZK", icon: FiShield, accent: "from-blue-300 to-indigo-400" },
];

const featurePanels = [
  {
    title: "Spatial Workflows",
    body: "Launch immersive rooms, dashboards, and live product surfaces from one connected interface.",
    icon: FiLayers,
  },
  {
    title: "Holographic Data",
    body: "Readable glass panels keep analytics, signals, and alerts visible without overwhelming the scene.",
    icon: FiCpu,
  },
  {
    title: "Neon Commerce",
    body: "A premium Web3-ready surface for drops, memberships, tokenized access, and community spaces.",
    icon: FiGlobe,
  },
];

const roomHotspots = {
  portal: {
    title: "Neon Portal",
    body: "A clickable world gate for onboarding, product tours, or spatial launch moments.",
  },
  crystal: {
    title: "Crystal Data Core",
    body: "A glowing artifact for stats, token state, AI memory, or premium feature reveals.",
  },
  console: {
    title: "Command Console",
    body: "A holographic control desk for actions, dashboards, and in-world navigation.",
  },
  satellite: {
    title: "Orbital Signal",
    body: "A floating beacon that can represent live users, rooms, or connected services.",
  },
};

const ThreeOrb = () => {
  const mountRef = useRef(null);
  const { THREE } = useThree();
  const [webglFailed, setWebglFailed] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !THREE || webglFailed) return undefined;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 5.5);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (error) {
      console.error("Failed to initialize metaverse orb WebGL renderer:", error);
      setWebglFailed(true);
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const orbGroup = new THREE.Group();
    scene.add(orbGroup);

    const sphere = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.28, 5),
      new THREE.MeshPhysicalMaterial({
        color: 0x4fd1ff,
        roughness: 0.18,
        metalness: 0.1,
        transmission: 0.25,
        transparent: true,
        opacity: 0.72,
        clearcoat: 1,
        clearcoatRoughness: 0.16,
        emissive: 0x1d4ed8,
        emissiveIntensity: 0.18,
      })
    );
    orbGroup.add(sphere);

    const wire = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.34, 2),
      new THREE.MeshBasicMaterial({
        color: 0x9d7cff,
        wireframe: true,
        transparent: true,
        opacity: 0.22,
      })
    );
    orbGroup.add(wire);

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
    });

    [0, 1, 2].forEach((index) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.75 + index * 0.26, 0.008, 10, 160), ringMaterial.clone());
      ring.rotation.x = Math.PI / 2 + index * 0.46;
      ring.rotation.y = index * 0.72;
      ring.material.opacity = 0.28 - index * 0.04;
      orbGroup.add(ring);
    });

    const particleGeometry = new THREE.BufferGeometry();
    const positions = [];
    for (let i = 0; i < 130; i += 1) {
      const radius = 2.1 + Math.random() * 1.3;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions.push(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.sin(phi) * Math.sin(theta),
        radius * Math.cos(phi)
      );
    }
    particleGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const pointCloud = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({
        color: 0x99f6e4,
        size: 0.018,
        transparent: true,
        opacity: 0.62,
      })
    );
    scene.add(pointCloud);

    scene.add(new THREE.AmbientLight(0x9bdcff, 1.2));
    const blueLight = new THREE.PointLight(0x38bdf8, 8, 8);
    blueLight.position.set(-2.8, 2.2, 2.8);
    scene.add(blueLight);
    const violetLight = new THREE.PointLight(0xa855f7, 7, 8);
    violetLight.position.set(3, -1.8, 2.2);
    scene.add(violetLight);

    const resize = () => {
      const width = mount.clientWidth || 420;
      const height = mount.clientHeight || 420;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    resize();
    window.addEventListener("resize", resize);

    let frameId;
    const clock = new THREE.Clock();

    const animate = () => {
      const elapsed = clock.getElapsedTime();
      orbGroup.rotation.y = elapsed * 0.22;
      orbGroup.rotation.x = Math.sin(elapsed * 0.34) * 0.16;
      sphere.scale.setScalar(1 + Math.sin(elapsed * 1.2) * 0.018);
      wire.rotation.y = -elapsed * 0.18;
      pointCloud.rotation.y = elapsed * 0.06;
      pointCloud.rotation.x = Math.sin(elapsed * 0.18) * 0.08;
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      particleGeometry.dispose();
      sphere.geometry.dispose();
      sphere.material.dispose();
      wire.geometry.dispose();
      wire.material.dispose();
      orbGroup.children.forEach((child) => {
        child.geometry?.dispose?.();
        child.material?.dispose?.();
      });
      renderer.dispose();
    };
  }, [THREE, webglFailed]);

  if (webglFailed) {
    return (
      <div className="relative flex h-full min-h-[300px] w-full items-center justify-center overflow-hidden rounded-[28px] border border-cyan-200/20 bg-slate-950/[0.55]" aria-label="Static metaverse orb preview">
        <div className="absolute h-56 w-56 rounded-full border border-cyan-200/30 bg-cyan-300/[0.12] shadow-[0_0_80px_rgba(34,211,238,0.24)]" />
        <div className="absolute h-72 w-72 rounded-full border border-violet-300/[0.24]" />
        <div className="absolute h-40 w-40 rounded-full border border-blue-300/[0.24]" />
        <div className="relative h-24 w-24 rounded-full bg-cyan-200/70 shadow-[0_0_48px_rgba(125,211,252,0.42)]" />
      </div>
    );
  }

  return <div ref={mountRef} className="h-full min-h-[300px] w-full" aria-label="Floating metaverse orb" />;
};

const ThreeRoom = () => {
  const mountRef = useRef(null);
  const { THREE } = useThree();
  const selectedRef = useRef("portal");
  const playerRef = useRef(null);
  const keysRef = useRef({});
  const interactiveRef = useRef([]);
  const hoverRef = useRef(null);
  const [selectedKey, setSelectedKey] = useState("portal");
  const [webglFailed, setWebglFailed] = useState(false);

  const selectObject = (key) => {
    selectedRef.current = key;
    setSelectedKey(key);
  };

  const nudge = (axis, amount) => {
    if (!THREE || !playerRef.current) return;
    if (axis === "x") playerRef.current.x = THREE.MathUtils.clamp(playerRef.current.x + amount, -4.6, 4.6);
    if (axis === "z") playerRef.current.z = THREE.MathUtils.clamp(playerRef.current.z + amount, -1.8, 5.2);
  };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !THREE || webglFailed) return undefined;

    interactiveRef.current = [];
    hoverRef.current = null;
    playerRef.current = new THREE.Vector3(0, 0, 4.2);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x070b1f, 0.035);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (error) {
      console.error("Failed to initialize metaverse room WebGL renderer:", error);
      setWebglFailed(true);
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const room = new THREE.Group();
    scene.add(room);

    const cyanMaterial = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0891b2,
      emissiveIntensity: 0.5,
      roughness: 0.28,
      metalness: 0.22,
      transparent: true,
      opacity: 0.78,
    });
    const violetMaterial = new THREE.MeshStandardMaterial({
      color: 0xa855f7,
      emissive: 0x7e22ce,
      emissiveIntensity: 0.42,
      roughness: 0.32,
      metalness: 0.2,
      transparent: true,
      opacity: 0.74,
    });
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x93c5fd,
      emissive: 0x2563eb,
      emissiveIntensity: 0.35,
      roughness: 0.12,
      metalness: 0.05,
      transmission: 0.2,
      clearcoat: 1,
      transparent: true,
      opacity: 0.62,
    });

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(11, 9),
      new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.45,
        metalness: 0.18,
        transparent: true,
        opacity: 0.88,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = 1.8;
    room.add(floor);

    const grid = new THREE.GridHelper(11, 22, 0x22d3ee, 0x4338ca);
    grid.position.y = 0.012;
    grid.position.z = 1.8;
    grid.material.transparent = true;
    grid.material.opacity = 0.34;
    room.add(grid);

    const backWall = new THREE.Mesh(
      new THREE.PlaneGeometry(11, 5),
      new THREE.MeshBasicMaterial({ color: 0x111827, transparent: true, opacity: 0.34, side: THREE.DoubleSide })
    );
    backWall.position.set(0, 2.5, -2.7);
    room.add(backWall);

    const wallGrid = new THREE.GridHelper(11, 18, 0x7dd3fc, 0x6d28d9);
    wallGrid.rotation.x = Math.PI / 2;
    wallGrid.position.set(0, 2.5, -2.68);
    wallGrid.material.transparent = true;
    wallGrid.material.opacity = 0.16;
    room.add(wallGrid);

    const addHotspot = (key, mesh) => {
      mesh.userData.hotspotKey = key;
      mesh.userData.baseScale = mesh.scale.clone();
      interactiveRef.current.push(mesh);
      room.add(mesh);
      return mesh;
    };

    const portal = addHotspot("portal", new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.05, 18, 120), cyanMaterial.clone()));
    portal.position.set(-2.9, 1.65, -2.42);
    portal.rotation.y = 0.15;

    const portalCore = new THREE.Mesh(
      new THREE.CircleGeometry(0.92, 64),
      new THREE.MeshBasicMaterial({ color: 0x164e63, transparent: true, opacity: 0.22, side: THREE.DoubleSide })
    );
    portalCore.position.copy(portal.position);
    portalCore.rotation.copy(portal.rotation);
    room.add(portalCore);

    const crystal = addHotspot("crystal", new THREE.Mesh(new THREE.OctahedronGeometry(0.72, 0), glassMaterial.clone()));
    crystal.position.set(2.65, 1.15, -1.9);
    crystal.rotation.z = 0.24;

    const consoleBase = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.32, 0.92), violetMaterial.clone());
    consoleBase.position.set(0, 0.42, 0.4);
    room.add(consoleBase);
    const consoleScreen = addHotspot("console", new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.78, 0.04), cyanMaterial.clone()));
    consoleScreen.position.set(0, 1, 0.02);
    consoleScreen.rotation.x = -0.45;

    const satellite = addHotspot("satellite", new THREE.Mesh(new THREE.IcosahedronGeometry(0.46, 2), violetMaterial.clone()));
    satellite.position.set(2.2, 2.55, 1.35);

    const avatar = new THREE.Group();
    const avatarRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.018, 8, 64),
      new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.75 })
    );
    avatarRing.rotation.x = Math.PI / 2;
    avatar.add(avatarRing);
    const avatarDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 18, 18),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    avatarDot.position.y = 0.08;
    avatar.add(avatarDot);
    room.add(avatar);

    const lightStripMaterial = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.48 });
    [-4.8, 4.8].forEach((x) => {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 8), lightStripMaterial.clone());
      strip.position.set(x, 0.04, 1.7);
      room.add(strip);
    });

    scene.add(new THREE.AmbientLight(0x9bdcff, 0.9));
    const portalLight = new THREE.PointLight(0x22d3ee, 7, 7);
    portalLight.position.set(-2.9, 1.7, -1.9);
    scene.add(portalLight);
    const violetLight = new THREE.PointLight(0xa855f7, 7, 7);
    violetLight.position.set(2.8, 2.4, 0.2);
    scene.add(violetLight);

    const resize = () => {
      const width = mount.clientWidth || 800;
      const height = mount.clientHeight || 480;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const setPointer = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const findHit = () => {
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(interactiveRef.current, false)[0]?.object || null;
    };

    const handlePointerMove = (event) => {
      setPointer(event);
      const hit = findHit();
      hoverRef.current = hit;
      renderer.domElement.style.cursor = hit ? "pointer" : "grab";
    };

    const handlePointerDown = (event) => {
      setPointer(event);
      const hit = findHit();
      if (hit?.userData.hotspotKey) selectObject(hit.userData.hotspotKey);
      renderer.domElement.focus();
    };

    const handleKeyDown = (event) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d"].includes(event.key)) {
        event.preventDefault();
        keysRef.current[event.key] = true;
      }
    };

    const handleKeyUp = (event) => {
      keysRef.current[event.key] = false;
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.tabIndex = 0;

    let frameId;
    const clock = new THREE.Clock();
    let elapsed = 0;

    const animate = () => {
      const delta = Math.min(clock.getDelta(), 0.04);
      elapsed += delta;
      const speed = 2.2 * delta;
      const keys = keysRef.current;

      if (keys.ArrowLeft || keys.a) playerRef.current.x -= speed;
      if (keys.ArrowRight || keys.d) playerRef.current.x += speed;
      if (keys.ArrowUp || keys.w) playerRef.current.z -= speed;
      if (keys.ArrowDown || keys.s) playerRef.current.z += speed;
      playerRef.current.x = THREE.MathUtils.clamp(playerRef.current.x, -4.6, 4.6);
      playerRef.current.z = THREE.MathUtils.clamp(playerRef.current.z, -1.8, 5.2);

      avatar.position.set(playerRef.current.x, 0.08, playerRef.current.z);
      avatar.rotation.z = elapsed * 0.8;

      camera.position.x += (playerRef.current.x * 0.34 - camera.position.x) * 0.07;
      camera.position.y += (2.6 - camera.position.y) * 0.06;
      camera.position.z += (playerRef.current.z + 5.6 - camera.position.z) * 0.07;
      camera.lookAt(playerRef.current.x * 0.2, 1.08, -1.25);

      portal.rotation.z = elapsed * 0.28;
      portalCore.scale.setScalar(1 + Math.sin(elapsed * 2.2) * 0.06);
      crystal.rotation.y = elapsed * 0.55;
      crystal.position.y = 1.15 + Math.sin(elapsed * 1.4) * 0.12;
      satellite.rotation.y = elapsed * 0.65;
      satellite.position.y = 2.55 + Math.sin(elapsed * 1.7) * 0.1;
      consoleScreen.material.opacity = 0.62 + Math.sin(elapsed * 3) * 0.08;
      grid.position.z = 1.8 + (elapsed * 0.22) % 0.5;

      interactiveRef.current.forEach((mesh) => {
        const selected = mesh.userData.hotspotKey === selectedRef.current;
        const hovered = mesh === hoverRef.current;
        const target = selected ? 1.17 : hovered ? 1.08 : 1;
        mesh.scale.lerp(mesh.userData.baseScale.clone().multiplyScalar(target), 0.12);
        mesh.material.emissiveIntensity = selected ? 0.9 : hovered ? 0.72 : 0.45;
      });

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      scene.traverse((object) => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
        else object.material?.dispose?.();
      });
      renderer.dispose();
    };
  }, [THREE, webglFailed]);

  const selected = roomHotspots[selectedKey] || roomHotspots.portal;

  return (
    <div className="relative overflow-hidden rounded-[34px] border border-white/12 bg-slate-950/68 shadow-2xl shadow-slate-950/40 backdrop-blur-2xl">
      <div className="absolute inset-x-0 top-0 z-10 flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div className="max-w-sm rounded-2xl border border-cyan-200/18 bg-slate-950/60 p-4 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-200">Interactive 3D Room</p>
          <h3 className="mt-2 text-xl font-black text-white">{selected.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">{selected.body}</p>
        </div>
        <div className="rounded-2xl border border-white/12 bg-white/[0.07] p-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-300 backdrop-blur-xl">
          Arrow keys move. Click objects.
        </div>
      </div>

      {webglFailed ? (
        <div className="grid min-h-[520px] w-full content-end gap-3 bg-[radial-gradient(circle_at_50%_30%,rgba(34,211,238,0.18),transparent_35%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] p-5 pt-44" aria-label="Static metaverse room preview">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(roomHotspots).map(([key, hotspot]) => (
              <button
                key={key}
                type="button"
                onClick={() => selectObject(key)}
                className={`rounded-2xl border p-4 text-left backdrop-blur-xl transition ${
                  selectedKey === key
                    ? "border-cyan-200/60 bg-cyan-300/15 text-white"
                    : "border-white/12 bg-white/[0.07] text-slate-200 hover:border-cyan-200/40"
                }`}
              >
                <span className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200">{key}</span>
                <strong className="mt-2 block text-sm font-black">{hotspot.title}</strong>
                <small className="mt-1 block text-xs font-semibold leading-5 text-slate-300">{hotspot.body}</small>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div ref={mountRef} className="h-[520px] w-full outline-none" aria-label="Interactive clickable 3D metaverse room" />
      )}

      {!webglFailed ? <div className="absolute bottom-4 left-4 z-10 grid grid-cols-3 gap-2 sm:hidden">
        <span />
        <button type="button" onClick={() => nudge("z", -0.38)} className="rounded-xl border border-white/12 bg-white/10 p-3 text-cyan-100 backdrop-blur-xl">
          <FiArrowUp />
        </button>
        <span />
        <button type="button" onClick={() => nudge("x", -0.38)} className="rounded-xl border border-white/12 bg-white/10 p-3 text-cyan-100 backdrop-blur-xl">
          <FiArrowLeft />
        </button>
        <button type="button" onClick={() => nudge("z", 0.38)} className="rounded-xl border border-white/12 bg-white/10 p-3 text-cyan-100 backdrop-blur-xl">
          <FiArrowDown />
        </button>
        <button type="button" onClick={() => nudge("x", 0.38)} className="rounded-xl border border-white/12 bg-white/10 p-3 text-cyan-100 backdrop-blur-xl">
          <FiArrowRight />
        </button>
      </div> : null}
    </div>
  );
};

const MetaverseLanding = () => {
  const { scrollYProgress } = useScroll();
  const orbY = useTransform(scrollYProgress, [0, 1], [0, -90]);
  const gridY = useTransform(scrollYProgress, [0, 1], [0, 80]);
  const panelY = useTransform(scrollYProgress, [0, 1], [0, -50]);
  const roomY = useTransform(scrollYProgress, [0.22, 0.88], [70, -45]);
  const roomRotate = useTransform(scrollYProgress, [0.22, 0.88], [3, -1.5]);
  const year = useMemo(() => new Date().getFullYear(), []);

  useEffect(() => {
    const scrollToHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (!hash) return;

      const target = document.getElementById(hash);
      if (target) requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
    };

    const timeout = window.setTimeout(scrollToHash, 120);
    window.addEventListener("hashchange", scrollToHash);

    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("hashchange", scrollToHash);
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden rounded-[32px] bg-slate-950 text-white shadow-2xl shadow-slate-950/40">
      <style>{`
        @keyframes metaverse-grid {
          from { background-position: 0 0; }
          to { background-position: 0 64px; }
        }
        @keyframes metaverse-scan {
          0%, 100% { transform: translateY(-100%); opacity: 0; }
          45%, 55% { opacity: 0.8; }
          100% { transform: translateY(420%); }
        }
      `}</style>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(14,165,233,0.24),transparent_28%),radial-gradient(circle_at_82%_18%,rgba(168,85,247,0.25),transparent_30%),linear-gradient(135deg,#020617_0%,#0f172a_42%,#111827_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(125,211,252,0.8)_1px,transparent_1px),linear-gradient(90deg,rgba(168,85,247,0.8)_1px,transparent_1px)] [background-size:72px_72px]" />

      {particles.map((particle) => (
        <motion.span
          key={particle.id}
          className="pointer-events-none absolute rounded-full bg-cyan-200 shadow-[0_0_18px_rgba(125,211,252,0.72)]"
          style={{ left: particle.left, top: particle.top, width: particle.size, height: particle.size }}
          animate={{ opacity: [0.12, 0.75, 0.12], y: [-10, 18, -10], scale: [1, 1.7, 1] }}
          transition={{ duration: particle.duration, delay: particle.delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}

      <motion.div
        className="pointer-events-none absolute inset-x-[-20%] bottom-[-12%] h-[48vh] origin-bottom"
        style={{ y: gridY, transform: "perspective(760px) rotateX(62deg)" }}
      >
        <div className="h-full w-full border-t border-cyan-300/25 bg-[linear-gradient(rgba(34,211,238,0.22)_1px,transparent_1px),linear-gradient(90deg,rgba(168,85,247,0.18)_1px,transparent_1px)] bg-[size:64px_64px] shadow-[0_-36px_120px_rgba(14,165,233,0.24)] [animation:metaverse-grid_4.8s_linear_infinite]" />
      </motion.div>

      <section className="relative z-10 grid min-h-[calc(100vh-5rem)] gap-6 px-4 py-6 sm:gap-8 sm:px-8 sm:py-8 lg:grid-cols-[1fr_1.05fr_1fr] lg:items-center lg:px-10 xl:px-14">
        <motion.div
          initial={{ opacity: 0, x: -28 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-20 pt-8 lg:pt-0"
        >
          <div className="inline-flex rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.28em] text-cyan-100 shadow-[0_0_30px_rgba(34,211,238,0.18)] backdrop-blur-xl">
            Nexusverse {year}
          </div>
          <h1 className="mt-6 max-w-xl text-[clamp(2.6rem,13vw,5rem)] font-black leading-[0.98] tracking-tight text-white drop-shadow-[0_0_28px_rgba(125,211,252,0.28)] sm:text-6xl xl:text-7xl">
            Build inside the spatial internet.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-8 text-slate-300 sm:text-lg">
            A premium metaverse landing surface with live neon depth, glass panels, and a production-ready Three.js focal object.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#room"
              className="group inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 shadow-[0_0_34px_rgba(34,211,238,0.34)] transition hover:-translate-y-1 hover:bg-white sm:w-auto"
            >
              Enter Room <FiArrowUpRight className="transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
            <a
              href="#signals"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-white/14 bg-white/8 px-5 py-3 text-sm font-bold text-white shadow-2xl shadow-slate-950/20 backdrop-blur-xl transition hover:-translate-y-1 hover:border-violet-200/40 hover:bg-white/12 sm:w-auto"
            >
              Explore Signals
            </a>
          </div>
        </motion.div>

        <motion.div
          className="relative z-10 mx-auto flex aspect-square w-full max-w-[520px] items-center justify-center"
          style={{ y: orbY }}
          initial={{ opacity: 0, scale: 0.88 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="absolute inset-8 rounded-full bg-cyan-300/12 blur-3xl" />
          <div className="absolute inset-16 rounded-full bg-violet-500/18 blur-2xl" />
          <div className="relative h-full w-full">
            <ThreeOrb />
          </div>
          <div className="pointer-events-none absolute inset-7 rounded-full border border-cyan-200/20 shadow-[inset_0_0_48px_rgba(125,211,252,0.16),0_0_52px_rgba(168,85,247,0.12)]" />
        </motion.div>

        <motion.div
          className="relative z-20 grid gap-4 pb-8 lg:pb-0"
          style={{ y: panelY }}
          initial={{ opacity: 0, x: 28 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1], delay: 0.12 }}
        >
          {signalCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.label}
                className="group relative overflow-hidden rounded-[24px] border border-white/14 bg-white/[0.08] p-4 shadow-2xl shadow-slate-950/20 backdrop-blur-2xl transition hover:-translate-y-1 hover:border-cyan-200/35 hover:bg-white/[0.11]"
                animate={{ y: [0, index % 2 ? 8 : -8, 0] }}
                transition={{ duration: 6 + index, repeat: Infinity, ease: "easeInOut" }}
              >
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/80 to-transparent" />
                <div className="absolute left-0 top-0 h-full w-px bg-gradient-to-b from-transparent via-violet-200/40 to-transparent" />
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">{card.label}</p>
                    <p className="mt-2 text-3xl font-black text-white drop-shadow-[0_0_18px_rgba(125,211,252,0.24)]">{card.value}</p>
                  </div>
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${card.accent} text-slate-950 shadow-[0_0_28px_rgba(125,211,252,0.24)] transition group-hover:rotate-6 group-hover:scale-105`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </section>

      <section id="room" className="relative z-10 scroll-mt-28 px-5 pb-10 sm:scroll-mt-24 sm:px-8 lg:px-10 xl:px-14">
        <motion.div
          style={{ y: roomY, rotateX: roomRotate, transformPerspective: 1200 }}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.22 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-cyan-200">Move Through The Interface</p>
              <h2 className="mt-2 max-w-3xl text-3xl font-black text-white drop-shadow-[0_0_24px_rgba(125,211,252,0.22)] sm:text-4xl">
                A clickable 3D room where the UI becomes the world.
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-slate-400">
              Use arrow keys to move the room camera, hover over objects, and click the portal, crystal, console, or orbital signal.
            </p>
          </div>
          <ThreeRoom />
        </motion.div>
      </section>

      <section id="signals" className="relative z-10 px-5 pb-10 sm:px-8 lg:px-10 xl:px-14">
        <div className="grid gap-4 lg:grid-cols-3">
          {featurePanels.map((panel, index) => {
            const Icon = panel.icon;
            return (
              <motion.article
                key={panel.title}
                className="group relative overflow-hidden rounded-[28px] border border-white/12 bg-white/[0.075] p-5 shadow-2xl shadow-slate-950/20 backdrop-blur-2xl transition hover:-translate-y-1 hover:border-cyan-200/30 hover:bg-white/[0.1]"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.5, delay: index * 0.08 }}
              >
                <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />
                <div className="absolute left-0 top-0 h-28 w-full bg-gradient-to-b from-cyan-300/10 to-transparent opacity-0 transition group-hover:opacity-100" />
                <div className="relative flex items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-200/20 bg-cyan-200/10 text-cyan-100 shadow-[0_0_28px_rgba(34,211,238,0.16)]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-lg font-black text-white">{panel.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{panel.body}</p>
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>
      </section>

      <section id="access" className="relative z-10 px-5 pb-8 sm:px-8 lg:px-10 xl:px-14">
        <div className="relative overflow-hidden rounded-[30px] border border-white/12 bg-white/[0.07] p-5 shadow-2xl shadow-slate-950/30 backdrop-blur-2xl sm:p-7">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/70 to-transparent" />
          <div className="absolute left-0 top-0 h-20 w-full bg-cyan-300/10 [animation:metaverse-scan_5s_ease-in-out_infinite]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-violet-200">Holographic Access Layer</p>
              <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">Designed for premium product launches, worlds, and dashboards.</h2>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              {["Glass", "Neon", "3D"].map((item) => (
                <div key={item} className="rounded-2xl border border-white/12 bg-slate-950/35 px-4 py-3 text-sm font-black text-cyan-100 shadow-inner shadow-white/5">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default MetaverseLanding;
