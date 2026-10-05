import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiBell,
  FiBookmark,
  FiCheckCircle,
  FiChevronDown,
  FiChevronUp,
  FiFilter,
  FiMaximize2,
  FiSearch,
  FiX,
} from "react-icons/fi";
import { loadThree } from "../../lib/threeLoader";
import styles from "./Knowledge3DRoom.module.css";

const ROOM_WIDTH = 18;
const ROOM_DEPTH = 14;
const ROOM_HEIGHT = 8.6;
const PANEL_SCALE = 0.0094;
const INTERACTIVE_SELECTOR = "button, a, input, select, textarea, option, label, summary, [data-wall-interactive='true'], [contenteditable='true']";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const isTypingTarget = (target) =>
  target instanceof Element &&
  Boolean(target.closest("input, textarea, select, [contenteditable='true']"));

const isWallInteraction = (target) =>
  target instanceof Element && Boolean(target.closest(INTERACTIVE_SELECTOR));

const makeRoomTexture = (THREE, base, line, accent = "rgba(56, 189, 248, 0.28)") => {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const gradient = ctx.createLinearGradient(0, 0, 1024, 1024);
  gradient.addColorStop(0, base[0]);
  gradient.addColorStop(1, base[1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1024, 1024);

  const glow = ctx.createRadialGradient(210, 170, 20, 210, 170, 420);
  glow.addColorStop(0, "rgba(255,255,255,0.34)");
  glow.addColorStop(0.42, "rgba(255,255,255,0.1)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1024, 1024);

  const accentGlow = ctx.createRadialGradient(820, 760, 10, 820, 760, 410);
  accentGlow.addColorStop(0, accent);
  accentGlow.addColorStop(0.44, "rgba(255,255,255,0.08)");
  accentGlow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = accentGlow;
  ctx.fillRect(0, 0, 1024, 1024);

  ctx.strokeStyle = line;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.16;
  for (let i = 0; i <= 1024; i += 128) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 1024);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(1024, i);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.34;
  for (let i = 0; i < 7; i += 1) {
    const x = 72 + i * 140;
    ctx.beginPath();
    ctx.moveTo(x, 886);
    ctx.lineTo(x + 64, 824);
    ctx.lineTo(x + 128, 824);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
};

function WallPanel({ title, eyebrow, subtitle, cards, emptyText, children, renderCard }) {
  return (
    <section className={styles.wallPanelInner} data-wall-interactive="true">
      <header className={styles.wallHeader}>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </header>
      {children || (
        <div className={styles.cardScroller} data-wall-scroll="true">
          {cards.length ? cards.map(renderCard) : <div className={styles.emptyWall}>{emptyText}</div>}
        </div>
      )}
    </section>
  );
}

function PromptHistoryList({ promptRuns }) {
  return (
    <div className={styles.promptList} data-wall-scroll="true">
      {promptRuns.length ? (
        promptRuns.slice(0, 12).map((run) => (
          <article key={run.id} className={styles.promptRecord}>
            <div>
              <span>{run.generation_mode || "history"}</span>
              <strong>{run.prompt}</strong>
            </div>
            <small>{run.item_count || 0} cards</small>
          </article>
        ))
      ) : (
        <div className={styles.emptyWall}>
          MCP prompt history will appear here after ChatGPT creates knowledge items.
        </div>
      )}
    </div>
  );
}

function FallbackKnowledgeGrid({
  filteredCards,
  categories,
  activeCategory,
  setActiveCategory,
  searchQuery,
  setSearchQuery,
  filters,
  setFilters,
  renderCard,
}) {
  return (
    <div className={styles.fallbackShell}>
      <div className={styles.fallbackToolbar}>
        <div className={styles.searchBox}>
          <FiSearch />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search knowledge..."
          />
          {searchQuery ? (
            <button type="button" onClick={() => setSearchQuery("")} aria-label="Clear search">
              <FiX />
            </button>
          ) : null}
        </div>
        <div className={styles.fallbackCategories}>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setActiveCategory(category.id)}
              className={activeCategory === category.id ? styles.activePill : ""}
            >
              <span>{category.icon}</span>
              {category.name}
            </button>
          ))}
        </div>
        <div className={styles.fallbackFilters}>
          {[
            { key: "reminderDue", label: "Due", icon: FiBell },
            { key: "hasNotes", label: "Notes", icon: FiBookmark },
          ].map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setFilters((current) => ({ ...current, [option.key]: !current[option.key] }))}
                className={filters[option.key] ? styles.activePill : ""}
              >
                <Icon />
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
      <main className={styles.fallbackGrid}>
        {filteredCards.length ? (
          filteredCards.map((card, index) => renderCard(card, index, true))
        ) : (
          <div className={styles.emptyWall}>No knowledge cards match this view.</div>
        )}
      </main>
    </div>
  );
}

export default function Knowledge3DRoom({
  filteredCards,
  categories,
  activeCategory,
  setActiveCategory,
  searchQuery,
  setSearchQuery,
  filters,
  setFilters,
  isLoading,
  savedCount,
  dueCount,
  filteredCardsLength,
  promptRuns = [],
  knowledgeItems = [],
  generatedLoading,
  bookmarkHelpers,
  handleBookmarkToggle,
  SavedBookmarkFooter,
  feedback,
  setFeedback,
}) {
  const shellRef = useRef(null);
  const canvasRef = useRef(null);
  const [threeModules, setThreeModules] = useState(null);
  const [threeError, setThreeError] = useState(null);
  const [expandedCardId, setExpandedCardId] = useState(null);
  const [viewMode, setViewMode] = useState("overview");
  const [showFilters, setShowFilters] = useState(false);
  const [showCategories, setShowCategories] = useState(false);

  const wallHosts = useMemo(() => {
    if (typeof document === "undefined") return null;
    return {
      feed: document.createElement("section"),
      inbox: document.createElement("section"),
      review: document.createElement("section"),
      history: document.createElement("section"),
    };
  }, []);

  const feedCards = useMemo(
    () => filteredCards.filter((card) => !card.roomSection || card.roomSection === "feed"),
    [filteredCards]
  );
  const inboxCards = useMemo(
    () => filteredCards.filter((card) => card.roomSection === "inbox"),
    [filteredCards]
  );
  const reviewCards = useMemo(
    () => filteredCards.filter((card) => card.roomSection === "review" || card.bookmark),
    [filteredCards]
  );
  const historyCards = useMemo(
    () => filteredCards.filter((card) => card.roomSection === "history"),
    [filteredCards]
  );
  const expandedCard = filteredCards.find((card) => card.key === expandedCardId);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      loadThree(),
      import("three/examples/jsm/renderers/CSS3DRenderer.js"),
    ])
      .then(([THREE, css3d]) => {
        if (cancelled) return;
        setThreeModules({
          THREE,
          CSS3DObject: css3d.CSS3DObject,
          CSS3DRenderer: css3d.CSS3DRenderer,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to load Three.js knowledge room modules:", error);
        setThreeError(error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const shell = shellRef.current;
    const canvas = canvasRef.current;
    if (!shell || !canvas || !wallHosts || !threeModules || threeError) return undefined;

    const { THREE, CSS3DObject, CSS3DRenderer } = threeModules;

    let renderer;
    let cssRenderer;
    let frameId;

    try {
      wallHosts.feed.className = `${styles.wallPanel} ${styles.feedWall}`;
      wallHosts.inbox.className = `${styles.wallPanel} ${styles.inboxWall}`;
      wallHosts.review.className = `${styles.wallPanel} ${styles.reviewWall}`;
      wallHosts.history.className = `${styles.wallPanel} ${styles.historyWall}`;

      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x09111f, 1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      cssRenderer = new CSS3DRenderer();
      cssRenderer.domElement.className = styles.cssLayer;
      shell.appendChild(cssRenderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xeaf1ff);
      scene.fog = new THREE.Fog(0xeaf1ff, 24, 48);
      const cssScene = new THREE.Scene();

      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 80);
      camera.position.set(0, 2.2, 3.2);
      camera.rotation.order = "YXZ";

      const ambient = new THREE.HemisphereLight(0xf0f7ff, 0xc2c9e0, 2.2);
      scene.add(ambient);
      const keyLight = new THREE.PointLight(0x7dd3fc, 2.4, 30);
      keyLight.position.set(0, 4.7, 1.6);
      scene.add(keyLight);
      const fillLight = new THREE.PointLight(0xa78bfa, 1.2, 24);
      fillLight.position.set(-5.5, 2.8, -1.2);
      scene.add(fillLight);

      const wallMaterial = (base, line, accent) =>
        new THREE.MeshStandardMaterial({
          map: makeRoomTexture(THREE, base, line, accent),
          roughness: 0.86,
          metalness: 0.02,
          side: THREE.FrontSide,
        });

      const addWall = (width, height, position, rotation, material) => {
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
        wall.position.set(position[0], position[1], position[2]);
        wall.rotation.set(rotation[0], rotation[1], rotation[2]);
        scene.add(wall);
        return wall;
      };

      addWall(
        ROOM_WIDTH,
        ROOM_HEIGHT,
        [0, 2.1, -ROOM_DEPTH / 2],
        [0, 0, 0],
        wallMaterial(["#f4f8ff", "#dce8fa"], "rgba(37, 99, 235, 0.2)", "rgba(34, 211, 238, 0.34)")
      );
      addWall(
        ROOM_WIDTH,
        ROOM_HEIGHT,
        [0, 2.1, ROOM_DEPTH / 2],
        [0, Math.PI, 0],
        wallMaterial(["#f5f3ff", "#e2dff5"], "rgba(79, 70, 229, 0.18)", "rgba(129, 140, 248, 0.32)")
      );
      addWall(
        ROOM_DEPTH,
        ROOM_HEIGHT,
        [-ROOM_WIDTH / 2, 2.1, 0],
        [0, Math.PI / 2, 0],
        wallMaterial(["#edfaf8", "#d5ecea"], "rgba(13, 148, 136, 0.2)", "rgba(20, 184, 166, 0.32)")
      );
      addWall(
        ROOM_DEPTH,
        ROOM_HEIGHT,
        [ROOM_WIDTH / 2, 2.1, 0],
        [0, -Math.PI / 2, 0],
        wallMaterial(["#f6f2ff", "#e4ddf6"], "rgba(99, 102, 241, 0.18)", "rgba(168, 85, 247, 0.28)")
      );

      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(ROOM_WIDTH, ROOM_DEPTH),
        new THREE.MeshStandardMaterial({
          map: makeRoomTexture(THREE, ["#e1e8f4", "#b8c8df"], "rgba(15, 23, 42, 0.2)", "rgba(14, 165, 233, 0.24)"),
          roughness: 0.82,
          metalness: 0.04,
          side: THREE.FrontSide,
        })
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -2.05;
      scene.add(floor);

      const ceiling = new THREE.Mesh(
        new THREE.PlaneGeometry(ROOM_WIDTH, ROOM_DEPTH),
        new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.82, metalness: 0.01, side: THREE.FrontSide })
      );
      ceiling.rotation.x = Math.PI / 2;
      ceiling.position.y = 6.4;
      scene.add(ceiling);

      const runway = new THREE.Mesh(
        new THREE.PlaneGeometry(3.6, ROOM_DEPTH - 1.2),
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.07,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      runway.rotation.x = -Math.PI / 2;
      runway.position.set(0, -2.035, 0);
      scene.add(runway);

      const addBand = (width, height, position, rotation, color, opacity) => {
        const band = new THREE.Mesh(
          new THREE.PlaneGeometry(width, height),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false })
        );
        band.position.set(position[0], position[1], position[2]);
        band.rotation.set(rotation[0], rotation[1], rotation[2]);
        scene.add(band);
      };

      addBand(ROOM_WIDTH - 1.2, 0.06, [0, 5.85, -ROOM_DEPTH / 2 + 0.045], [0, 0, 0], 0x22d3ee, 0.34);
      addBand(ROOM_WIDTH - 1.2, 0.06, [0, 5.85, ROOM_DEPTH / 2 - 0.045], [0, Math.PI, 0], 0x818cf8, 0.28);
      addBand(ROOM_DEPTH - 1.2, 0.055, [-ROOM_WIDTH / 2 + 0.045, 5.8, 0], [0, Math.PI / 2, 0], 0x14b8a6, 0.3);
      addBand(ROOM_DEPTH - 1.2, 0.055, [ROOM_WIDTH / 2 - 0.045, 5.8, 0], [0, -Math.PI / 2, 0], 0xa855f7, 0.28);

      [-5, -2.5, 0, 2.5, 5].forEach((x, index) => {
        const lightPanel = new THREE.Mesh(
          new THREE.PlaneGeometry(1.4, 0.42),
          new THREE.MeshBasicMaterial({
            color: index % 2 === 0 ? 0xe0f2fe : 0xede9fe,
            transparent: true,
            opacity: 0.24,
            side: THREE.DoubleSide,
            depthWrite: false,
          })
        );
        lightPanel.rotation.x = Math.PI / 2;
        lightPanel.position.set(x, 6.36, index % 2 === 0 ? -2 : 2);
        scene.add(lightPanel);
      });

      const addCssWall = (element, position, rotation, scale = PANEL_SCALE) => {
        const object = new CSS3DObject(element);
        object.position.set(position[0], position[1], position[2]);
        object.rotation.set(rotation[0], rotation[1], rotation[2]);
        object.scale.setScalar(scale);
        cssScene.add(object);
        return object;
      };

      const cssWallObjects = [
        {
          object: addCssWall(wallHosts.feed, [0, 2.2, -ROOM_DEPTH / 2 + 0.08], [0, 0, 0]),
          scale: PANEL_SCALE,
          mobileScale: 0.0087,
        },
        {
          object: addCssWall(wallHosts.inbox, [-ROOM_WIDTH / 2 + 0.08, 2.15, -0.55], [0, Math.PI / 2, 0], PANEL_SCALE),
          scale: PANEL_SCALE,
          mobileScale: 0.0081,
        },
        {
          object: addCssWall(wallHosts.review, [ROOM_WIDTH / 2 - 0.08, 2.15, -0.55], [0, -Math.PI / 2, 0], PANEL_SCALE),
          scale: PANEL_SCALE,
          mobileScale: 0.0081,
        },
        {
          object: addCssWall(wallHosts.history, [0, 2.2, ROOM_DEPTH / 2 - 0.08], [0, Math.PI, 0], PANEL_SCALE),
          scale: PANEL_SCALE,
          mobileScale: 0.0087,
        },
      ];

      const controls = {
        yaw: 0,
        pitch: 0,
        dragging: false,
        lastX: 0,
        lastY: 0,
      };

      const setCameraRotation = () => {
        camera.rotation.y = controls.yaw;
        camera.rotation.x = controls.pitch;
      };

      const moveCamera = (distance, strafe = 0) => {
        const forward = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
        forward.y = 0;
        forward.normalize();
        const right = new THREE.Vector3(1, 0, 0).applyEuler(camera.rotation);
        right.y = 0;
        right.normalize();
        camera.position.addScaledVector(forward, distance);
        camera.position.addScaledVector(right, strafe);
        camera.position.x = clamp(camera.position.x, -ROOM_WIDTH / 2 + 1.2, ROOM_WIDTH / 2 - 1.2);
        camera.position.z = clamp(camera.position.z, -ROOM_DEPTH / 2 + 1.2, ROOM_DEPTH / 2 - 1.2);
      };

      const resize = () => {
        const width = shell.clientWidth || window.innerWidth;
        const height = shell.clientHeight || window.innerHeight;
        const isMobile = width < 720;
        renderer.setSize(width, height, false);
        cssRenderer.setSize(width, height);
        camera.fov = isMobile ? 46 : 50;
        camera.aspect = width / Math.max(height, 1);
        if (isMobile) {
          camera.position.z = clamp(camera.position.z, -1.6, 3.7);
          camera.position.y = clamp(camera.position.y, 1.8, 2.2);
        } else {
          camera.position.z = clamp(camera.position.z, -ROOM_DEPTH / 2 + 1.2, ROOM_DEPTH / 2 - 1.2);
          camera.position.y = clamp(camera.position.y, 1.8, 2.2);
        }
        cssWallObjects.forEach((entry) => {
          // Keep a large, readable wall framed between the room toolbar and search controls.
          const distance = camera.position.z + ROOM_DEPTH / 2;
          const visibleHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
          const element = entry.object.element;
          const fitWidth = visibleHeight * camera.aspect * 0.86 / element.offsetWidth;
          const fitHeight = visibleHeight * 0.68 / element.offsetHeight;
          entry.object.scale.setScalar(Math.min(isMobile ? entry.mobileScale : entry.scale, fitWidth, fitHeight));
        });
        camera.updateProjectionMatrix();
      };

      const handlePointerDown = (event) => {
        if (isWallInteraction(event.target)) return;
        shell.focus({ preventScroll: true });
        controls.dragging = true;
        controls.lastX = event.clientX;
        controls.lastY = event.clientY;
        shell.setPointerCapture?.(event.pointerId);
      };

      const handlePointerMove = (event) => {
        if (!controls.dragging) return;
        const dx = event.clientX - controls.lastX;
        const dy = event.clientY - controls.lastY;
        controls.lastX = event.clientX;
        controls.lastY = event.clientY;
        controls.yaw += dx * 0.0035;
        controls.pitch = clamp(controls.pitch + dy * 0.0028, -0.5, 0.5);
        setCameraRotation();
      };

      const handlePointerUp = (event) => {
        controls.dragging = false;
        shell.releasePointerCapture?.(event.pointerId);
      };

      const handleWheel = (event) => {
        if (event.target instanceof Element && event.target.closest("[data-wall-scroll='true']")) return;
        event.preventDefault();
        if (Math.abs(event.deltaX) > 1) moveCamera(0, -event.deltaX * 0.008);
        if (Math.abs(event.deltaY) > 1) moveCamera(-event.deltaY * 0.008);
      };

      const handleKeyDown = (event) => {
        if (isTypingTarget(event.target)) return;
        const key = event.key.toLowerCase();
        let handled = true;
        if (key === "w") moveCamera(0.35);
        else if (key === "s") moveCamera(-0.35);
        else if (key === "a") moveCamera(0, -0.35);
        else if (key === "d") moveCamera(0, 0.35);
        else if (event.key === "ArrowLeft") controls.yaw += 0.11;
        else if (event.key === "ArrowRight") controls.yaw -= 0.11;
        else if (event.key === "ArrowUp") controls.pitch = clamp(controls.pitch + 0.08, -0.5, 0.5);
        else if (event.key === "ArrowDown") controls.pitch = clamp(controls.pitch - 0.08, -0.5, 0.5);
        else handled = false;

        if (handled) {
          event.preventDefault();
          setCameraRotation();
        }
      };

      const animate = () => {
        frameId = requestAnimationFrame(animate);
        const elapsed = performance.now() * 0.001;
        keyLight.intensity = 2.25 + Math.sin(elapsed * 0.82) * 0.12;
        renderer.render(scene, camera);
        cssRenderer.render(cssScene, camera);
      };

      resize();
      setCameraRotation();
      animate();

      shell.addEventListener("pointerdown", handlePointerDown);
      shell.addEventListener("pointermove", handlePointerMove);
      shell.addEventListener("pointerup", handlePointerUp);
      shell.addEventListener("pointercancel", handlePointerUp);
      shell.addEventListener("wheel", handleWheel, { passive: false });
      window.addEventListener("resize", resize);
      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(shell);
      window.addEventListener("keydown", handleKeyDown);

      return () => {
        cancelAnimationFrame(frameId);
        shell.removeEventListener("pointerdown", handlePointerDown);
        shell.removeEventListener("pointermove", handlePointerMove);
        shell.removeEventListener("pointerup", handlePointerUp);
        shell.removeEventListener("pointercancel", handlePointerUp);
        shell.removeEventListener("wheel", handleWheel);
        window.removeEventListener("resize", resize);
        resizeObserver.disconnect();
        window.removeEventListener("keydown", handleKeyDown);
        cssRenderer.domElement.remove();
        const disposedMaterials = new Set();
        const disposedGeometries = new Set();
        scene.traverse((object) => {
          if (object.material) {
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => {
              if (disposedMaterials.has(material)) return;
              disposedMaterials.add(material);
              material.map?.dispose();
              material.dispose();
            });
          }
          if (object.geometry && !disposedGeometries.has(object.geometry)) {
            disposedGeometries.add(object.geometry);
            object.geometry.dispose();
          }
        });
        renderer.dispose();
      };
    } catch (error) {
      console.error("Failed to initialize Three.js knowledge room:", error);
      setThreeError(error);
      cssRenderer?.domElement?.remove();
      renderer?.dispose?.();
      return undefined;
    }
  }, [threeModules, threeError, wallHosts]);

  const renderCard = useCallback(
    (card, index, fallback = false) => {
      const CardComponent = card.Component;
      return (
        <article key={card.key} className={fallback ? styles.fallbackCard : styles.roomCard} data-wall-interactive="true">
          <header className={styles.roomCardHeader}>
            <div>
              <span>{card.metadata?.category || card.cardType || "knowledge"}</span>
              <h3>{card.metadata?.title || "Knowledge card"}</h3>
            </div>
            <button
              type="button"
              onClick={() => setExpandedCardId(card.key)}
              aria-label={`Expand ${card.metadata?.title || "knowledge card"}`}
            >
              <FiMaximize2 />
            </button>
          </header>
          <div className={styles.roomCardBody} data-wall-scroll="true">
            {CardComponent ? (
              <CardComponent {...card.props} />
            ) : (
              <div className={styles.emptyWall}>
                <strong>{card.metadata?.title || "Knowledge card"}</strong>
                <p>{card.metadata?.summary}</p>
              </div>
            )}
          </div>
        </article>
      );
    },
    []
  );

  const filterOptions = [
    { key: "reminderDue", label: "Due", icon: FiBell },
    { key: "hasNotes", label: "Notes", icon: FiBookmark },
  ];

  if (threeError) {
    return (
      <FallbackKnowledgeGrid
        filteredCards={filteredCards}
        categories={categories}
        activeCategory={activeCategory}
        setActiveCategory={setActiveCategory}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        filters={filters}
        setFilters={setFilters}
        renderCard={renderCard}
      />
    );
  }

  return (
    <div ref={shellRef} className={`${styles.roomShell} ${viewMode === "overview" ? styles.overviewMode : ""}`} tabIndex={0}>
      <canvas ref={canvasRef} className={styles.roomCanvas} aria-label="Three.js knowledge room" />

      {!threeModules && viewMode === "room" ? (
        <div className={styles.loadingLayer}>
          <div>
            <span>Loading Three.js room</span>
            <strong>Preparing knowledge walls...</strong>
          </div>
        </div>
      ) : null}

      <div className={styles.topBar} data-wall-interactive="true">
        <div>
          <span>Knowledge Room</span>
          <strong>{filteredCardsLength} visible cards</strong>
        </div>
        <div className={styles.statStrip}>
          <div className={styles.viewToggle} role="group" aria-label="Knowledge layout">
            <button type="button" aria-pressed={viewMode === "overview"} onClick={() => setViewMode("overview")}>All cards</button>
            <button type="button" aria-pressed={viewMode === "room"} onClick={() => setViewMode("room")}>3D room</button>
          </div>
          <span>{knowledgeItems.filter((item) => item.active).length} MCP active</span>
          <span>{savedCount} saved</span>
          <span>{dueCount} due</span>
        </div>
      </div>

      {viewMode === "overview" && <main className={styles.overviewGrid} aria-label="All knowledge cards" data-wall-interactive="true" style={{ "--overview-columns": Math.max(3, Math.ceil(Math.sqrt(filteredCards.length * 1.8))) }}>
        {filteredCards.length ? filteredCards.map((card) => <button type="button" key={card.key} className={styles.overviewCard} onClick={() => setExpandedCardId(card.key)}>
          <span>{card.metadata?.category || card.roomSection || "Knowledge"}</span>
          <strong>{card.metadata?.title || card.title || "Knowledge card"}</strong>
          <small>{card.metadata?.summary || "Open to read, save, or review this card."}</small>
          <FiMaximize2 aria-hidden="true" />
        </button>) : <div className={styles.emptyWall}>{isLoading ? "Loading knowledge cards…" : "No cards match this view. Try another category or clear your filters."}</div>}
      </main>}

      <div className={styles.searchPanel} data-wall-interactive="true">
        <FiSearch className={styles.searchIcon} />
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search knowledge..."
        />
        {searchQuery ? (
          <button type="button" onClick={() => setSearchQuery("")} aria-label="Clear search">
            <FiX />
          </button>
        ) : null}
      </div>

      <div className={styles.filterPanel} data-wall-interactive="true">
        <button
          type="button"
          onClick={() => setShowFilters((current) => !current)}
          className={Object.values(filters).some(Boolean) ? styles.activeControl : ""}
        >
          <FiFilter />
          Filters
          {showFilters ? <FiChevronUp /> : <FiChevronDown />}
        </button>
        <AnimatePresence>
          {showFilters ? (
            <motion.div
              className={styles.popover}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
            >
              {filterOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setFilters((current) => ({ ...current, [option.key]: !current[option.key] }))}
                    className={filters[option.key] ? styles.activePill : ""}
                  >
                    <Icon />
                    {option.label}
                  </button>
                );
              })}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className={styles.categoryPanel} data-wall-interactive="true">
        <button type="button" onClick={() => setShowCategories((current) => !current)}>
          Category
          {showCategories ? <FiChevronUp /> : <FiChevronDown />}
        </button>
        <AnimatePresence>
          {showCategories ? (
            <motion.div
              className={styles.categoryMenu}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
            >
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => {
                    setActiveCategory(category.id);
                    setShowCategories(false);
                  }}
                  className={activeCategory === category.id ? styles.activePill : ""}
                >
                  <span>{category.icon}</span>
                  {category.name}
                </button>
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {isLoading || generatedLoading ? (
        <div className={styles.syncBadge} data-wall-interactive="true">
          Syncing knowledge...
        </div>
      ) : null}

      {viewMode === "room" && wallHosts?.feed
        ? createPortal(
            <WallPanel
              title="Live Knowledge Feed"
              eyebrow="Front Wall"
              subtitle="Daily facts, news, language cards, coding tips, and active generated items."
              cards={feedCards}
              emptyText="No live cards match this view."
              renderCard={renderCard}
            />,
            wallHosts.feed
          )
        : null}

      {viewMode === "room" && wallHosts?.inbox
        ? createPortal(
            <WallPanel
              title="ChatGPT MCP Inbox"
              eyebrow="Left Wall"
              subtitle="Generated facts, news, sources, and research cards created through MCP."
              cards={inboxCards}
              emptyText="Ask ChatGPT to create knowledge items through MCP and they will appear here."
              renderCard={renderCard}
            />,
            wallHosts.inbox
          )
        : null}

      {viewMode === "room" && wallHosts?.review
        ? createPortal(
            <WallPanel
              title="Saved And Due Reviews"
              eyebrow="Right Wall"
              subtitle="Bookmarked cards remain the review and reminder layer."
              cards={reviewCards}
              emptyText="Saved and due review cards will appear on this wall."
              renderCard={renderCard}
            />,
            wallHosts.review
          )
        : null}

      {viewMode === "room" && wallHosts?.history
        ? createPortal(
            <WallPanel
              title="Prompt History"
              eyebrow="Back Wall"
              subtitle="Each ChatGPT MCP request creates a run so new cards can stay in history."
              cards={historyCards}
              emptyText="No prompt runs match this view."
              renderCard={renderCard}
            >
              {historyCards.length ? (
                <div className={styles.cardScroller} data-wall-scroll="true">
                  {historyCards.map(renderCard)}
                </div>
              ) : (
                <PromptHistoryList promptRuns={promptRuns} />
              )}
            </WallPanel>,
            wallHosts.history
          )
        : null}

      <AnimatePresence>
        {expandedCard ? (
          <motion.div
            className={styles.modalLayer}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setExpandedCardId(null)}
            data-wall-interactive="true"
          >
            <motion.div
              className={styles.expandedCard}
              initial={{ scale: 0.96, opacity: 0, y: 18 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 18 }}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                className={styles.closeButton}
                type="button"
                onClick={() => setExpandedCardId(null)}
                aria-label="Close expanded card"
              >
                <FiX />
              </button>
              <div className={styles.expandedCardBody} data-wall-scroll="true">
                {expandedCard.Component ? (
                  <expandedCard.Component {...expandedCard.props} />
                ) : (
                  <div className={styles.emptyWall}>{expandedCard.metadata?.summary}</div>
                )}
              </div>
              {expandedCard.bookmark ? (
                <SavedBookmarkFooter
                  bookmark={expandedCard.bookmark}
                  onRemove={() => {
                    handleBookmarkToggle({
                      cardType: expandedCard.bookmark.card_type,
                      sourceId: expandedCard.bookmark.source_id,
                      payload: expandedCard.bookmark.payload,
                    });
                    setExpandedCardId(null);
                  }}
                  onMarkReviewed={() => bookmarkHelpers.markReviewed(expandedCard.bookmark)}
                />
              ) : null}
              {!expandedCard.bookmark && !expandedCard.generatedItem && !expandedCard.promptRun ? (
                <div className={styles.expandedActions}>
                  <button
                    type="button"
                    onClick={() =>
                      handleBookmarkToggle({
                        cardType: expandedCard.cardType,
                        sourceId: expandedCard.key,
                        collectionName: "",
                        payload: expandedCard.metadata,
                      })
                    }
                  >
                    <FiBookmark />
                    Save to Collection
                  </button>
                </div>
              ) : null}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {feedback ? (
          <motion.div
            initial={{ opacity: 0, y: -20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -20, x: "-50%" }}
            className={styles.feedbackToast}
            data-wall-interactive="true"
          >
            <div className={feedback.type === "error" ? styles.toastError : feedback.type === "info" ? styles.toastInfo : styles.toastSuccess}>
              {feedback.type === "success" && <FiCheckCircle />}
              {feedback.type === "error" && <FiX />}
              {feedback.type === "info" && <FiBookmark />}
              <span>{feedback.message}</span>
              <button type="button" onClick={() => setFeedback(null)} aria-label="Dismiss message">
                <FiX />
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
