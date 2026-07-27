import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-hot-toast";
import { FiExternalLink, FiMove, FiPlus, FiSave, FiTrash2, FiUpload } from "react-icons/fi";
import {
  createPortfolioFeature,
  createPortfolioProject,
  deletePortfolioFeature,
  deletePortfolioProject,
  fetchPortfolioAdmin,
  updatePortfolioFeature,
  updatePortfolioOrder,
  updatePortfolioProfile,
  updatePortfolioProject,
} from "../components/api";

const listText = (value) => (Array.isArray(value) ? value.join("\n") : "");
const parseList = (value) => value.split("\n").map((item) => item.trim()).filter(Boolean);

const appendList = (formData, key, values) => {
  parseList(values).forEach((value) => formData.append(`${key}[]`, value));
};

const emptyProject = {
  title: "",
  slug: "",
  tagline: "",
  summary: "",
  description: "",
  repository_url: "",
  live_url: "",
  stack: "",
  metrics: "",
  engineering_highlights: "",
  problem: "",
  role: "",
  constraints: "",
  decisions: "",
  trade_offs: "",
  outcomes: "",
  seo_title: "",
  seo_description: "",
  canonical_path: "/",
  position: 0,
  featured: false,
  published: false,
};

const PortfolioAdmin = () => {
  const [profile, setProfile] = useState(null);
  const [projects, setProjects] = useState([]);
  const [projectDraft, setProjectDraft] = useState(emptyProject);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [featureDraft, setFeatureDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [draggedProjectId, setDraggedProjectId] = useState(null);
  const [draggedFeatureId, setDraggedFeatureId] = useState(null);

  const load = async () => {
    const { data } = await fetchPortfolioAdmin();
    setProfile(data.profile ? {
      ...data.profile,
      skills: listText(data.profile.skills),
      metrics: listText(data.profile.metrics),
      architecture: listText(data.profile.architecture),
      engineering_highlights: listText(data.profile.engineering_highlights),
      social_links: data.profile.social_links || {},
    } : null);
    const nextProjects = data.projects || [];
    setProjects(nextProjects);
    const selected = nextProjects.find((project) => project.id === selectedProjectId) || nextProjects[0];
    if (selected) selectProject(selected);
  };

  useEffect(() => {
    load().catch(() => toast.error("Portfolio editor could not be loaded."));
  }, []);

  const selectProject = (project) => {
    setSelectedProjectId(project.id);
    setProjectDraft({
      ...emptyProject,
      ...project,
      stack: listText(project.stack),
      metrics: listText(project.metrics),
      engineering_highlights: listText(project.engineering_highlights),
      problem: project.case_study?.problem || "",
      role: project.case_study?.role || "",
      constraints: listText(project.case_study?.constraints),
      decisions: listText(project.case_study?.decisions),
      trade_offs: listText(project.case_study?.trade_offs),
      outcomes: listText(project.case_study?.outcomes),
      seo_title: project.seo?.title || "",
      seo_description: project.seo?.description || "",
      canonical_path: project.seo?.canonical_path || "/",
    });
    setFeatureDraft(null);
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const formData = new FormData();
      ["full_name", "headline", "location", "summary"].forEach((key) => formData.append(`portfolio_profile[${key}]`, profile[key] || ""));
      formData.append("portfolio_profile[published]", profile.published ? "1" : "0");
      appendList(formData, "portfolio_profile[skills]", profile.skills);
      appendList(formData, "portfolio_profile[metrics]", profile.metrics);
      appendList(formData, "portfolio_profile[architecture]", profile.architecture);
      appendList(formData, "portfolio_profile[engineering_highlights]", profile.engineering_highlights);
      Object.entries(profile.social_links || {}).forEach(([key, value]) => formData.append(`portfolio_profile[social_links][${key}]`, value || ""));
      if (profile.avatarFile) formData.append("portfolio_profile[avatar]", profile.avatarFile);
      if (profile.resumeFile) formData.append("portfolio_profile[resume]", profile.resumeFile);
      await updatePortfolioProfile(formData);
      toast.success("Portfolio profile saved.");
      await load();
    } catch {
      toast.error("Profile could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const saveProject = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const formData = new FormData();
      ["title", "slug", "tagline", "summary", "description", "repository_url", "live_url", "position"].forEach((key) => formData.append(`portfolio_project[${key}]`, projectDraft[key] ?? ""));
      formData.append("portfolio_project[featured]", projectDraft.featured ? "1" : "0");
      formData.append("portfolio_project[published]", projectDraft.published ? "1" : "0");
      appendList(formData, "portfolio_project[stack]", projectDraft.stack);
      appendList(formData, "portfolio_project[metrics]", projectDraft.metrics);
      appendList(formData, "portfolio_project[engineering_highlights]", projectDraft.engineering_highlights);
      ["problem", "role"].forEach((key) => {
        formData.append(`portfolio_project[case_study][${key}]`, projectDraft[key] || "");
      });
      ["constraints", "decisions", "trade_offs", "outcomes"].forEach((key) => {
        appendList(formData, `portfolio_project[case_study][${key}]`, projectDraft[key] || "");
      });
      formData.append("portfolio_project[seo][title]", projectDraft.seo_title || "");
      formData.append("portfolio_project[seo][description]", projectDraft.seo_description || "");
      formData.append("portfolio_project[seo][canonical_path]", projectDraft.canonical_path || "/");
      if (projectDraft.coverFile) formData.append("portfolio_project[cover_image]", projectDraft.coverFile);
      const response = selectedProjectId
        ? await updatePortfolioProject(selectedProjectId, formData)
        : await createPortfolioProject(formData);
      toast.success("Portfolio project saved.");
      setSelectedProjectId(response.data.id);
      await load();
    } catch {
      toast.error("Project could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const saveFeature = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const formData = new FormData();
      ["category", "title", "summary", "demo_path", "alt_text", "position", "tour_position", "review_notes"].forEach((key) => formData.append(`portfolio_feature[${key}]`, featureDraft[key] ?? ""));
      formData.append("portfolio_feature[published]", featureDraft.published ? "1" : "0");
      if (featureDraft.screenshotFile) formData.append("portfolio_feature[screenshot]", featureDraft.screenshotFile);
      if (featureDraft.id) await updatePortfolioFeature(featureDraft.id, formData);
      else await createPortfolioFeature(selectedProjectId, formData);
      toast.success("Feature saved.");
      setFeatureDraft(null);
      await load();
    } catch {
      toast.error("Feature could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const selectedProject = projects.find((project) => project.id === selectedProjectId);

  const persistOrder = async (nextProjects, nextFeatures = selectedProject?.features || []) => {
    setBusy(true);
    try {
      await updatePortfolioOrder({
        projects: nextProjects.map((project, index) => ({ id: project.id, position: index + 1 })),
        features: nextFeatures.map((feature, index) => ({
          id: feature.id,
          position: index + 1,
          tour_position: index + 1,
        })),
      });
      toast.success("Display order updated.");
      await load();
    } catch {
      toast.error("Display order could not be updated.");
    } finally {
      setBusy(false);
    }
  };

  const reorder = (items, draggedId, targetId) => {
    const from = items.findIndex((item) => item.id === draggedId);
    const to = items.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0 || from === to) return items;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  };

  if (!profile) {
    return <div className="mx-auto max-w-5xl p-8 text-slate-600">Loading portfolio editor...</div>;
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-blue-700">Site Administration</p>
          <h1 className="mt-2 text-[clamp(2rem,8vw,2.5rem)] font-semibold tracking-[-0.05em] text-slate-950 sm:text-4xl">Portfolio editor</h1>
        </div>
        <Link to="/" target="_blank" className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 font-semibold text-white">
          Preview site <FiExternalLink />
        </Link>
      </div>

      <form onSubmit={saveProfile} className="mt-8 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:rounded-[30px] sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-slate-950">Profile and homepage</h2>
          <button disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 font-semibold text-white"><FiSave /> Save profile</button>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {[
            ["full_name", "Full name"],
            ["headline", "Headline"],
            ["location", "Location"],
            ["github", "GitHub URL"],
            ["linkedin", "LinkedIn URL"],
            ["website", "Website URL"],
          ].map(([key, label]) => (
            <label key={key} className="text-sm font-semibold text-slate-700">
              {label}
              <input
                value={["github", "linkedin", "website"].includes(key) ? profile.social_links?.[key] || "" : profile[key] || ""}
                onChange={(event) => {
                  if (["github", "linkedin", "website"].includes(key)) {
                    setProfile((current) => ({ ...current, social_links: { ...current.social_links, [key]: event.target.value } }));
                  } else setProfile((current) => ({ ...current, [key]: event.target.value }));
                }}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
              />
            </label>
          ))}
        </div>
        <label className="mt-4 block text-sm font-semibold text-slate-700">Summary
          <textarea value={profile.summary || ""} onChange={(event) => setProfile((current) => ({ ...current, summary: event.target.value }))} rows={4} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
        </label>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {[
            ["skills", "Skills, one per line"],
            ["metrics", "Metrics, one per line"],
            ["architecture", "Architecture, one per line"],
            ["engineering_highlights", "Engineering highlights, one per line"],
          ].map(([key, label]) => (
            <label key={key} className="text-sm font-semibold text-slate-700">{label}
              <textarea value={profile[key] || ""} onChange={(event) => setProfile((current) => ({ ...current, [key]: event.target.value }))} rows={5} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
            </label>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-5">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold"><FiUpload /> Avatar<input type="file" accept="image/*" className="hidden" onChange={(event) => setProfile((current) => ({ ...current, avatarFile: event.target.files[0] }))} /></label>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold"><FiUpload /> Resume PDF<input type="file" accept="application/pdf" className="hidden" onChange={(event) => setProfile((current) => ({ ...current, resumeFile: event.target.files[0] }))} /></label>
          <label className="inline-flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={Boolean(profile.published)} onChange={(event) => setProfile((current) => ({ ...current, published: event.target.checked }))} /> Published</label>
        </div>
      </form>

      <section className="mt-8 grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="rounded-[28px] border border-slate-200 bg-white p-4">
          <button onClick={() => { setSelectedProjectId(null); setProjectDraft(emptyProject); }} className="flex w-full items-center gap-2 rounded-xl bg-blue-50 px-3 py-2.5 font-semibold text-blue-700"><FiPlus /> New project</button>
          <div className="mt-3 space-y-1">
            {projects.map((project) => (
              <button
                key={project.id}
                draggable
                onDragStart={() => setDraggedProjectId(project.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => persistOrder(reorder(projects, draggedProjectId, project.id))}
                onClick={() => selectProject(project)}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${selectedProjectId === project.id ? "bg-slate-950 text-white" : "text-slate-700 hover:bg-slate-50"}`}
              >
                <FiMove className="shrink-0 opacity-50" />
                <span className="truncate">{project.title}</span>
                <span className="ml-auto text-[10px] uppercase opacity-60">{project.published ? "Live" : "Draft"}</span>
              </button>
            ))}
          </div>
        </aside>

        <form onSubmit={saveProject} className="rounded-[24px] border border-slate-200 bg-white p-4 sm:rounded-[30px] sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-semibold text-slate-950">{selectedProjectId ? "Edit project" : "New project"}</h2>
            <div className="flex gap-2">
              {selectedProjectId ? <button type="button" onClick={async () => { if (window.confirm("Delete this portfolio project?")) { await deletePortfolioProject(selectedProjectId); setSelectedProjectId(null); setProjectDraft(emptyProject); await load(); } }} className="rounded-full border border-rose-200 p-2.5 text-rose-600"><FiTrash2 /></button> : null}
              <button disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 font-semibold text-white"><FiSave /> Save project</button>
            </div>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {[
              ["title", "Title"], ["slug", "Slug"], ["tagline", "Tagline"], ["repository_url", "Repository URL"], ["live_url", "Live URL"], ["position", "Position"],
            ].map(([key, label]) => <label key={key} className="text-sm font-semibold text-slate-700">{label}<input type={key === "position" ? "number" : "text"} value={projectDraft[key] ?? ""} onChange={(event) => setProjectDraft((current) => ({ ...current, [key]: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>)}
          </div>
          {["summary", "description", "stack", "metrics", "engineering_highlights"].map((key) => <label key={key} className="mt-4 block text-sm font-semibold capitalize text-slate-700">{key.replaceAll("_", " ")}{["stack", "metrics", "engineering_highlights"].includes(key) ? " (one per line)" : ""}<textarea rows={key === "description" ? 4 : 3} value={projectDraft[key] || ""} onChange={(event) => setProjectDraft((current) => ({ ...current, [key]: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>)}
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="font-semibold text-slate-950">Structured case study</h3>
            {["problem", "role", "constraints", "decisions", "trade_offs", "outcomes"].map((key) => (
              <label key={key} className="mt-4 block text-sm font-semibold capitalize text-slate-700">
                {key.replaceAll("_", " ")}{["constraints", "decisions", "trade_offs", "outcomes"].includes(key) ? " (one per line)" : ""}
                <textarea rows={3} value={projectDraft[key] || ""} onChange={(event) => setProjectDraft((current) => ({ ...current, [key]: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
            ))}
          </div>
          <div className="mt-6 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
            <h3 className="md:col-span-2 font-semibold text-slate-950">Search and social metadata</h3>
            {[["seo_title", "SEO title"], ["canonical_path", "Canonical path"]].map(([key, label]) => <label key={key} className="text-sm font-semibold text-slate-700">{label}<input value={projectDraft[key] || ""} onChange={(event) => setProjectDraft((current) => ({ ...current, [key]: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>)}
            <label className="text-sm font-semibold text-slate-700 md:col-span-2">SEO description<textarea rows={3} value={projectDraft.seo_description || ""} onChange={(event) => setProjectDraft((current) => ({ ...current, seo_description: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
          </div>
          <div className="mt-5 flex flex-wrap gap-5">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold"><FiUpload /> Cover image<input type="file" accept="image/*" className="hidden" onChange={(event) => setProjectDraft((current) => ({ ...current, coverFile: event.target.files[0] }))} /></label>
            <label className="inline-flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={Boolean(projectDraft.featured)} onChange={(event) => setProjectDraft((current) => ({ ...current, featured: event.target.checked }))} /> Featured</label>
            <label className="inline-flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={Boolean(projectDraft.published)} onChange={(event) => setProjectDraft((current) => ({ ...current, published: event.target.checked }))} /> Published</label>
            {projectDraft.cover_image_url ? <img src={projectDraft.cover_image_url} alt="" className="h-16 w-28 rounded-xl object-cover" /> : null}
          </div>

          {selectedProject ? (
            <div className="mt-8 border-t border-slate-200 pt-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">Feature gallery</h3>
                <button type="button" onClick={() => setFeatureDraft({ category: "", title: "", summary: "", demo_path: "/demo", alt_text: "", review_notes: "", position: (selectedProject.features?.length || 0) + 1, tour_position: (selectedProject.features?.length || 0) + 1, published: true })} className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white"><FiPlus /> Add feature</button>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {(selectedProject.features || []).map((feature) => <button type="button" draggable key={feature.id} onDragStart={() => setDraggedFeatureId(feature.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => persistOrder(projects, reorder(selectedProject.features, draggedFeatureId, feature.id))} onClick={() => setFeatureDraft(feature)} className="rounded-2xl border border-slate-200 p-4 text-left"><div className="flex items-center gap-2"><FiMove className="text-slate-400" /><p className="text-xs font-bold uppercase tracking-wider text-blue-700">{feature.category}</p><span className="ml-auto text-[10px] uppercase text-slate-400">{feature.published ? "Live" : "Draft"}</span></div><p className="mt-2 font-semibold">{feature.title}</p>{feature.screenshot_url ? <img src={feature.screenshot_url} alt="" className="mt-3 h-24 w-full rounded-xl object-cover" /> : null}</button>)}
              </div>
            </div>
          ) : null}
        </form>
      </section>

      {featureDraft ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <form onSubmit={saveFeature} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[24px] bg-white p-4 shadow-2xl sm:rounded-[28px] sm:p-6">
            <div className="flex items-center justify-between"><h2 className="text-2xl font-semibold">{featureDraft.id ? "Edit feature" : "New feature"}</h2><button type="button" onClick={() => setFeatureDraft(null)} className="rounded-full border p-2">×</button></div>
            {["category", "title", "demo_path", "alt_text", "position", "tour_position"].map((key) => <label key={key} className="mt-4 block text-sm font-semibold capitalize">{key.replaceAll("_", " ")}<input type={["position", "tour_position"].includes(key) ? "number" : "text"} value={featureDraft[key] ?? ""} onChange={(event) => setFeatureDraft((current) => ({ ...current, [key]: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>)}
            <label className="mt-4 block text-sm font-semibold">Summary<textarea rows={4} value={featureDraft.summary || ""} onChange={(event) => setFeatureDraft((current) => ({ ...current, summary: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
            <label className="mt-4 block text-sm font-semibold">What to notice<textarea rows={3} value={featureDraft.review_notes || ""} onChange={(event) => setFeatureDraft((current) => ({ ...current, review_notes: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label>
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold"><FiUpload /> Screenshot<input type="file" accept="image/*" className="hidden" onChange={(event) => setFeatureDraft((current) => ({ ...current, screenshotFile: event.target.files[0] }))} /></label>
              <label className="inline-flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={Boolean(featureDraft.published)} onChange={(event) => setFeatureDraft((current) => ({ ...current, published: event.target.checked }))} /> Published</label>
              {featureDraft.id ? <button type="button" onClick={async () => { await deletePortfolioFeature(featureDraft.id); setFeatureDraft(null); await load(); }} className="ml-auto inline-flex items-center gap-2 text-sm font-semibold text-rose-600"><FiTrash2 /> Delete</button> : null}
              <button disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 font-semibold text-white"><FiSave /> Save feature</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
};

export default PortfolioAdmin;
