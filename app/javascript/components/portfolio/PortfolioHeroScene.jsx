import React, { useEffect, useRef, useState } from "react";

const PARTICLE_COUNT = 440;
const MAX_PIXEL_RATIO = 1.5;

const canAnimateScene = () => {
  if (typeof window === "undefined" || !window.WebGLRenderingContext) return false;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const compactScreen = window.matchMedia("(max-width: 767px)").matches;
  const lowMemory = navigator.deviceMemory && navigator.deviceMemory <= 4;
  const fewCores = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4;

  return !reducedMotion && !coarsePointer && !compactScreen && !lowMemory && !fewCores;
};

const PortfolioHeroScene = ({ fallback }) => {
  const hostRef = useRef(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(canAnimateScene());
  }, []);

  useEffect(() => {
    if (!enabled || !hostRef.current) return undefined;

    let disposed = false;
    let frameId;
    let observer;
    let resizeObserver;
    let visible = true;
    let renderer;
    let geometry;
    let material;
    let scene;
    const pointer = { x: 0, y: 0 };
    const targetPointer = { x: 0, y: 0 };
    const host = hostRef.current;

    const onPointerMove = (event) => {
      const rect = host.getBoundingClientRect();
      targetPointer.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      targetPointer.y = ((event.clientY - rect.top) / rect.height - 0.5) * -2;
    };

    const onContextLost = (event) => {
      event.preventDefault();
      visible = false;
    };

    const initialise = async () => {
      try {
        const THREE = await import("three");
        if (disposed) return;

        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "low-power" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
        renderer.setClearColor(0x000000, 0);
        renderer.domElement.className = "pointer-events-none absolute inset-0 h-full w-full";
        renderer.domElement.setAttribute("aria-hidden", "true");
        host.prepend(renderer.domElement);

        scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 30);
        camera.position.set(0, 0, 5);

        const offsets = new Float32Array(PARTICLE_COUNT * 3);
        const phases = new Float32Array(PARTICLE_COUNT);
        for (let index = 0; index < PARTICLE_COUNT; index += 1) {
          const offset = index * 3;
          offsets[offset] = (Math.random() - 0.5) * 6.4;
          offsets[offset + 1] = (Math.random() - 0.5) * 5.2;
          offsets[offset + 2] = (Math.random() - 0.5) * 2.4;
          phases[index] = Math.random() * Math.PI * 2;
        }

        geometry = new THREE.InstancedBufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
        geometry.setAttribute("instanceOffset", new THREE.InstancedBufferAttribute(offsets, 3));
        geometry.setAttribute("instancePhase", new THREE.InstancedBufferAttribute(phases, 1));
        geometry.instanceCount = PARTICLE_COUNT;

        material = new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          uniforms: {
            uTime: { value: 0 },
            uPointer: { value: new THREE.Vector2() },
            uScroll: { value: 0 },
          },
          vertexShader: `
            attribute vec3 instanceOffset;
            attribute float instancePhase;
            uniform float uTime;
            uniform vec2 uPointer;
            uniform float uScroll;
            varying float vAlpha;
            void main() {
              vec3 point = instanceOffset;
              point.y += sin(uTime * 0.45 + instancePhase + point.x) * 0.16;
              point.x += uPointer.x * (0.11 + point.z * 0.025);
              point.y += uPointer.y * 0.09 - uScroll * 0.32;
              vec4 viewPosition = modelViewMatrix * vec4(point, 1.0);
              gl_Position = projectionMatrix * viewPosition;
              gl_PointSize = (2.2 + sin(instancePhase + uTime) * 0.9) * (10.0 / -viewPosition.z);
              vAlpha = 0.28 + 0.45 * sin(instancePhase * 1.7 + uTime * 0.25);
            }
          `,
          fragmentShader: `
            varying float vAlpha;
            void main() {
              float softEdge = 1.0 - smoothstep(0.08, 0.5, length(gl_PointCoord - 0.5));
              gl_FragColor = vec4(0.25, 0.9, 1.0, softEdge * max(vAlpha, 0.12));
            }
          `,
        });
        scene.add(new THREE.Points(geometry, material));

        const resize = () => {
          const { width, height } = host.getBoundingClientRect();
          if (!width || !height || !renderer) return;
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height, false);
        };
        resize();
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);
        observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { threshold: 0.05 });
        observer.observe(host);
        host.addEventListener("pointermove", onPointerMove, { passive: true });
        renderer.domElement.addEventListener("webglcontextlost", onContextLost, false);

        const render = (time) => {
          if (disposed) return;
          frameId = window.requestAnimationFrame(render);
          if (!visible || document.hidden) return;
          pointer.x += (targetPointer.x - pointer.x) * 0.035;
          pointer.y += (targetPointer.y - pointer.y) * 0.035;
          const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
          material.uniforms.uTime.value = time * 0.001;
          material.uniforms.uPointer.value.set(pointer.x, pointer.y);
          material.uniforms.uScroll.value = window.scrollY / maxScroll;
          camera.position.x += (pointer.x * 0.18 - camera.position.x) * 0.025;
          camera.position.y += (pointer.y * 0.12 - camera.position.y) * 0.025;
          camera.lookAt(0, 0, 0);
          renderer.render(scene, camera);
        };
        frameId = window.requestAnimationFrame(render);
      } catch {
        if (!disposed) setEnabled(false);
      }
    };

    initialise();
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      observer?.disconnect();
      resizeObserver?.disconnect();
      host.removeEventListener("pointermove", onPointerMove);
      renderer?.domElement.removeEventListener("webglcontextlost", onContextLost);
      scene?.traverse((object) => {
        object.geometry?.dispose();
        if (Array.isArray(object.material)) object.material.forEach((item) => item.dispose());
        else object.material?.dispose();
      });
      geometry?.dispose();
      material?.dispose();
      renderer?.renderLists.dispose();
      renderer?.dispose();
      renderer?.forceContextLoss();
      renderer?.domElement.remove();
    };
  }, [enabled]);

  if (!enabled) return fallback;

  return (
    <div ref={hostRef} className="relative mx-auto w-full max-w-[24rem] overflow-visible sm:max-w-md lg:max-w-lg">
      <div className="absolute -inset-8 rounded-[3rem] bg-cyan-400/10 blur-3xl" />
      <div className="relative z-10 opacity-95">{fallback}</div>
    </div>
  );
};

export default PortfolioHeroScene;
