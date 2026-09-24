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
import { runtimeMetaValue, runtimeOrBuildValue } from "../config/runtime";
import nexusProductPoster from "../images/nexus/nexus-product-poster.webp";

const RECAPTCHA_ENABLED = runtimeMetaValue("nexus-recaptcha-enabled") === "true";
const RECAPTCHA_SITE_KEY = RECAPTCHA_ENABLED
  ? runtimeOrBuildValue("nexus-recaptcha-site-key", import.meta.env.VITE_RECAPTCHA_SITE_KEY)
  : undefined;
const NEXUS_PRODUCT_LOOP_WEBM = "/media/nexus/nexus-product-loop.webm";
const NEXUS_PRODUCT_LOOP_MP4 = "/media/nexus/nexus-product-loop.mp4";

const fallbackProfile = {
  full_name: "Divyarajsinh Solanki",
  headline: "Full-stack engineer building practical Rails and React products",
  location: "India",
  summary: "I build product-focused web applications from database modeling and secure APIs through responsive interfaces, realtime collaboration, cloud deployment, CI/CD, DNS, email, storage, and production troubleshooting.",
  skills: ["Ruby on Rails", "React", "PostgreSQL", "AWS EB/EC2", "Route 53", "S3", "SES", "GitHub Actions", "AI-assisted development"],
  metrics: ["AWS production deploy", "GitHub CI/CD pipeline", "35+ API controllers", "20+ product surfaces"],
  architecture: ["React and Vite client", "Rails JSON API", "PostgreSQL data model", "AWS Elastic Beanstalk on EC2", "Route 53 DNS and HTTPS", "S3 assets and SES email", "GitHub Actions deployments", "AI-assisted delivery workflow"],
  engineering_highlights: ["Workspace authorization", "Project delivery workflows", "Realtime chat", "AWS deployment", "CI/CD", "Production troubleshooting"],
  social_links: { github: "https://github.com/Divyarajsinhsolanki" },
};

const fallbackProject = {
  title: "Nexus Hub",
  tagline: "A connected workspace for planning, delivery, collaboration, knowledge, documents, and production-ready cloud deployment.",
  summary: "Nexus Hub is a full-stack Rails and React product that brings project operations, productivity, team communication, learning tools, PDF workflows, and AWS deployment practice into one application.",
  stack: ["Ruby 3.3", "Rails 8.0", "React 18", "Vite 6", "PostgreSQL", "Redis", "AWS EB/EC2", "S3", "Route 53", "SES", "GitHub Actions"],
  repository_url: "https://github.com/Divyarajsinhsolanki/rails_vite",
  engineering_highlights: fallbackProfile.engineering_highlights,
  case_study: {
    problem: "Teams often split project delivery, planning, communication, learning, and document work across disconnected tools.",
    role: "Designed and implemented the Rails domain model, APIs, React product surfaces, authorization, realtime workflows, AWS deployment, DNS/SSL, SES email, S3 storage, CI/CD, and production debugging.",
    constraints: ["Protect tenant data", "Keep a broad product understandable", "Offer a safe public demo", "Keep the first AWS setup cost-conscious"],
    decisions: ["Workspace-scoped Rails APIs", "Synthetic read-only demo workspace", "AWS Elastic Beanstalk on EC2", "Route 53 DNS and HTTPS", "S3 assets, SES email, and GitHub Actions deploys", "AI-assisted code review and deployment debugging"],
    trade_offs: ["A broad product requires stronger navigation and testing discipline", "Single-server PostgreSQL and Redis reduce cost now but can move to managed AWS services later"],
    outcomes: ["One connected workspace", "One-click technical review", "Production AWS deployment", "Repeatable local-to-production DB restore workflow"],
  },
  features: [
    ["Project Delivery", "Projects, Sprints, and Quality", "/projects"],
    ["Planning and Focus", "Calendar and Daily Momentum", "/momentum"],
    ["Collaboration", "Teams, Posts, and Real-time Chat", "/posts"],
    ["Knowledge", "Knowledge and Learning Grid", "/knowledge"],
    ["Documents", "PDF Master Workflows", "/pdf-master"],
    ["Platform", "Cloud Deployment and Product Operations", "/demo#architecture"],
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
    <form onSubmit={submit} className="portfolio-depth-card portfolio-reveal portfolio-fly-right min-w-0 rounded-[24px] border border-white/10 bg-white/5 p-4 sm:rounded-[30px] sm:p-7">
      <div className="grid gap-4 sm:grid-cols-2">
        <input
          aria-label="Name"
          required
          placeholder="Your name"
          value={form.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-cyan-300"
        />
        <input
          aria-label="Email"
          required
          type="email"
          placeholder="Email address"
          value={form.email}
          onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
          className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-cyan-300"
        />
      </div>
      <textarea
        aria-label="Message"
        required
        rows={5}
        placeholder="Tell me about the role or project"
        value={form.message}
        onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
        className="mt-4 min-w-0 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-cyan-300"
      />
      <button
        type="submit"
        disabled={!ready || sending}
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-cyan-300 px-5 py-3 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <FiSend /> {sending ? "Sending..." : "Send message"}
      </button>
      {!RECAPTCHA_SITE_KEY ? <p className="mt-3 text-sm text-amber-300">Contact form verification is being configured.</p> : null}
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

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const elements = Array.from(document.querySelectorAll(".portfolio-reveal"));
    if (!elements.length) return undefined;

    if (!("IntersectionObserver" in window)) {
      elements.forEach((element) => element.classList.add("is-visible"));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.18 }
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [groupedFeatures.length, profile.metrics?.length, profile.architecture?.length]);

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
    <div className="portfolio-page min-h-dvh overflow-x-hidden bg-[#07111f] text-white">
      <style>{`
        .portfolio-page {
          background:
            radial-gradient(circle at 50% -20%, rgba(34, 211, 238, 0.18), transparent 34rem),
            linear-gradient(135deg, rgba(148, 163, 184, 0.08) 1px, transparent 1px),
            linear-gradient(225deg, rgba(148, 163, 184, 0.06) 1px, transparent 1px),
            #07111f;
          background-size: auto, 4.5rem 4.5rem, 4.5rem 4.5rem, auto;
        }

        .portfolio-perspective {
          perspective: 1200px;
          transform-style: preserve-3d;
        }

        .portfolio-depth-card {
          transform: translateZ(0) rotateX(0) rotateY(0);
          transition: transform 360ms ease, border-color 360ms ease, box-shadow 360ms ease, background 360ms ease;
          will-change: transform;
        }

        .portfolio-depth-card:hover {
          border-color: rgba(103, 232, 249, 0.42);
          box-shadow: 0 28px 70px rgba(8, 47, 73, 0.38);
          transform: translateY(-8px) rotateX(2deg) rotateY(-2deg);
        }

        .portfolio-hero-card {
          animation: portfolioFloat 8s ease-in-out infinite;
          transform: rotateY(-12deg) rotateX(8deg);
          transform-style: preserve-3d;
        }

        .portfolio-reveal {
          opacity: 0;
          filter: blur(14px);
          transform:
            translate3d(var(--reveal-x, 0), var(--reveal-y, 5rem), var(--reveal-z, -7rem))
            rotateX(var(--reveal-rx, 10deg))
            rotateY(var(--reveal-ry, 0deg))
            scale(0.94);
          transform-origin: center;
          transition:
            opacity 900ms cubic-bezier(0.16, 1, 0.3, 1),
            filter 900ms cubic-bezier(0.16, 1, 0.3, 1),
            transform 1000ms cubic-bezier(0.16, 1, 0.3, 1);
          transition-delay: var(--reveal-delay, 0ms);
          will-change: opacity, filter, transform;
        }

        .portfolio-reveal.is-visible {
          opacity: 1;
          filter: blur(0);
          transform: translate3d(0, 0, 0) rotateX(0) rotateY(0) scale(1);
        }

        .portfolio-fly-left {
          --reveal-x: -5rem;
          --reveal-y: 3rem;
          --reveal-ry: 12deg;
        }

        .portfolio-fly-right {
          --reveal-x: 5rem;
          --reveal-y: 3rem;
          --reveal-ry: -12deg;
        }

        .portfolio-fly-up {
          --reveal-y: 6rem;
          --reveal-rx: 14deg;
        }

        .portfolio-fly-deep {
          --reveal-y: 5rem;
          --reveal-z: -14rem;
          --reveal-rx: 16deg;
          --reveal-ry: -8deg;
        }

        .portfolio-stagger > * {
          --reveal-delay: calc(var(--reveal-index, 0) * 90ms);
        }

        .portfolio-depth-card.is-visible:hover,
        .portfolio-depth-card:hover {
          transform: translateY(-8px) rotateX(2deg) rotateY(-2deg) scale(1.01);
        }

        .portfolio-depth-card.is-visible:nth-child(even):hover {
          transform: translateY(-8px) rotateX(2deg) rotateY(2deg) scale(1.01);
        }

        .portfolio-stage-line {
          background:
            linear-gradient(90deg, transparent, rgba(103, 232, 249, 0.42), transparent),
            linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent);
        }

        @keyframes portfolioFloat {
          0%, 100% { transform: rotateY(-12deg) rotateX(8deg) translate3d(0, 0, 0); }
          50% { transform: rotateY(-7deg) rotateX(4deg) translate3d(0, -14px, 32px); }
        }

        @keyframes portfolioReveal {
          from { opacity: 0.35; transform: translateY(34px) rotateX(8deg) scale(0.98); }
          to { opacity: 1; transform: translateY(0) rotateX(0) scale(1); }
        }

        @media (prefers-reduced-motion: reduce) {
          .portfolio-hero-card,
          .portfolio-reveal {
            animation: none;
          }

          .portfolio-depth-card,
          .portfolio-depth-card:hover,
          .portfolio-hero-card,
          .portfolio-reveal,
          .portfolio-reveal.is-visible {
            transform: none;
            opacity: 1;
            filter: none;
          }
        }
      `}</style>
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

      <div className="pointer-events-none fixed inset-0 opacity-70" aria-hidden="true">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" />
        <div className="absolute bottom-0 left-1/2 h-[42rem] w-[120vw] -translate-x-1/2 translate-y-1/2 rounded-[100%] border border-cyan-300/10" />
      </div>

      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07111f]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-8">
          <button onClick={() => scrollTo("top")} className="flex min-w-0 items-center gap-3 text-left">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-300 font-black text-slate-950">{initials}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{profile.full_name}</span>
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
        <section className="portfolio-perspective mx-auto grid min-h-[calc(100dvh-4.25rem)] max-w-7xl items-center gap-10 px-4 py-10 sm:px-8 sm:py-14 lg:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)] lg:py-16">
          <div className="min-w-0">
            <p className="inline-flex max-w-full items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-semibold text-cyan-200 sm:px-4 sm:text-sm">
              <FiCode /> Rails, React, PostgreSQL
            </p>
            <h1 className="mt-6 max-w-5xl text-[clamp(2.35rem,12vw,4rem)] font-semibold leading-[1.04] tracking-[-0.04em] sm:text-5xl lg:text-[4.55rem] xl:text-[4.85rem]">
              I build full-stack products that solve real workflow problems.
            </h1>
            <p className="mt-6 max-w-3xl text-base leading-8 text-slate-300 sm:text-lg">{profile.summary}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button onClick={() => openDemo("/demo")} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-cyan-300 px-6 py-3.5 font-semibold text-slate-950 sm:w-auto">
                {demoLoading ? "Starting demo..." : "Explore Nexus Hub"} <FiArrowUpRight />
              </button>
              <button onClick={() => scrollTo("case-study")} className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/15 px-6 py-3.5 font-semibold sm:w-auto">
                Read case study <FiArrowDown />
              </button>
              {profile.resume_url ? (
                <a href={profile.resume_url} className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/15 px-6 py-3.5 font-semibold sm:w-auto">
                  Resume <FiDownload />
                </a>
              ) : null}
            </div>
            {demoError ? <p className="mt-4 text-amber-300">{demoError}</p> : null}
          </div>
          <div className="relative mx-auto w-full max-w-[20rem] sm:max-w-sm lg:max-w-md">
            <div className="portfolio-stage-line absolute -bottom-8 left-4 right-4 h-16 rounded-[100%] blur-sm" />
            <div className="portfolio-hero-card relative rounded-[32px] border border-cyan-200/20 bg-slate-900/90 p-6 shadow-2xl shadow-cyan-950/40 sm:p-7">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={`${profile.full_name} portrait`} className="aspect-square w-full rounded-[24px] object-cover" />
              ) : (
                <div className="flex aspect-square items-center justify-center rounded-[24px] bg-gradient-to-br from-slate-800 to-slate-950 text-6xl font-semibold text-cyan-300 sm:text-7xl">{initials}</div>
              )}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div>
                  <p className="font-semibold">{profile.full_name}</p>
                  <p className="mt-1 inline-flex items-center gap-2 text-sm text-slate-400"><FiMapPin /> {profile.location}</p>
                </div>
                <span className="rounded-full bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">Open to opportunities</span>
              </div>
            </div>
          </div>
        </section>

        <section id="about" className="portfolio-perspective border-y border-white/10 bg-white/[0.03]">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-8 sm:py-14 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:py-16">
            <div className="portfolio-reveal portfolio-fly-left">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-300">About</p>
              <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.03em] sm:text-4xl">Product thinking with full-stack execution.</h2>
            </div>
            <div className="portfolio-reveal portfolio-fly-right">
              <p className="text-base leading-8 text-slate-300 sm:text-lg">{profile.headline}. My work covers data modeling, API design, authorization, complex UI state, realtime behavior, background processing, integrations, AWS deployment, DNS, HTTPS, email delivery, storage, CI/CD, and AI-assisted debugging.</p>
              <div className="mt-8 flex flex-wrap gap-2">
                {(profile.skills || []).map((skill) => <span key={skill} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200">{skill}</span>)}
              </div>
            </div>
          </div>
        </section>

        <section className="portfolio-perspective mx-auto max-w-7xl px-4 py-12 sm:px-8 lg:py-14">
          <div className="portfolio-stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(profile.metrics || []).map((metric, index) => (
              <div key={metric} style={{ "--reveal-index": index }} className="portfolio-depth-card portfolio-reveal portfolio-fly-up rounded-[26px] border border-white/10 bg-white/5 p-6">
                <FiCheck className="text-cyan-300" />
                <p className="mt-6 text-xl font-semibold">{metric}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="case-study" className="portfolio-perspective mx-auto max-w-7xl px-4 py-12 sm:px-8 sm:py-14 lg:py-16">
          <div className="grid min-w-0 gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div className="portfolio-reveal portfolio-fly-left">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-300">Flagship Case Study</p>
              <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.03em] sm:text-4xl">{project?.title || "Nexus Hub"}</h2>
              <p className="mt-5 text-lg leading-8 text-slate-300">{project?.tagline || "One connected workspace for product delivery and personal productivity."}</p>
              <div className="mt-7 flex flex-wrap gap-2">
                {(project?.stack || profile.skills || []).map((item) => <span key={item} className="rounded-full bg-cyan-300/10 px-3 py-1.5 text-sm text-cyan-200">{item}</span>)}
              </div>
            </div>
            <div className="min-w-0 space-y-5">
              <div className="portfolio-depth-card portfolio-reveal portfolio-fly-right rounded-[26px] border border-white/10 bg-gradient-to-br from-white/10 to-white/[0.03] p-5 sm:rounded-[34px] sm:p-9">
                <p className="text-base leading-8 text-slate-200 sm:text-lg">{project?.summary || "Nexus Hub brings planning, delivery, communication, knowledge, and document tools into one Rails and React product."}</p>
                <p className="mt-5 leading-7 text-slate-400">{project?.description}</p>
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  {(project?.engineering_highlights || profile.engineering_highlights || []).map((item) => (
                    <div key={item} className="flex gap-3 rounded-2xl bg-slate-950/50 p-4 text-sm leading-6 text-slate-300"><FiShield className="mt-1 shrink-0 text-cyan-300" /> {item}</div>
                  ))}
                </div>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <button onClick={() => openDemo("/demo")} className="w-full rounded-full bg-white px-5 py-3 font-semibold text-slate-950 sm:w-auto">Start guided demo</button>
                  {project?.repository_url ? <a href={project.repository_url} target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/15 px-5 py-3 font-semibold sm:w-auto"><FiGithub /> View code</a> : null}
                </div>
              </div>
              <div className="portfolio-depth-card portfolio-reveal portfolio-fly-deep overflow-hidden rounded-[30px] border border-cyan-300/12 bg-slate-950 shadow-2xl shadow-cyan-950/30">
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

        <section id="decisions" className="portfolio-perspective border-y border-white/10 bg-white/[0.03]">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-8 sm:py-14 lg:py-16">
            <p className="portfolio-reveal portfolio-fly-left text-xs font-bold uppercase tracking-[0.3em] text-cyan-300">Engineering Decisions</p>
            <h2 className="portfolio-reveal portfolio-fly-left mt-4 max-w-4xl text-3xl font-semibold leading-tight sm:text-4xl">
              The reasoning behind the product, not only the feature list.
            </h2>
            <div className="portfolio-stagger mt-10 grid gap-5 lg:grid-cols-2">
              <article style={{ "--reveal-index": 0 }} className="portfolio-depth-card portfolio-reveal portfolio-fly-left rounded-[26px] border border-white/10 bg-slate-950/60 p-5 sm:rounded-[30px] sm:p-7">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Problem</p>
                <p className="mt-4 text-lg leading-8 text-slate-200">{caseStudy.problem}</p>
              </article>
              <article style={{ "--reveal-index": 1 }} className="portfolio-depth-card portfolio-reveal portfolio-fly-right rounded-[26px] border border-white/10 bg-slate-950/60 p-5 sm:rounded-[30px] sm:p-7">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">My Role</p>
                <p className="mt-4 text-lg leading-8 text-slate-200">{caseStudy.role}</p>
              </article>
              {[
                ["Constraints", caseStudy.constraints],
                ["Technical Decisions", caseStudy.decisions],
                ["Trade-offs", caseStudy.trade_offs],
                ["Outcomes", caseStudy.outcomes],
              ].map(([title, items], index) => (
                <article key={title} style={{ "--reveal-index": index + 2 }} className="portfolio-depth-card portfolio-reveal portfolio-fly-up rounded-[26px] border border-white/10 bg-white/5 p-5 sm:rounded-[30px] sm:p-7">
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

        <section id="features" className="portfolio-perspective border-y border-white/10 bg-white/[0.03]">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-8 sm:py-14 lg:py-16">
            <p className="portfolio-reveal portfolio-fly-left text-xs font-bold uppercase tracking-[0.3em] text-cyan-300">Feature Map</p>
            <h2 className="portfolio-reveal portfolio-fly-left mt-4 max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl">A large product, organized for a fast technical review.</h2>
            <div className="portfolio-stagger mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {groupedFeatures.map((feature, index) => (
                <button key={feature.id || feature.title} style={{ "--reveal-index": index }} onClick={() => openDemo(feature.demo_path || "/demo")} className={`portfolio-depth-card portfolio-reveal ${index % 2 === 0 ? "portfolio-fly-left" : "portfolio-fly-right"} group min-w-0 overflow-hidden rounded-[24px] border border-white/10 bg-slate-950/60 text-left sm:rounded-[28px]`}>
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

        <section id="architecture" className="portfolio-perspective mx-auto max-w-7xl px-4 py-12 sm:px-8 sm:py-14 lg:py-16">
          <div className="grid gap-10 lg:grid-cols-2">
            <div className="portfolio-reveal portfolio-fly-left">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-300">Architecture</p>
              <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.03em] sm:text-4xl">Built across the complete application stack.</h2>
            </div>
            <div className="portfolio-stagger space-y-3">
              {(profile.architecture || []).map((item, index) => (
                <div key={item} style={{ "--reveal-index": index }} className="portfolio-depth-card portfolio-reveal portfolio-fly-right flex min-w-0 items-start gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 sm:items-center sm:gap-5 sm:p-5">
                  <span className="text-sm font-bold text-cyan-300">0{index + 1}</span>
                  <span className="min-w-0 text-base font-medium text-slate-200 sm:text-lg">{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="portfolio-stagger mt-12 grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
            {[
              ["React + Vite", "Public portfolio and authenticated product UI"],
              ["Rails 8.0", "Authentication, authorization, APIs, jobs, storage, and realtime"],
              ["PostgreSQL + Redis + S3", "Tenant data, background work, streams, and durable media"],
            ].map(([title, description], index) => (
              <React.Fragment key={title}>
                <div style={{ "--reveal-index": index }} className="portfolio-depth-card portfolio-reveal portfolio-fly-deep rounded-[26px] border border-white/10 bg-white/5 p-6">
                  <p className="text-lg font-semibold text-white">{title}</p>
                  <p className="mt-3 leading-7 text-slate-400">{description}</p>
                </div>
                {index < 2 ? <div className="hidden items-center text-2xl text-cyan-300 md:flex" aria-hidden="true">→</div> : null}
              </React.Fragment>
            ))}
          </div>
        </section>

        <section id="contact" className="portfolio-perspective border-t border-white/10 bg-slate-950">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-8 sm:py-14 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:py-16">
            <div className="portfolio-reveal portfolio-fly-left">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-300">Contact</p>
              <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.03em] sm:text-4xl">Let’s discuss the role and the problems you need solved.</h2>
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
