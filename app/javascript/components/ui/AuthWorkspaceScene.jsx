import React, { useEffect, useRef, useState } from 'react';
import { loadThree } from '../../lib/threeLoader';
import fallbackImage from '../../images/nexus/auth-command-deck.webp';

export default function AuthWorkspaceScene() {
  const host = useRef(null);
  const [phase, setPhase] = useState('loading');
  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    loadThree().then((THREE) => {
      if (cancelled || !host.current) return;
      const container = host.current;
      let renderer;
      try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); }
      catch { setPhase('fallback'); return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.setAttribute('aria-label', 'Interactive 3D NexusHub workspace');
      container.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x899b98, 3));
      const light = new THREE.DirectionalLight(0xffffff, 4);
      light.position.set(-4, 7, 6); scene.add(light);
      const workspace = new THREE.Group(); scene.add(workspace);
      const resources = [];
      const box = (parent, size, position, color) => {
        const geometry = new THREE.BoxGeometry(...size);
        const material = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
        const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position); parent.add(mesh);
        resources.push(geometry, material); return mesh;
      };
      box(workspace, [6.7, 0.16, 4.2], [0, -0.35, 0], 0xd9e8e3);
      box(workspace, [4.3, 0.15, 2.5], [-0.3, -0.16, 0.5], 0x9aaeb0);
      box(workspace, [1.05, 0.015, 0.65], [-0.3, -0.075, 1.25], 0xc9d9d7);
      for (let row = 0; row < 3; row++) for (let col = 0; col < 10; col++) box(workspace, [0.28, 0.025, 0.2], [-1.88 + col * 0.35, -0.06, row * 0.29 - 0.35], 0x455858);
      const screen = box(workspace, [4.25, 2.55, 0.14], [-0.3, 1.08, -0.65], 0x233d3b);
      screen.rotation.x = -0.12;
      const bitmap = document.createElement('canvas'); bitmap.width = 960; bitmap.height = 560;
      const ctx = bitmap.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#fafcfb'; ctx.fillRect(0, 0, 960, 560);
        ctx.fillStyle = '#edf3f0'; ctx.fillRect(0, 0, 180, 560);
        ctx.fillStyle = '#123c34'; ctx.font = 'bold 30px sans-serif'; ctx.fillText('NexusHub', 25, 58);
        ctx.font = '21px sans-serif'; ['Overview', 'Projects', 'Conversations', 'Knowledge'].forEach((name, i) => ctx.fillText(name, 24, 135 + i * 55));
        ctx.fillStyle = '#203c36'; ctx.font = 'bold 32px sans-serif'; ctx.fillText('Today, in focus', 220, 70);
        ctx.fillStyle = '#64736e'; ctx.font = '20px sans-serif'; ctx.fillText('A good day starts with a clear plan.', 220, 108);
        ['Design review', 'Product launch', 'Team check-in'].forEach((name, i) => {
          ctx.fillStyle = ['#e2f1ec', '#edf0fa', '#fbece8'][i]; ctx.fillRect(218, 150 + i * 112, 696, 88);
          ctx.fillStyle = ['#14725c', '#4d63a6', '#bb644e'][i]; ctx.fillRect(242, 176 + i * 112, 25, 25);
          ctx.fillStyle = '#203c36'; ctx.font = '24px sans-serif'; ctx.fillText(name, 292, 198 + i * 112);
        });
      }
      const texture = new THREE.CanvasTexture(bitmap); texture.colorSpace = THREE.SRGBColorSpace;
      const faceGeometry = new THREE.PlaneGeometry(3.95, 2.3);
      const faceMaterial = new THREE.MeshBasicMaterial({ map: texture });
      const face = new THREE.Mesh(faceGeometry, faceMaterial); face.position.z = 0.076; screen.add(face);
      resources.push(texture, faceGeometry, faceMaterial);
      box(workspace, [1.05, 0.16, 1.5], [2.35, -0.18, 0.4], 0xd06e57);
      box(workspace, [1.08, 0.16, 1.5], [2.3, 0, 0.35], 0x376f67);
      box(workspace, [1, 0.06, 1.45], [2.3, 0.12, 0.35], 0xf3f7f3);
      const floating = new THREE.Group(); floating.position.set(2.7, 2.7, -1); floating.rotation.y = -0.25; workspace.add(floating);
      box(floating, [1.35, 0.9, 0.12], [0, 0, 0], 0x77b8a4);
      box(floating, [0.75, 0.07, 0.025], [0, 0.18, 0.08], 0xffffff);
      box(floating, [0.55, 0.07, 0.025], [-0.1, -0.03, 0.08], 0xd8eee6);
      const target = new THREE.Vector3(0, 0.9, 0);
      const resize = () => {
        const { width, height } = container.getBoundingClientRect();
        if (!width || !height) return;
        renderer.setSize(width, height); camera.aspect = width / height;
        const distance = 12.8 / Math.min(camera.aspect, 1.25);
        camera.position.set(distance * 0.62, distance * 0.43, distance * 0.75); camera.lookAt(target); camera.updateProjectionMatrix();
      };
      const observer = new ResizeObserver(resize); observer.observe(container); resize();
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
      let frame; let visible = true; let pointer = 0;
      const onPointer = (event) => { const rect = container.getBoundingClientRect(); pointer = (event.clientX - rect.left) / rect.width - 0.5; };
      const onLeave = () => { pointer = 0; };
      const onLost = (event) => { event.preventDefault(); setPhase('fallback'); };
      container.addEventListener('pointermove', onPointer); container.addEventListener('pointerleave', onLeave);
      renderer.domElement.addEventListener('webglcontextlost', onLost);
      const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }); intersection.observe(container);
      const animate = (time = 0) => {
        if (cancelled) return;
        if (visible && document.visibilityState !== 'hidden') {
          workspace.rotation.y += ((reduced.matches ? 0 : Math.sin(time / 3500) * 0.055 + pointer * 0.16) - workspace.rotation.y) * 0.04;
          floating.position.y = 2.7 + (reduced.matches ? 0 : Math.sin(time / 1700) * 0.12);
          renderer.render(scene, camera);
        }
        frame = requestAnimationFrame(animate);
      };
      animate(); setPhase('ready');
      cleanup = () => {
        cancelAnimationFrame(frame); observer.disconnect(); intersection.disconnect();
        container.removeEventListener('pointermove', onPointer); container.removeEventListener('pointerleave', onLeave);
        renderer.domElement.removeEventListener('webglcontextlost', onLost);
        resources.forEach((resource) => resource.dispose()); renderer.dispose(); renderer.domElement.remove();
      };
    }).catch(() => { if (!cancelled) setPhase('fallback'); });
    return () => { cancelled = true; cleanup(); };
  }, []);
  return <div className="auth-workspace-scene" ref={host} data-scene-state={phase}>{phase !== 'ready' && <img className="auth-scene-fallback" src={fallbackImage} alt="NexusHub connected workspace" />}</div>;
}
