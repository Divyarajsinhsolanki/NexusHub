import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, useSearchParams } from "react-router-dom";
import { fetchProjects, SchedulerAPI, updateProject } from "../components/api";
import { loadThree } from "../lib/threeLoader";
import PageLoader from "../components/ui/PageLoader";
import SprintOverview from "./SprintOverview";
import Scheduler from "../components/Scheduler/Scheduler";
import TodoBoard from "../components/TodoBoard/TodoBoard";
import SprintManager from "../components/Scheduler/SprintManager";
import Sheet from "./Sheet";
import ProjectStatistics from "./ProjectStatistics";
import IssueTracker from "./IssueTracker";
import ProjectVault from "./ProjectVault";
import Chat from "./Chat";
import styles from "./ProjectMetaverse.module.css";

const VIEW_MODES = ["dev", "qa", "combined"];
const ROOM_WIDTH = 16;
const ROOM_DEPTH = 14;
const ROOM_HEIGHT = 8.5;

const PROJECT_SECTIONS = [
  { key: "overview", label: "Overview", subtitle: "Project dashboard overview", color: "#38bdf8" },
  { key: "scheduler", label: "Scheduler", subtitle: "Daily allocation and sprint work", color: "#22c55e" },
  { key: "todo", label: "Todo", subtitle: "Kanban task execution", color: "#f59e0b" },
  { key: "statistics", label: "Statistics", subtitle: "Metrics, workload, and trends", color: "#6366f1" },
  { key: "issues", label: "Issue Tracker", subtitle: "Defects, blockers, and imports", color: "#f43f5e" },
  { key: "sheet", label: "Sheet", subtitle: "Connected Google Sheet view", color: "#14b8a6", requiresSheet: true },
  { key: "vault", label: "Vault", subtitle: "Project assets and credentials", color: "#8b5cf6" },
  { key: "settings", label: "Settings", subtitle: "Project configuration", color: "#64748b" },
];

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const asRecordArray = (value) =>
  Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];

const dateTime = (value) => {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};

const compareEndDates = (a, b) => {
  const endA = dateTime(a?.end_date);
  const endB = dateTime(b?.end_date);
  if (endA === null && endB === null) return 0;
  if (endA === null) return 1;
  if (endB === null) return -1;
  return endA - endB;
};

const calculateWorkingDays = (start, end, workingDaysMask = 62) => {
  if (!start || !end) return 0;
  let count = 0;
  const current = new Date(start);
  const last = new Date(end);
  while (current <= last) {
    const day = current.getDay();
    if ((Number(workingDaysMask) & (1 << day)) !== 0) count += 1;
    current.setDate(current.getDate() + 1);
  }
  return count;
};

const formatDateRange = (start, end) => {
  if (!start || !end) return "No sprint selected";
  const options = { month: "short", day: "numeric" };
  return `${new Date(start).toLocaleDateString("en-US", options)} - ${new Date(end).toLocaleDateString("en-US", options)}`;
};

const makeWallTexture = (THREE, base, line, accent = "rgba(56, 189, 248, 0.28)") => {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  const roundedRect = (x, y, width, height, radius = 18) => {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  const gradient = ctx.createLinearGradient(0, 0, 1024, 1024);
  gradient.addColorStop(0, base[0]);
  gradient.addColorStop(1, base[1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1024, 1024);

  const glowA = ctx.createRadialGradient(190, 160, 20, 190, 160, 340);
  glowA.addColorStop(0, "rgba(255,255,255,0.28)");
  glowA.addColorStop(0.42, "rgba(255,255,255,0.08)");
  glowA.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glowA;
  ctx.fillRect(0, 0, 1024, 1024);

  const glowB = ctx.createRadialGradient(850, 780, 10, 850, 780, 420);
  glowB.addColorStop(0, accent);
  glowB.addColorStop(0.34, "rgba(255,255,255,0.08)");
  glowB.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glowB;
  ctx.fillRect(0, 0, 1024, 1024);

  ctx.strokeStyle = line;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.52;
  for (let i = 0; i <= 1024; i += 64) {
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

  const panels = [
    [92, 112, 270, 150],
    [674, 96, 230, 126],
    [132, 658, 300, 170],
    [584, 606, 330, 190],
    [418, 342, 210, 132],
  ];

  panels.forEach(([x, y, width, height], index) => {
    roundedRect(x, y, width, height, 26);
    ctx.fillStyle = index % 2 === 0 ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.07)";
    ctx.fill();
    ctx.strokeStyle = index % 2 === 0 ? "rgba(255,255,255,0.28)" : accent;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    for (let i = 0; i < 3; i += 1) {
      roundedRect(x + 26, y + 30 + i * 34, width - 52 - i * 34, 8, 4);
      ctx.fill();
    }
  });

  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.4;
  for (let i = 0; i < 6; i += 1) {
    const x = 76 + i * 160;
    ctx.beginPath();
    ctx.moveTo(x, 894);
    ctx.lineTo(x + 74, 824);
    ctx.lineTo(x + 148, 824);
    ctx.stroke();
  }

  ctx.globalAlpha = 0.24;
  ctx.fillStyle = "rgba(255,255,255,0.42)";
  for (let y = 82; y < 980; y += 128) {
    for (let x = 82; x < 980; x += 128) {
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
};

const isTypingTarget = (target) =>
  target instanceof Element &&
  Boolean(target.closest("input, textarea, select, button, a, [contenteditable='true']"));

const isWallInteraction = (target) =>
  target instanceof Element &&
  Boolean(target.closest("[data-wall-interactive='true'], input, textarea, select, button, a, [contenteditable='true']"));

function ProjectSettingsWall({ project, setProject }) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    start_date: "",
    end_date: "",
    qa_mode_enabled: false,
    sheet_integration_enabled: false,
    sheet_id: "",
    issue_sheet_id: "",
    issue_sheet_name: "Issue Tracker",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!project) return;
    setForm({
      name: project.name || "",
      description: project.description || "",
      start_date: project.start_date || "",
      end_date: project.end_date || "",
      qa_mode_enabled: !!project.qa_mode_enabled,
      sheet_integration_enabled: !!project.sheet_integration_enabled,
      sheet_id: project.sheet_id || "",
      issue_sheet_id: project.issue_sheet_id || "",
      issue_sheet_name: project.issue_sheet_name || "Issue Tracker",
    });
  }, [project]);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!project?.id) return;

    setSaving(true);
    setMessage("");
    try {
      const { data } = await updateProject(project.id, {
        ...form,
        issue_sheet_name: form.issue_sheet_name || "Issue Tracker",
      });
      setProject(data);
      setMessage("Project settings updated successfully.");
    } catch (error) {
      setMessage(error?.response?.data?.errors?.join(", ") || "Failed to update project settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.settingsForm}>
      <div>
        <label htmlFor="metaverse-name">Project Name</label>
        <input id="metaverse-name" name="name" value={form.name} onChange={handleChange} required />
      </div>
      <div>
        <label htmlFor="metaverse-description">Description</label>
        <textarea id="metaverse-description" name="description" value={form.description} onChange={handleChange} rows={4} />
      </div>
      <div className={styles.settingsGrid}>
        <div>
          <label htmlFor="metaverse-start-date">Start Date</label>
          <input id="metaverse-start-date" type="date" name="start_date" value={form.start_date} onChange={handleChange} />
        </div>
        <div>
          <label htmlFor="metaverse-end-date">End Date</label>
          <input id="metaverse-end-date" type="date" name="end_date" value={form.end_date} onChange={handleChange} />
        </div>
      </div>
      <div className={styles.settingsChecks}>
        <label>
          <input type="checkbox" name="qa_mode_enabled" checked={form.qa_mode_enabled} onChange={handleChange} />
          Enable QA Mode
        </label>
        <label>
          <input type="checkbox" name="sheet_integration_enabled" checked={form.sheet_integration_enabled} onChange={handleChange} />
          Enable Sheet Integration
        </label>
      </div>
      {form.sheet_integration_enabled ? (
        <div className={styles.settingsGrid}>
          <div>
            <label htmlFor="metaverse-sheet-id">Task Sheet ID</label>
            <input id="metaverse-sheet-id" name="sheet_id" value={form.sheet_id} onChange={handleChange} />
          </div>
          <div>
            <label htmlFor="metaverse-issue-sheet-id">Issue Tracker Sheet ID</label>
            <input id="metaverse-issue-sheet-id" name="issue_sheet_id" value={form.issue_sheet_id} onChange={handleChange} />
          </div>
          <div>
            <label htmlFor="metaverse-issue-sheet-name">Issue Tracker Sheet Name</label>
            <input id="metaverse-issue-sheet-name" name="issue_sheet_name" value={form.issue_sheet_name} onChange={handleChange} />
          </div>
        </div>
      ) : null}
      {message ? <p className={message.includes("successfully") ? styles.successMessage : styles.errorMessage}>{message}</p> : null}
      <div className={styles.formActions}>
        <button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </form>
  );
}

function ChatWall() {
  return (
    <div className={styles.chatWallInner} data-wall-interactive="true">
      <div className={styles.chatEmbed} data-wall-scroll="true">
        <Chat embedded />
      </div>
    </div>
  );
}

export default function ProjectMetaverse() {
  const { projectId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const shellRef = useRef(null);
  const canvasRef = useRef(null);
  const selectedDate = useMemo(() => new Date(), []);
  const initialTab = searchParams.get("tab") || "overview";
  const [activeSection, setActiveSection] = useState(initialTab);
  const [mountedSections, setMountedSections] = useState(() => new Set([initialTab]));
  const [project, setProject] = useState(null);
  const [sprints, setSprints] = useState([]);
  const [sprintId, setSprintId] = useState(null);
  const [sprint, setSprint] = useState(null);
  const [viewMode, setViewMode] = useState("combined");
  const [loading, setLoading] = useState(true);
  const [threeModules, setThreeModules] = useState(null);
  const [threeError, setThreeError] = useState(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  const wallHosts = useMemo(() => {
    if (typeof document === "undefined") return null;
    return {
      modules: document.createElement("section"),
      content: document.createElement("section"),
      controls: document.createElement("section"),
      chat: document.createElement("section"),
    };
  }, []);

  const sheetEnabled = !!(project?.sheet_integration_enabled && project?.sheet_id);
  const dashboardTabs = useMemo(
    () => PROJECT_SECTIONS.filter((item) => !item.requiresSheet || sheetEnabled),
    [sheetEnabled]
  );
  const activeTab = useMemo(
    () => dashboardTabs.find((item) => item.key === activeSection) || dashboardTabs[0] || PROJECT_SECTIONS[0],
    [activeSection, dashboardTabs]
  );
  const viewModeLabel = viewMode === "qa" ? "QA" : viewMode === "combined" ? "Combined" : "Dev";
  const sprintRangeLabel = sprint ? formatDateRange(sprint.start_date, sprint.end_date) : "No sprint selected";
  const workingDaysCount = sprint
    ? calculateWorkingDays(
      sprint.start_date,
      sprint.end_date,
      typeof sprint.working_days_mask === "number" ? sprint.working_days_mask : 62
    )
    : 0;

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
        console.error("Failed to load Three.js metaverse modules:", error);
        setThreeError(error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const runModuleTransition = useCallback((nextSection) => {
    if (!nextSection) return;
    setMountedSections((current) => {
      if (current.has(nextSection)) return current;
      const next = new Set(current);
      next.add(nextSection);
      return next;
    });
    setActiveSection(nextSection);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!projectId) return undefined;

    setLoading(true);
    const loadProjectRoom = async () => {
      try {
        const projects = await fetchProjects()
          .then(({ data }) => asRecordArray(Array.isArray(data?.data) ? data.data : data))
          .catch((error) => {
            console.error("Failed to load metaverse projects:", error);
            return [];
          });
        const sprintData = await SchedulerAPI.getSprints(projectId)
          .then((response) => response?.data)
          .catch((error) => {
            console.error("Sprints load failed:", error);
            return [];
          });

        if (cancelled) return;
        const foundProject = projects.find((item) => item.id === Number(projectId)) || null;
        const rawSprints = Array.isArray(sprintData?.data) ? sprintData.data : sprintData;
        const sorted = asRecordArray(rawSprints).sort(compareEndDates);
        const today = new Date();
        const currentSprint =
          sorted.find((item) => today >= new Date(item.start_date) && today <= new Date(item.end_date)) ||
          [...sorted].reverse().find((item) => new Date(item.end_date) < today) ||
          sorted[0] ||
          null;

        setProject(foundProject);
        setSprints(sorted);
        setSprint(currentSprint);
        setSprintId(currentSprint?.id || null);
        if (!foundProject?.qa_mode_enabled) setViewMode("dev");
      } catch (error) {
        console.error("Failed to prepare metaverse data:", error);
        if (!cancelled) {
          setProject(null);
          setSprints([]);
          setSprint(null);
          setSprintId(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadProjectRoom();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!project?.qa_mode_enabled && viewMode !== "dev") {
      setViewMode("dev");
    }
  }, [project?.qa_mode_enabled, viewMode]);

  useEffect(() => {
    if (!sprintId) {
      setSprint(null);
      return;
    }
    const selected = sprints.find((item) => item.id === Number(sprintId));
    setSprint(selected || null);
  }, [sprintId, sprints]);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (requestedTab && dashboardTabs.some((item) => item.key === requestedTab) && requestedTab !== activeSection) {
      runModuleTransition(requestedTab);
      return;
    }
    if (!dashboardTabs.some((item) => item.key === activeSection) && dashboardTabs[0]) {
      runModuleTransition(dashboardTabs[0].key);
    }
  }, [activeSection, dashboardTabs, runModuleTransition, searchParams]);

  const handleSectionChange = useCallback(
    (key) => {
      if (!dashboardTabs.some((item) => item.key === key)) return;
      if (key === activeSection) return;
      runModuleTransition(key);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("tab", key);
      setSearchParams(nextParams, { replace: true });
    },
    [activeSection, dashboardTabs, runModuleTransition, searchParams, setSearchParams]
  );

  const handleSprintChange = useCallback(
    (nextSprint) => {
      const nextId = typeof nextSprint === "object" ? nextSprint?.id : nextSprint;
      const selected = sprints.find((item) => item.id === Number(nextId));
      setSprint(selected || (typeof nextSprint === "object" ? nextSprint : null));
      setSprintId(nextId ? Number(nextId) : null);
    },
    [sprints]
  );

  useEffect(() => {
    const shell = shellRef.current;
    const canvas = canvasRef.current;
    if (loading || !project || !shell || !canvas || !wallHosts || !threeModules || threeError || webglUnavailable) return undefined;
    const { THREE, CSS3DObject, CSS3DRenderer } = threeModules;

    wallHosts.modules.className = `${styles.wallPanel} ${styles.moduleWall}`;
    wallHosts.content.className = `${styles.wallPanel} ${styles.contentWall}`;
    wallHosts.controls.className = `${styles.wallPanel} ${styles.controlWall}`;
    wallHosts.chat.className = `${styles.wallPanel} ${styles.chatWall}`;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    } catch (error) {
      console.error("Failed to initialize Three.js project metaverse room:", error);
      setWebglUnavailable(true);
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x0b1523, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const cssRenderer = new CSS3DRenderer();
    cssRenderer.domElement.className = styles.cssLayer;
    shell.appendChild(cssRenderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1523);
    scene.fog = new THREE.Fog(0x0b1523, 18, 42);
    const cssScene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 80);
    camera.position.set(0, 1.5, 5.4);
    camera.rotation.order = "YXZ";

    const controls = {
      yaw: 0,
      pitch: 0,
      dragging: false,
      lastX: 0,
      lastY: 0,
      startX: 0,
      startY: 0,
      moved: false,
      forwardClickTarget: null,
    };

    const ambient = new THREE.AmbientLight(0xffffff, 1.18);
    scene.add(ambient);
    const keyLight = new THREE.PointLight(0x8bdcff, 2.3, 32);
    keyLight.position.set(0, 4.8, 1.8);
    scene.add(keyLight);
    const fillLight = new THREE.PointLight(0x7c3aed, 1.25, 24);
    fillLight.position.set(-5.6, 2.8, 0.5);
    scene.add(fillLight);

    const wallMaterial = (base, line, accent) =>
      new THREE.MeshStandardMaterial({
        map: makeWallTexture(THREE, base, line, accent),
        roughness: 0.86,
        metalness: 0.02,
        side: THREE.FrontSide,
      });

    const frontWall = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM_WIDTH, ROOM_HEIGHT),
      wallMaterial(["#eaf6ff", "#bfd9ea"], "rgba(30, 64, 175, 0.22)", "rgba(56, 189, 248, 0.36)")
    );
    frontWall.position.set(0, 2, -ROOM_DEPTH / 2);
    scene.add(frontWall);

    const backWall = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM_WIDTH, ROOM_HEIGHT),
      wallMaterial(["#edf2f7", "#cbd5e1"], "rgba(15, 23, 42, 0.2)", "rgba(139, 92, 246, 0.32)")
    );
    backWall.position.set(0, 2, ROOM_DEPTH / 2);
    backWall.rotation.y = Math.PI;
    scene.add(backWall);

    const leftWall = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM_DEPTH, ROOM_HEIGHT),
      wallMaterial(["#e0f2fe", "#b7d6e5"], "rgba(14, 116, 144, 0.2)", "rgba(20, 184, 166, 0.32)")
    );
    leftWall.position.set(-ROOM_WIDTH / 2, 2, 0);
    leftWall.rotation.y = Math.PI / 2;
    scene.add(leftWall);

    const rightWall = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM_DEPTH, ROOM_HEIGHT),
      wallMaterial(["#eef2ff", "#cbd5e1"], "rgba(79, 70, 229, 0.2)", "rgba(99, 102, 241, 0.34)")
    );
    rightWall.position.set(ROOM_WIDTH / 2, 2, 0);
    rightWall.rotation.y = -Math.PI / 2;
    scene.add(rightWall);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM_WIDTH, ROOM_DEPTH),
      new THREE.MeshStandardMaterial({
        map: makeWallTexture(THREE, ["#aebdcc", "#7f909f"], "rgba(15, 23, 42, 0.18)"),
        roughness: 0.8,
        metalness: 0.04,
        side: THREE.FrontSide,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2;
    scene.add(floor);

    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM_WIDTH, ROOM_DEPTH),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.82, metalness: 0.01, side: THREE.FrontSide })
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 6.5;
    scene.add(ceiling);

    const accentMaterial = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const floorRunway = new THREE.Mesh(new THREE.PlaneGeometry(3.1, ROOM_DEPTH - 1.2), accentMaterial);
    floorRunway.rotation.x = -Math.PI / 2;
    floorRunway.position.set(0, -1.985, 0);
    scene.add(floorRunway);

    const floorCore = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.8, 64),
      new THREE.MeshBasicMaterial({
        color: 0x7dd3fc,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    floorCore.rotation.x = -Math.PI / 2;
    floorCore.position.set(0, -1.975, 0);
    scene.add(floorCore);

    const wallAccentMaterial = new THREE.MeshBasicMaterial({
      color: 0x6366f1,
      transparent: true,
      opacity: 0.13,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const backAccent = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 4.8), wallAccentMaterial);
    backAccent.position.set(0, 2.4, ROOM_DEPTH / 2 - 0.035);
    backAccent.rotation.y = Math.PI;
    scene.add(backAccent);

    const sideAccent = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 4.6), wallAccentMaterial.clone());
    sideAccent.position.set(ROOM_WIDTH / 2 - 0.035, 2.3, 0);
    sideAccent.rotation.y = -Math.PI / 2;
    scene.add(sideAccent);

    const bandMaterials = [
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false }),
      new THREE.MeshBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    ];
    const addBand = (width, height, position, rotation, materialIndex = 0) => {
      const band = new THREE.Mesh(new THREE.PlaneGeometry(width, height), bandMaterials[materialIndex].clone());
      band.position.set(position[0], position[1], position[2]);
      band.rotation.set(rotation[0], rotation[1], rotation[2]);
      scene.add(band);
      return band;
    };

    addBand(ROOM_WIDTH - 1.2, 0.055, [0, 5.85, -ROOM_DEPTH / 2 + 0.045], [0, 0, 0], 0);
    addBand(ROOM_WIDTH - 1.2, 0.035, [0, -1.18, -ROOM_DEPTH / 2 + 0.045], [0, 0, 0], 1);
    addBand(ROOM_WIDTH - 1.2, 0.05, [0, 5.85, ROOM_DEPTH / 2 - 0.045], [0, Math.PI, 0], 0);
    addBand(ROOM_DEPTH - 1.2, 0.055, [-ROOM_WIDTH / 2 + 0.045, 5.8, 0], [0, Math.PI / 2, 0], 0);
    addBand(ROOM_DEPTH - 1.2, 0.055, [ROOM_WIDTH / 2 - 0.045, 5.8, 0], [0, -Math.PI / 2, 0], 0);

    const ceilingLightMaterial = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    [-4.8, -2.4, 0, 2.4, 4.8].forEach((x, index) => {
      const lightPanel = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 0.42), ceilingLightMaterial.clone());
      lightPanel.rotation.x = Math.PI / 2;
      lightPanel.position.set(x, 6.46, index % 2 === 0 ? -1.9 : 1.9);
      scene.add(lightPanel);
    });

    const routeMaterial = new THREE.LineBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.3,
    });
    const routeGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-6.2, -1.94, -4.8),
      new THREE.Vector3(-2.2, -1.94, -1.7),
      new THREE.Vector3(0, -1.94, 0),
      new THREE.Vector3(2.3, -1.94, -1.6),
      new THREE.Vector3(6.2, -1.94, -4.6),
    ]);
    const floorRoute = new THREE.Line(routeGeometry, routeMaterial);
    scene.add(floorRoute);

    const addCssWall = (element, position, rotation, scale) => {
      const object = new CSS3DObject(element);
      object.position.set(position[0], position[1], position[2]);
      object.rotation.set(rotation[0], rotation[1], rotation[2]);
      object.scale.setScalar(scale);
      cssScene.add(object);
      return object;
    };

    const cssWallObjects = [
      { element: wallHosts.content, object: addCssWall(wallHosts.content, [0, 2.08, -ROOM_DEPTH / 2 + 0.08], [0, 0, 0], 0.0071) },
      { element: wallHosts.modules, object: addCssWall(wallHosts.modules, [-ROOM_WIDTH / 2 + 0.08, 2.08, -0.55], [0, Math.PI / 2, 0], 0.00745) },
      { element: wallHosts.controls, object: addCssWall(wallHosts.controls, [ROOM_WIDTH / 2 - 0.08, 2.1, -0.25], [0, -Math.PI / 2, 0], 0.00645) },
      { element: wallHosts.chat, object: addCssWall(wallHosts.chat, [0, 2.25, ROOM_DEPTH / 2 - 0.08], [0, Math.PI, 0], 0.00855) },
    ];

    const resize = () => {
      const width = shell.clientWidth || window.innerWidth;
      const height = shell.clientHeight || window.innerHeight;
      renderer.setSize(width, height, false);
      cssRenderer.setSize(width, height);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };

    const setCameraRotation = () => {
      camera.rotation.y = controls.yaw;
      camera.rotation.x = controls.pitch;
    };

    const pointerNdc = new THREE.Vector2(0, 0);
    const updatePointerFromEvent = (event) => {
      const rect = shell.getBoundingClientRect();
      pointerNdc.x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
      pointerNdc.y = -(((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1);
    };

    const getPointerElement = (event) => {
      updateInteractiveWall();
      return document.elementFromPoint(event.clientX, event.clientY);
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
      camera.position.x = clamp(camera.position.x, -ROOM_WIDTH / 2 + 1.1, ROOM_WIDTH / 2 - 1.1);
      camera.position.z = clamp(camera.position.z, -ROOM_DEPTH / 2 + 1.1, ROOM_DEPTH / 2 - 1.1);
    };

    const updateInteractiveWall = () => {
      cssWallObjects.forEach((entry) => {
        entry.element.style.pointerEvents = "auto";
      });
    };

    const handlePointerDown = (event) => {
      updatePointerFromEvent(event);
      const pointerElement = getPointerElement(event);
      if (isWallInteraction(event.target)) return;
      if (isWallInteraction(pointerElement)) {
        controls.forwardClickTarget =
          pointerElement.closest("button, a, input, textarea, select, [role='button'], [contenteditable='true']") ||
          pointerElement;
        controls.startX = event.clientX;
        controls.startY = event.clientY;
        controls.moved = false;
        return;
      }
      controls.dragging = true;
      controls.lastX = event.clientX;
      controls.lastY = event.clientY;
      controls.startX = event.clientX;
      controls.startY = event.clientY;
      controls.moved = false;
      shell.setPointerCapture?.(event.pointerId);
    };

    const handlePointerMove = (event) => {
      updatePointerFromEvent(event);
      if (controls.forwardClickTarget) {
        controls.moved ||= Math.abs(event.clientX - controls.startX) + Math.abs(event.clientY - controls.startY) > 8;
        return;
      }
      if (!controls.dragging) return;
      const dx = event.clientX - controls.lastX;
      const dy = event.clientY - controls.lastY;
      controls.lastX = event.clientX;
      controls.lastY = event.clientY;
      controls.yaw += dx * 0.0035;
      controls.pitch = clamp(controls.pitch + dy * 0.0028, -0.5, 0.5);
      controls.moved ||= Math.abs(event.clientX - controls.startX) + Math.abs(event.clientY - controls.startY) > 8;
      setCameraRotation();
    };

    const handlePointerUp = (event) => {
      const forwardedTarget = controls.forwardClickTarget;
      controls.forwardClickTarget = null;
      controls.dragging = false;
      shell.releasePointerCapture?.(event.pointerId);
      if (forwardedTarget && !controls.moved) {
        event.preventDefault();
        if (forwardedTarget instanceof HTMLInputElement || forwardedTarget instanceof HTMLTextAreaElement || forwardedTarget instanceof HTMLSelectElement) {
          forwardedTarget.focus();
        } else if (forwardedTarget instanceof HTMLElement) {
          forwardedTarget.click();
        }
      }
    };

    const handleWheel = (event) => {
      if (event.target instanceof Element && event.target.closest("[data-wall-scroll='true']")) return;
      event.preventDefault();
      if (Math.abs(event.deltaX) > 1) {
        moveCamera(0, -event.deltaX * 0.008);
      }
      if (Math.abs(event.deltaY) > 1) {
        moveCamera(-event.deltaY * 0.008);
      }
    };

    const handleKeyDown = (event) => {
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "w") moveCamera(0.34);
      if (key === "s") moveCamera(-0.34);
      if (key === "a") moveCamera(0, -0.34);
      if (key === "d") moveCamera(0, 0.34);
      if (event.key === "ArrowLeft") controls.yaw += 0.11;
      if (event.key === "ArrowRight") controls.yaw -= 0.11;
      if (event.key === "ArrowUp") controls.pitch = clamp(controls.pitch + 0.08, -0.5, 0.5);
      if (event.key === "ArrowDown") controls.pitch = clamp(controls.pitch - 0.08, -0.5, 0.5);
      setCameraRotation();
    };

    let frameId;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const elapsed = performance.now() * 0.001;
      keyLight.intensity = 2.12 + Math.sin(elapsed * 0.8) * 0.14;
      updateInteractiveWall();
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
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      cancelAnimationFrame(frameId);
      shell.removeEventListener("pointerdown", handlePointerDown);
      shell.removeEventListener("pointermove", handlePointerMove);
      shell.removeEventListener("pointerup", handlePointerUp);
      shell.removeEventListener("pointercancel", handlePointerUp);
      shell.removeEventListener("wheel", handleWheel);
      window.removeEventListener("resize", resize);
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
  }, [loading, project, threeModules, threeError, wallHosts, webglUnavailable]);

  const emptyState = (
    <div className={styles.emptyState}>
      <p>No sprint selected.</p>
      <span>Pick a sprint from Sprint Manager to load this workspace.</span>
    </div>
  );

  const sectionContent = (sectionKey) => {
    switch (sectionKey) {
      case "overview":
        return (
          <SprintOverview
            projectId={projectId}
            sprintId={sprintId}
            onSprintChange={handleSprintChange}
            sheetIntegrationEnabled={project?.sheet_integration_enabled}
            projectMembers={project?.users}
            viewMode={viewMode}
          />
        );
      case "scheduler":
        return sprintId ? (
          <Scheduler
            sprintId={sprintId}
            projectId={projectId}
            sheetIntegrationEnabled={project?.sheet_integration_enabled}
            projectMembers={project?.users}
            viewMode={viewMode}
          />
        ) : (
          emptyState
        );
      case "todo":
        return sprintId ? (
          <TodoBoard sprintId={sprintId} projectId={projectId} viewMode={viewMode} onSprintChange={handleSprintChange} />
        ) : (
          emptyState
        );
      case "statistics":
        return <ProjectStatistics projectId={projectId} />;
      case "issues":
        return <IssueTracker projectId={projectId} sprint={sprint} />;
      case "sheet":
        return sheetEnabled ? <Sheet sheetName={sprint?.name} projectId={projectId} sheetId={project?.sheet_id} /> : emptyState;
      case "vault":
        return <ProjectVault projectId={projectId} />;
      case "settings":
        return <ProjectSettingsWall project={project} setProject={setProject} />;
      default:
        return null;
    }
  };

  if (loading) {
    return <PageLoader title="Project metaverse" message="Building 3D project room..." />;
  }

  if (!project) {
    return (
      <div className={styles.metaverseShell}>
        <div className={styles.metaverseNotice}>Project not found.</div>
      </div>
    );
  }

  if (threeError || webglUnavailable) {
    const fallbackReason = webglUnavailable
      ? "3D mode needs WebGL, but this browser has WebGL disabled or blocked. The same project tools are available here in a flat workspace."
      : "The 3D engine could not load. The same project tools are available here in a flat workspace.";

    return (
      <div className={`${styles.metaverseShell} ${styles.fallbackShell}`}>
        <div className={styles.fallbackWorkspace}>
          <div className={styles.fallbackNoticePanel}>
            <div>
              <span>2D workspace</span>
              <h1>{project.name || "Project metaverse"}</h1>
              <p>{fallbackReason}</p>
            </div>
            <button type="button" onClick={() => window.location.reload()}>
              Retry 3D
            </button>
          </div>

          <aside className={styles.fallbackPanel}>
            <div className={styles.wallHeader}>
              <span>Project Modules</span>
              <h2>Modules</h2>
              <p>{project.name || "Project"} sections</p>
            </div>
            <div className={styles.moduleList}>
              {dashboardTabs.map((tab, index) => (
                <button
                  key={tab.key}
                  type="button"
                  className={activeTab.key === tab.key ? styles.moduleButtonActive : styles.moduleButton}
                  onClick={() => handleSectionChange(tab.key)}
                  style={{ "--module-color": tab.color }}
                >
                  <span className={styles.moduleIndex}>{String(index + 1).padStart(2, "0")}</span>
                  <span>
                    <strong>{tab.label}</strong>
                    <small>{tab.subtitle}</small>
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <main className={`${styles.fallbackPanel} ${styles.fallbackMain}`}>
            <header className={styles.contentWallHeader} style={{ "--module-color": activeTab.color }}>
              <div>
                <span>Selected Module</span>
                <h1>{activeTab.label}</h1>
              </div>
              <div className={styles.contentMeta}>
                <span>{viewModeLabel}</span>
                <span>{sprint?.name || "No sprint"}</span>
              </div>
            </header>
            <div className={styles.fallbackContent}>
              {sectionContent(activeTab.key)}
            </div>
          </main>

          <aside className={`${styles.fallbackPanel} ${styles.fallbackSide}`}>
            <div className={styles.wallHeader}>
              <span>Sprint Control</span>
              <h2>Sprint Manager</h2>
              <p>{sprintRangeLabel}</p>
            </div>
            <div className={styles.controlGrid}>
              <div>
                <small>Working Days</small>
                <strong>{workingDaysCount}</strong>
              </div>
              <div>
                <small>Project Crew</small>
                <strong>{project?.users?.length || 0}</strong>
              </div>
            </div>
            {project?.qa_mode_enabled ? (
              <div className={styles.modeSwitch}>
                {VIEW_MODES.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={viewMode === mode ? styles.modeActive : ""}
                    onClick={() => setViewMode(mode)}
                  >
                    {mode === "qa" ? "QA" : mode === "combined" ? "Combined" : "Dev"}
                  </button>
                ))}
              </div>
            ) : (
              <div className={styles.modeBadge}>Dev mode</div>
            )}
            <div className={styles.sprintManagerWrap}>
              <SprintManager
                onSprintChange={handleSprintChange}
                projectId={projectId}
                projectName={project?.name}
                selectedDate={selectedDate}
                sprintId={sprintId}
                isVisible
              />
            </div>
            <div className={styles.fallbackChatPanel}>
              <div className={styles.wallHeader}>
                <span>Team Chat</span>
                <h2>Chat</h2>
                <p>Project conversation</p>
              </div>
              <div className={styles.chatEmbed}>
                <Chat embedded />
              </div>
            </div>
          </aside>
        </div>
      </div>
    );
  }

  if (!threeModules) {
    return <PageLoader title="Project metaverse" message="Loading 3D engine..." />;
  }

  return (
    <div ref={shellRef} className={styles.metaverseShell}>
      <canvas ref={canvasRef} className={styles.roomCanvas} aria-label="Project metaverse room" />

      {wallHosts?.modules
        ? createPortal(
            <div className={styles.moduleWallInner} data-wall-interactive="true">
              <div className={styles.wallHeader}>
                <span>Project Modules</span>
                <h2>Modules</h2>
                <p>{project.name || "Project"} sections</p>
              </div>
              <div className={styles.moduleList} data-wall-scroll="true">
                {dashboardTabs.map((tab, index) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={activeTab.key === tab.key ? styles.moduleButtonActive : styles.moduleButton}
                    onClick={() => handleSectionChange(tab.key)}
                    style={{ "--module-color": tab.color }}
                  >
                    <span className={styles.moduleIndex}>{String(index + 1).padStart(2, "0")}</span>
                    <span>
                      <strong>{tab.label}</strong>
                      <small>{tab.subtitle}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>,
            wallHosts.modules
          )
        : null}

      {wallHosts?.content
        ? createPortal(
            <div className={styles.contentWallInner} data-wall-interactive="true">
              <header className={styles.contentWallHeader} style={{ "--module-color": activeTab.color }}>
                <div>
                  <span>Selected Module</span>
                  <h1>{activeTab.label}</h1>
                </div>
                <div className={styles.contentMeta}>
                  <span>{viewModeLabel}</span>
                  <span>{sprint?.name || "No sprint"}</span>
                </div>
              </header>
              <div className={styles.contentViewport} data-wall-scroll="true">
                <div className={styles.contentStack}>
                  {dashboardTabs.filter((tab) => mountedSections.has(tab.key)).map((tab) => (
                    <section
                      key={tab.key}
                      data-metaverse-section={tab.key}
                      className={tab.key === activeSection ? styles.contentPaneActive : styles.contentPane}
                      aria-hidden={tab.key !== activeSection}
                    >
                      {sectionContent(tab.key)}
                    </section>
                  ))}
                </div>
              </div>
            </div>,
            wallHosts.content
          )
        : null}

      {wallHosts?.controls
        ? createPortal(
            <div className={styles.controlWallInner} data-wall-interactive="true">
              <div className={styles.wallHeader}>
                <span>Sprint Control</span>
                <h2>Sprint Manager</h2>
                <p>{sprintRangeLabel}</p>
              </div>
              <div className={styles.controlGrid}>
                <div>
                  <small>Working Days</small>
                  <strong>{workingDaysCount}</strong>
                </div>
                <div>
                  <small>Project Crew</small>
                  <strong>{project?.users?.length || 0}</strong>
                </div>
              </div>
              {project?.qa_mode_enabled ? (
                <div className={styles.modeSwitch}>
                  {VIEW_MODES.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={viewMode === mode ? styles.modeActive : ""}
                      onClick={() => setViewMode(mode)}
                    >
                      {mode === "qa" ? "QA" : mode === "combined" ? "Combined" : "Dev"}
                    </button>
                  ))}
                </div>
              ) : (
                <div className={styles.modeBadge}>Dev mode</div>
              )}
              <div className={styles.sprintManagerWrap} data-wall-scroll="true">
                <SprintManager
                  onSprintChange={handleSprintChange}
                  projectId={projectId}
                  projectName={project?.name}
                  selectedDate={selectedDate}
                  sprintId={sprintId}
                  isVisible
                />
              </div>
            </div>,
            wallHosts.controls
          )
        : null}

      {wallHosts?.chat ? createPortal(<ChatWall />, wallHosts.chat) : null}
    </div>
  );
}
