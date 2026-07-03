import React, { useContext, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import {
  FiArrowDown,
  FiArrowUpRight,
  FiCheck,
  FiCode,
  FiDownload,
  FiGithub,
  FiLayers,
  FiLinkedin,
  FiMail,
  FiMapPin,
  FiMenu,
  FiSend,
  FiShield,
  FiX,
} from "react-icons/fi";
import { AuthContext } from "../context/AuthContext";
import { fetchPortfolio, sendContact } from "../components/api";
import LoopingVideo from "../components/ui/LoopingVideo";
import { runtimeOrBuildValue } from "../config/runtime";
import nexusProductPoster from "../images/nexus/nexus-product-poster.webp";

const RECAPTCHA_SITE_KEY = runtimeOrBuildValue(
  "nexus-recaptcha-site-key",
  import.meta.env.VITE_RECAPTCHA_SITE_KEY
);
const NEXUS_PRODUCT_LOOP_WEBM = "/media/nexus/nexus-product-loop.webm";
const NEXUS_PRODUCT_LOOP_MP4 = "/media/nexus/nexus-product-loop.mp4";

const fallbackProfile = {
  full_name: "Divyarajsinh Solanki",
  headline: "Full-stack engineer building practical Rails and React products",
  location: "India",
  summary: "I build product-focused web applications from database modeling and secure APIs through responsive interfaces, realtime collaboration, integrations, and deployment.",
  skills: ["Ruby on Rails", "React", "PostgreSQL", "JavaScript", "REST APIs", "Tailwind CSS"],
  metrics: ["Rails 8.0 + React 18", "35+ API controllers", "20+ product surfaces", "Realtime collaboration"],
  architecture: ["React and Vite client", "Rails JSON API", "PostgreSQL data model", "Action Cable and background jobs"],
  engineering_highlights: ["Workspace authorization", "Project delivery workflows", "Realtime chat", "Calendar reminders", "PDF processing"],
  social_links: { github: "https://github.com/Divyarajsinhsolanki" },
};

const fallbackProject = {
  title: "Nexus Hub",
  tagline: "A connected workspace for planning, delivery, collaboration, knowledge, and document workflows.",
  summary: "Nexus Hub is a full-stack Rails and React product that brings project operations, personal productivity, team communication, learning tools, and PDF workflows into one application.",
  stack: ["Ruby 3.3", "Rails 8.0", "React 18", "Vite 6", "PostgreSQL", "Tailwind CSS"],
  repository_url: "https://github.com/Divyarajsinhsolanki/rails_vite",
  engineering_highlights: fallbackProfile.engineering_highlights,
  case_study: {
    problem: "Teams often split project delivery, planning, communication, learning, and document work across disconnected tools.",
    role: "Designed and implemented the Rails domain model, APIs, React product surfaces, authorization, realtime workflows, and deployment setup.",
    constraints: ["Protect tenant data", "Keep a broad product understandable", "Offer a safe public demo"],
    decisions: ["Workspace-scoped Rails APIs", "Synthetic read-only demo workspace", "Route-level loading for heavy features"],
    trade_offs: ["A broad product requires stronger navigation and testing discipline"],
    outcomes: ["One connected workspace", "One-click technical review", "Production-oriented deployment"],
  },
  features: [
    ["Project Delivery", "Projects, Sprints, and Quality", "/projects"],
    ["Planning and Focus", "Calendar and Daily Momentum", "/momentum"],
    ["Collaboration", "Teams, Posts, and Real-time Chat", "/posts"],
    ["Knowledge", "Knowledge and Learning Grid", "/knowledge"],
    ["Documents", "PDF Master Workflows", "/pdf-master"],
    ["Platform", "Full-stack Product Engineering", "/demo#architecture"],
  ].map(([category, title, demo_path], index) => ({
    id: `fallback-${index}`,
    category,
    title,
    demo_path,
    position: index + 1,
    alt_text: `${title} in Nexus Hub`,
    summary: "Explore this product area through the guided read-only workspace and inspect the real application screens.",
  })),
};

const navItems = [
  ["About", "about"],
  ["Case Study", "case-study"],
  ["Decisions", "decisions"],
  ["Features", "features"],
  ["Architecture", "architecture"],
  ["Contact", "contact"],
];

const ContactForm = () => {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [status, setStatus] = useState(null);
  const [ready, setReady] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!RECAPTCHA_SITE_KEY) return undefined;
    if (window.grecaptcha?.execute) {
      setReady(true);
      return undefined;
    }

    const existing = document.querySelector('script[data-portfolio-recaptcha="true"]');
    if (existing) {
      existing.addEventListener("load", () => setReady(true), { once: true });
      return undefined;
    }

    const script = document.createElement("script");
    script.dataset.portfolioRecaptcha = "true";
    script.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
    script.async = true;
    script.onload = () => setReady(true);
    document.body.appendChild(script);
    return undefined;
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setSending(true);
    setStatus(null);

    try {
      if (!RECAPTCHA_SITE_KEY || !window.grecaptcha?.execute) throw new Error("Contact form is not configured yet.");
      const recaptchaToken = await window.grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: "contact_form_submit" });
      await sendContact({ ...form, recaptcha_token: recaptchaToken });
      setForm({ name: "", email: "", message: "" });
      setStatus({ type: "success", text: "Message sent. I will reply as soon as possible." });
    } catch (error) {
      setStatus({ type: "error", text: error.response?.data?.errors?.join(", ") || error.message || "Message could not be sent." });
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-[30px] border border-white/10 bg-white/5 p-5 sm:p-7">
      <div className="grid gap-4 sm:grid-cols-2">
        <input
          aria-label="Name"
          required
          placeholder="Your name"
          value={form.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-cyan-300"
        />
        <input
          aria-label="Email"
          required
          type="email"
          placeholder="Email address"
          value={form.email}
          onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
          className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-cyan-300"
        />
      </div>
      <textarea
        aria-label="Message"
        required
        rows={5}
        placeholder="Tell me about the role or project"
        value={form.message}
        onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
        className="mt-4 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-cyan-300"
      />
      <button
        type="submit"
        disabled={!ready || sending}
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-cyan-300 px-5 py-3 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <FiSend /> {sending ? "Sending..." : "Send message"}
      </button>
      {!RECAPTCHA_SITE_KEY ? <p className="mt-3 text-sm text-amber-300">Configure reCAPTCHA to enable this form.</p> : null}
      {status ? <p className={`mt-3 text-sm ${status.type === "success" ? "text-emerald-300" : "text-rose-300"}`}>{status.text}</p> : null}
    </form>
  );
};

const PublicPortfolio = () => {
  const navigate = useNavigate();
  const { handleDemoLogin } = useContext(AuthContext);
  const [data, setData] = useState({ profile: fallbackProfile, projects: [fallbackProject], seo: {} });
  const [menuOpen, setMenuOpen] = useState(false);
  const [demoLoading, setDemoLoading] = useState("");
  const [demoError, setDemoError] = useState("");

  useEffect(() => {
    fetchPortfolio()
      .then(({ data: payload }) => {
        setData({
          profile: payload?.profile || fallbackProfile,
          projects: Array.isArray(payload?.projects) && payload.projects.length ? payload.projects : [fallbackProject],
          seo: payload?.seo || {},
        });
      })
      .catch(() => setData((current) => current));
  }, []);

  const profile = data.profile || fallbackProfile;
  const project = data.projects[0];
  const features = project?.features || [];
  const socialLinks = profile.social_links || {};
  const caseStudy = project?.case_study || fallbackProject.case_study;
  const seo = data.seo || {};
  const browserUrl = typeof window === "undefined" ? "http://localhost:3000/" : window.location.href;
  const browserOrigin = typeof window === "undefined" ? "http://localhost:3000" : window.location.origin;
  const initials = profile.full_name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("");
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: profile.full_name,
    jobTitle: "Full-stack Rails and React Engineer",
    url: seo.canonical_url || browserOrigin,
    sameAs: [socialLinks.github, socialLinks.linkedin].filter(Boolean),
    knowsAbout: profile.skills || [],
    hasPart: {
      "@type": "SoftwareApplication",
      name: project?.title || "Nexus Hub",
      applicationCategory: "BusinessApplication",
      description: project?.summary || profile.summary,
    },
  };

  const groupedFeatures = useMemo(
    () => [...features].sort((a, b) => (a.position || 0) - (b.position || 0)),
    [features]
  );

  const openDemo = async (path = "/demo") => {
    setDemoError("");
    setDemoLoading(path);
    try {
      await handleDemoLogin(path);
    } catch (error) {
      setDemoError(error.response?.data?.error === "demo_disabled" ? "The live demo is not enabled on this deployment." : "The demo could not be started.");
    } finally {
      setDemoLoading("");
    }
  };

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMenuOpen(false);
  };

  return (
    <div className="min-h-dvh overflow-hidden bg-[#07111f] text-white">
      <Helmet>
        <title>{seo.title || `${profile.full_name} | Full-stack Rails and React Engineer`}</title>
        <meta name="description" content={seo.description || profile.summary} />
        <link rel="canonical" href={seo.canonical_url || browserUrl} />
        <meta property="og:title" content={seo.title || `${profile.full_name} | Full-stack Engineer`} />
        <meta property="og:description" content={seo.description || project?.summary || profile.summary} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={seo.canonical_url || browserUrl} />
        <meta name="twitter:card" content="summary_large_image" />
        {seo.image_url || project?.cover_image_url ? <meta property="og:image" content={seo.image_url || project.cover_image_url} /> : null}
        <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
      </Helmet>

      <div className="pointer-events-none fixed inset-0 opacity-50" aria-hidden="true">
        <div className="absolute -left-32 -top-32 h-[34rem] w-[34rem] rounded-full bg-cyan-400/20 blur-[130px]" />
        <div className="absolute right-[-12rem] top-[28%] h-[30rem] w-[30rem] rounded-full bg-blue-600/20 blur-[130px]" />
      </div>

      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07111f]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 sm:px-8">
          <button onClick={() => scrollTo("top")} className="flex items-center gap-3 text-left">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-300 font-black text-slate-950">{initials}</span>
            <span>
              <span className="block text-sm font-semibold">{profile.full_name}</span>
              <span className="block text-xs text-slate-400">Full-stack engineer</span>
            </span>
          </button>
          <nav className="hidden items-center gap-5 md:flex">
            {navItems.map(([label, id]) => (
              <button key={id} onClick={() => scrollTo(id)} className="text-sm font-medium text-slate-300 hover:text-white">{label}</button>
            ))}
            <button onClick={() => navigate("/login")} className="text-sm font-semibold text-slate-300">Workspace login</button>
            <button onClick={() => openDemo("/demo")} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950">Live demo</button>
          </nav>
          <button className="rounded-xl border border-white/10 p-2 md:hidden" onClick={() => setMenuOpen((value) => !value)} aria-label="Toggle navigation">
            {menuOpen ? <FiX /> : <FiMenu />}
          </button>
        </div>
        {menuOpen ? (
          <nav className="border-t border-white/10 px-5 py-4 md:hidden">
            {navItems.map(([label, id]) => (
              <button key={id} onClick={() => scrollTo(id)} className="block w-full py-2 text-left text-slate-200">{label}</button>
            ))}
            <button onClick={() => navigate("/login")} className="block w-full py-2 text-left text-slate-200">Workspace login</button>
            <button onClick={() => openDemo("/demo")} className="mt-2 block w-full rounded-full bg-white px-4 py-2 text-left font-semibold text-slate-950">Live demo</button>
          </nav>
        ) : null}
      </header>

      <main id="top" className="relative">
        <section className="mx-auto grid min-h-[calc(100dvh-4.25rem)] max-w-7xl items-center gap-10 px-5 py-12 sm:px-8 sm:py-14 lg:grid-cols-[1.25fr_0.75fr] lg:py-16">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-200">
              <FiCode /> Rails, React, PostgreSQL
            </p>
            <h1 className="mt-6 max-w-5xl text-4xl font-semibold leading-[1.04] sm:text-5xl lg:text-[4.55rem] xl:text-[4.85rem]">
              I build full-stack products that solve real workflow problems.
            </h1>
            <p className="mt-6 max-w-3xl text-base leading-8 text-slate-300 sm:text-lg">{profile.summary}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={() => openDemo("/demo")} className="inline-flex items-center gap-2 rounded-full bg-cyan-300 px-6 py-3.5 font-semibold text-slate-950">
                {demoLoading ? "Starting demo..." : "Explore Nexus Hub"} <FiArrowUpRight />
              </button>
              <button onClick={() => scrollTo("case-study")} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-3.5 font-semibold">
                Read case study <FiArrowDown />
              </button>
              {profile.resume_url ? (
                <a href={profile.resume_url} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-3.5 font-semibold">
                  Resume <FiDownload />
                </a>
              ) : null}
            </div>
            {demoError ? <p className="mt-4 text-amber-300">{demoError}</p> : null}
          </div>
          <div className="relative mx-auto w-full max-w-sm lg:max-w-md">
            <div className="absolute inset-0 rotate-6 rounded-[42px] bg-gradient-to-br from-cyan-300 to-blue-600 opacity-70 blur-sm" />
            <div className="relative rounded-[32px] border border-white/10 bg-slate-900/90 p-6 shadow-2xl sm:p-7">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={`${profile.full_name} portrait`} className="aspect-square w-full rounded-[24px] object-cover" />
              ) : (
                <div className="flex aspect-square items-center justify-center rounded-[24px] bg-gradient-to-br from-slate-800 to-slate-950 text-6xl font-semibold text-cyan-300 sm:text-7xl">{initials}</div>
              )}
              <div className="mt-6 flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold">{profile.full_name}</p>
                  <p className="mt-1 inline-flex items-center gap-2 text-sm text-slate-400"><FiMapPin /> {profile.location}</p>
                </div>
                <span className="rounded-full bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">Open to opportunities</span>
              </div>
            </div>
          </div>
        </section>

        <section id="about" className="border-y border-white/10 bg-white/[0.03]">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[0.75fr_1.25fr] lg:py-16">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-300">About</p>
              <h2 className="mt-4 text-3xl font-semibold leading-tight sm:text-4xl">Product thinking with full-stack execution.</h2>
            </div>
            <div>
              <p className="text-base leading-8 text-slate-300 sm:text-lg">{profile.headline}. My work covers data modeling, API design, authorization, complex UI state, realtime behavior, background processing, integrations, and deployment.</p>
              <div className="mt-8 flex flex-wrap gap-2">
                {(profile.skills || []).map((skill) => <span key={skill} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200">{skill}</span>)}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-12 sm:px-8 lg:py-14">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(profile.metrics || []).map((metric) => (
              <div key={metric} className="rounded-[26px] border border-white/10 bg-white/5 p-6">
                <FiCheck className="text-cyan-300" />
                <p className="mt-6 text-xl font-semibold">{metric}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="case-study" className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:py-16">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-300">Flagship Case Study</p>
              <h2 className="mt-4 text-4xl font-semibold leading-tight">{project?.title || "Nexus Hub"}</h2>
              <p className="mt-5 text-lg leading-8 text-slate-300">{project?.tagline || "One connected workspace for product delivery and personal productivity."}</p>
              <div className="mt-7 flex flex-wrap gap-2">
                {(project?.stack || profile.skills || []).map((item) => <span key={item} className="rounded-full bg-cyan-300/10 px-3 py-1.5 text-sm text-cyan-200">{item}</span>)}
              </div>
            </div>
            <div className="space-y-5">
              <div className="rounded-[34px] border border-white/10 bg-gradient-to-br from-white/10 to-white/[0.03] p-7 sm:p-9">
                <p className="text-base leading-8 text-slate-200 sm:text-lg">{project?.summary || "Nexus Hub brings planning, delivery, communication, knowledge, and document tools into one Rails and React product."}</p>
                <p className="mt-5 leading-7 text-slate-400">{project?.description}</p>
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  {(project?.engineering_highlights || profile.engineering_highlights || []).map((item) => (
                    <div key={item} className="flex gap-3 rounded-2xl bg-slate-950/50 p-4 text-sm leading-6 text-slate-300"><FiShield className="mt-1 shrink-0 text-cyan-300" /> {item}</div>
                  ))}
                </div>
                <div className="mt-8 flex flex-wrap gap-3">
                  <button onClick={() => openDemo("/demo")} className="rounded-full bg-white px-5 py-3 font-semibold text-slate-950">Start guided demo</button>
                  {project?.repository_url ? <a href={project.repository_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 font-semibold"><FiGithub /> View code</a> : null}
                </div>
              </div>
              <div className="overflow-hidden rounded-[30px] border border-cyan-300/12 bg-slate-950 shadow-2xl shadow-cyan-950/30">
                <LoopingVideo
                  srcWebm={NEXUS_PRODUCT_LOOP_WEBM}
                  srcMp4={NEXUS_PRODUCT_LOOP_MP4}
                  poster={nexusProductPoster}
                  ariaLabel="Animated Nexus Hub workspace product overview"
                  className="aspect-video w-full object-cover"
                />
              </div>
            </div>
          </div>
        </section>

        <section id="decisions" className="border-y border-white/10 bg-white/[0.03]">
          <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:py-16">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-300">Engineering Decisions</p>
            <h2 className="mt-4 max-w-4xl text-3xl font-semibold leading-tight sm:text-4xl">
              The reasoning behind the product, not only the feature list.
            </h2>
            <div className="mt-10 grid gap-5 lg:grid-cols-2">
              <article className="rounded-[30px] border border-white/10 bg-slate-950/60 p-7">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Problem</p>
                <p className="mt-4 text-lg leading-8 text-slate-200">{caseStudy.problem}</p>
              </article>
              <article className="rounded-[30px] border border-white/10 bg-slate-950/60 p-7">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">My Role</p>
                <p className="mt-4 text-lg leading-8 text-slate-200">{caseStudy.role}</p>
              </article>
              {[
                ["Constraints", caseStudy.constraints],
                ["Technical Decisions", caseStudy.decisions],
                ["Trade-offs", caseStudy.trade_offs],
                ["Outcomes", caseStudy.outcomes],
              ].map(([title, items]) => (
                <article key={title} className="rounded-[30px] border border-white/10 bg-white/5 p-7">
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">{title}</p>
                  <ul className="mt-5 space-y-3">
                    {(items || []).map((item) => (
                      <li key={item} className="flex gap-3 leading-7 text-slate-300">
                        <FiCheck className="mt-1 shrink-0 text-cyan-300" aria-hidden="true" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="border-y border-white/10 bg-white/[0.03]">
          <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:py-16">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-300">Feature Map</p>
            <h2 className="mt-4 max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl">A large product, organized for a fast technical review.</h2>
            <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {groupedFeatures.map((feature, index) => (
                <button key={feature.id || feature.title} onClick={() => openDemo(feature.demo_path || "/demo")} className="group overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/60 text-left">
                  {feature.screenshot_url ? (
                    <img src={feature.screenshot_url} alt={feature.alt_text || feature.title} loading="lazy" className="aspect-[16/10] w-full object-cover" />
                  ) : (
                    <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-cyan-950">
                      <div className="absolute inset-5 rounded-2xl border border-cyan-200/15 bg-white/5" />
                      <FiLayers className="relative text-5xl text-cyan-300/70" />
                    </div>
                  )}
                  <div className="p-6">
                    <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">0{index + 1} / {feature.category}</p>
                    <h3 className="mt-3 text-xl font-semibold leading-snug sm:text-2xl">{feature.title}</h3>
                    <p className="mt-3 leading-7 text-slate-400">{feature.summary}</p>
                    {feature.review_notes ? (
                      <p className="mt-4 rounded-2xl border border-cyan-300/10 bg-cyan-300/5 p-3 text-sm leading-6 text-cyan-100">
                        <span className="font-semibold">What to notice:</span> {feature.review_notes}
                      </p>
                    ) : null}
                    <span className="mt-5 inline-flex items-center gap-2 font-semibold text-white">Open live screen <FiArrowUpRight className="transition group-hover:translate-x-1 group-hover:-translate-y-1" /></span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section id="architecture" className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:py-16">
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-300">Architecture</p>
              <h2 className="mt-4 text-3xl font-semibold leading-tight sm:text-4xl">Built across the complete application stack.</h2>
            </div>
            <div className="space-y-3">
              {(profile.architecture || []).map((item, index) => (
                <div key={item} className="flex items-center gap-5 rounded-2xl border border-white/10 bg-white/5 p-5">
                  <span className="text-sm font-bold text-cyan-300">0{index + 1}</span>
                  <span className="text-lg font-medium text-slate-200">{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-12 grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
            {[
              ["React + Vite", "Public portfolio and authenticated product UI"],
              ["Rails 8.0", "Authentication, authorization, APIs, jobs, storage, and realtime"],
              ["PostgreSQL + Redis + S3", "Tenant data, background work, streams, and durable media"],
            ].map(([title, description], index) => (
              <React.Fragment key={title}>
                <div className="rounded-[26px] border border-white/10 bg-white/5 p-6">
                  <p className="text-lg font-semibold text-white">{title}</p>
                  <p className="mt-3 leading-7 text-slate-400">{description}</p>
                </div>
                {index < 2 ? <div className="hidden items-center text-2xl text-cyan-300 md:flex" aria-hidden="true">→</div> : null}
              </React.Fragment>
            ))}
          </div>
        </section>

        <section id="contact" className="border-t border-white/10 bg-slate-950">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:py-16">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-300">Contact</p>
              <h2 className="mt-4 text-3xl font-semibold leading-tight sm:text-4xl">Let’s discuss the role and the problems you need solved.</h2>
              <div className="mt-7 flex flex-wrap gap-3">
                {socialLinks.github ? <a href={socialLinks.github} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2.5"><FiGithub /> GitHub</a> : null}
                {socialLinks.linkedin ? <a href={socialLinks.linkedin} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2.5"><FiLinkedin /> LinkedIn</a> : null}
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2.5 text-slate-300"><FiMail /> Contact form</span>
              </div>
            </div>
            <ContactForm />
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-[#07111f] px-5 py-7 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} {profile.full_name}. Built with Rails and React.
      </footer>
    </div>
  );
};

export default PublicPortfolio;
