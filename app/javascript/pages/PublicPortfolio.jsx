import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import {
  FiArrowDown,
  FiArrowRight,
  FiCpu,
  FiDatabase,
  FiGlobe,
  FiArrowUpRight,
  FiCheck,
  FiCode,
  FiDownload,
  FiGithub,
  FiLayers,
  FiLinkedin,
  FiMail,
  FiMapPin,
  FiPause,
  FiPlay,
  FiMenu,
  FiSend,
  FiX,
} from "react-icons/fi";
import { AuthContext } from "../context/AuthContext";
import { fetchPortfolio, sendContact } from "../components/api";
import LoopingVideo from "../components/ui/LoopingVideo";
import { runtimeMetaValue, runtimeOrBuildValue } from "../config/runtime";
import nexusProductPoster from "../images/nexus/nexus-product-poster.webp";

import { getContactVerificationToken } from "../lib/recaptcha";
import usePortfolioMotion from "./usePortfolioMotion";
import "./PublicPortfolio.css";

const RECAPTCHA_ENABLED =
  runtimeMetaValue("nexus-recaptcha-enabled") === "true";
const RECAPTCHA_SITE_KEY = RECAPTCHA_ENABLED
  ? runtimeOrBuildValue(
      "nexus-recaptcha-site-key",
      import.meta.env.VITE_RECAPTCHA_SITE_KEY,
    )
  : undefined;
const NEXUS_PRODUCT_LOOP_WEBM = "/media/nexus/nexus-product-loop.webm?v=f2269eeb50f4c27f";
const NEXUS_PRODUCT_LOOP_MP4 = "/media/nexus/nexus-product-loop.mp4?v=9d1758a657649ce4";

const fallbackProfile = {
  full_name: "Divyarajsinh Solanki",
  headline: "Full-stack engineer building practical Rails and React products",
  location: "India",
  summary:
    "I build product-focused web applications from database modeling and secure APIs through responsive interfaces, realtime collaboration, cloud deployment, CI/CD, DNS, email, storage, and production troubleshooting.",
  skills: [
    "Ruby on Rails",
    "React",
    "PostgreSQL",
    "AWS EB/EC2",
    "Route 53",
    "S3",
    "SES",
    "GitHub Actions",
    "AI-assisted development",
  ],
  metrics: [
    "AWS production deploy",
    "GitHub CI/CD pipeline",
    "35+ API controllers",
    "20+ product surfaces",
  ],
  architecture: [
    "React and Vite client",
    "Rails JSON API",
    "PostgreSQL data model",
    "AWS Elastic Beanstalk on EC2",
    "Route 53 DNS and HTTPS",
    "S3 assets and SES email",
    "GitHub Actions deployments",
    "AI-assisted delivery workflow",
  ],
  engineering_highlights: [
    "Workspace authorization",
    "Project delivery workflows",
    "Encrypted environment inventory and release verification",
    "Realtime chat",
    "AWS deployment",
    "CI/CD",
    "Production troubleshooting",
  ],
  social_links: { github: "https://github.com/Divyarajsinhsolanki" },
};

const fallbackProject = {
  title: "Nexus Hub",
  tagline:
    "A connected workspace for planning, delivery, collaboration, knowledge, documents, and production-ready cloud deployment.",
  summary:
    "Nexus Hub is a full-stack Rails and React product that brings project operations, productivity, team communication, learning tools, PDF workflows, and AWS deployment practice into one application.",
  stack: [
    "Ruby 3.3",
    "Rails 8.0",
    "React 19",
    "Vite 8",
    "PostgreSQL",
    "Redis",
    "AWS EB/EC2",
    "S3",
    "Route 53",
    "SES",
    "GitHub Actions",
  ],
  repository_url: "https://github.com/Divyarajsinhsolanki/rails_vite",
  engineering_highlights: fallbackProfile.engineering_highlights,
  case_study: {
    problem:
      "Teams often split project delivery, planning, communication, learning, and document work across disconnected tools.",
    role: "Designed and implemented the Rails domain model, APIs, React product surfaces, authorization, realtime workflows, AWS deployment, DNS/SSL, SES email, S3 storage, CI/CD, and production debugging.",
    constraints: [
      "Protect tenant data",
      "Keep a broad product understandable",
      "Offer a safe public demo",
      "Keep the first AWS setup cost-conscious",
    ],
    decisions: [
      "Workspace-scoped Rails APIs",
      "Synthetic read-only demo workspace",
      "AWS Elastic Beanstalk on EC2",
      "Route 53 DNS and HTTPS",
      "S3 assets, SES email, and GitHub Actions deploys",
      "AI-assisted code review and deployment debugging",
    ],
    trade_offs: [
      "A broad product requires stronger navigation and testing discipline",
      "Single-server PostgreSQL and Redis reduce cost now but can move to managed AWS services later",
    ],
    outcomes: [
      "One connected workspace",
      "One-click technical review",
      "Production AWS deployment",
      "Repeatable local-to-production DB restore workflow",
    ],
  },
  features: [
    ["Project Delivery", "Projects, Sprints, and Quality", "/projects"],
    ["Planning and Focus", "Calendar and Daily Momentum", "/momentum"],
    ["Collaboration", "Teams, Posts, and Real-time Chat", "/posts"],
    ["Knowledge", "Knowledge and Learning Grid", "/knowledge"],
    ["Documents", "PDF Master Workflows", "/pdf-master"],
    ["Operations", "Project Environments & Operations", "/demo?section=operations"],
    [
      "Platform",
      "Cloud Deployment and Product Operations",
      "/demo#architecture",
    ],
  ].map(([category, title, demo_path], index) => ({
    id: `fallback-${index}`,
    category,
    title,
    demo_path,
    position: index + 1,
    alt_text: `${title} in Nexus Hub`,
    summary:
      "Explore this product area through the guided read-only workspace and inspect the real application screens.",
  })),
};

const PortfolioSocialButtons = ({ links, className = "" }) => (
  <div className={`pf-social-links ${className}`} aria-label="Social profiles">
    {[["github", "GitHub", FiGithub], ["linkedin", "LinkedIn", FiLinkedin]].map(([key, label, Icon]) =>
      links[key] ? <a key={key} href={links[key]} aria-label={label} title={label} target="_blank" rel="noopener noreferrer"><Icon aria-hidden="true" />{label}<FiArrowUpRight aria-hidden="true" /></a> : null
    )}
  </div>
);

const ContactForm = () => {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [status, setStatus] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    document.body.classList.add("portfolio-contact-verification");
    return () => document.body.classList.remove("portfolio-contact-verification");
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setSending(true);
    setStatus(null);

    try {
      const recaptchaToken = await getContactVerificationToken(RECAPTCHA_SITE_KEY);
      await sendContact({ ...form, recaptcha_token: recaptchaToken });
      setForm({ name: "", email: "", message: "" });
      setStatus({
        type: "success",
        text: "Message sent. I will reply as soon as possible.",
      });
    } catch (error) {
      setStatus({
        type: "error",
        text:
          error.response?.data?.errors?.join(", ") ||
          error.message ||
          "Message could not be sent.",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="pf-contact-form">
      <div className="grid gap-4 sm:grid-cols-2">
        <input
          aria-label="Name"
          required
          placeholder="Your name"
          value={form.name}
          onChange={(event) =>
            setForm((current) => ({ ...current, name: event.target.value }))
          }
          className="pf-input"
        />
        <input
          aria-label="Email"
          required
          type="email"
          placeholder="Email address"
          value={form.email}
          onChange={(event) =>
            setForm((current) => ({ ...current, email: event.target.value }))
          }
          className="pf-input"
        />
      </div>
      <textarea
        aria-label="Message"
        required
        rows={5}
        placeholder="Tell me about the role or project"
        value={form.message}
        onChange={(event) =>
          setForm((current) => ({ ...current, message: event.target.value }))
        }
        className="pf-input pf-textarea"
      />
      <button
        type="submit"
        disabled={!RECAPTCHA_SITE_KEY || sending}
        className="pf-button pf-button-primary pf-submit"
      >
        <FiSend /> {sending ? "Sending..." : "Send message"}
      </button>
      {RECAPTCHA_SITE_KEY && <p className="pf-form-notice">This site is protected by reCAPTCHA and the Google <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a> and <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a> apply.</p>}
      {!RECAPTCHA_SITE_KEY ? (
        <p className="pf-form-notice">
          Contact form verification is being configured.
        </p>
      ) : null}
      {status ? (
        <p
          role="status"
          className={`pf-form-status pf-form-status-${status.type}`}
        >
          {status.text}
        </p>
      ) : null}
    </form>
  );
};

const navItems = [
  ["Work", "case-study"],
  ["Walkthrough", "features"],
  ["Approach", "decisions"],
  ["About", "about"],
  ["Contact", "contact"],
];
const architectureLayers = [
  { title: "The experience", stack: "React + Vite", Icon: FiLayers, description: "The browser presents responsive product screens and connects user actions to the Rails API." },
  { title: "The engine", stack: "Rails · APIs · Realtime", Icon: FiCpu, description: "Rails handles application workflows, workspace authorization, and APIs supporting realtime collaboration." },
  { title: "The foundation", stack: "PostgreSQL · Redis · S3", Icon: FiDatabase, description: "PostgreSQL stores application records, Redis supports realtime infrastructure, and S3 provides asset storage." },
];

const FeatureScreenshot = ({ feature }) => {
  const [failed, setFailed] = useState(false);
  return feature.screenshot_url && !failed ? (
    <img src={feature.screenshot_url} alt={feature.alt_text || feature.title} onError={() => setFailed(true)} />
  ) : (
    <div className="pf-walkthrough-placeholder" role="status">
      <FiLayers aria-hidden="true" />
      <p>Screenshot unavailable for {feature.title}.</p>
      <span>Open the live screen to explore this product area.</span>
    </div>
  );
};
const pad = (value) => String(value).padStart(2, "0");

const SectionLabel = ({ number, children }) => (
  <p className="pf-section-label">
    <span>{number} /</span> {children}
  </p>
);

const KineticRibbon = ({ words, reverse = false }) => (
  <div className={`pf-kinetic-ribbon ${reverse ? "pf-ribbon-reverse" : ""}`} data-kinetic aria-hidden="true">
    <div className="pf-ribbon-track">
      {[0, 1, 2, 3].map((copy) => <span key={copy}>{words}<i>✳</i></span>)}
    </div>
  </div>
);

const OrbitScene = ({ initials }) => (
  <div className="pf-orbit-scene" data-hero-scene aria-hidden="true">
    <div className="pf-scene-grid" />
    <span className="pf-scene-coordinate pf-coordinate-top">
      SYSTEMS / CONNECTED
    </span>
    <div className="pf-orbit-system">
      <div className="pf-orbit pf-orbit-one" />
      <div className="pf-orbit pf-orbit-two" />
      <div className="pf-orbit pf-orbit-three" />
      <div className="pf-orbit-core">
        <span>{initials}</span>
        <i />
      </div>
      <div className="pf-orbit-satellite pf-satellite-one">
        <FiCode />
        <span>React</span>
      </div>
      <div className="pf-orbit-satellite pf-satellite-two">
        <FiCpu />
        <span>Rails</span>
      </div>
      <div className="pf-orbit-satellite pf-satellite-three">
        <FiDatabase />
        <span>PostgreSQL</span>
      </div>
      <span className="pf-orbit-dot pf-dot-one" />
      <span className="pf-orbit-dot pf-dot-two" />
    </div>
    <div className="pf-scene-caption">
      <span className="pf-crosshair">+</span>
      <span>Design. Engineer. Connect.</span>
      <span>∞</span>
    </div>
  </div>
);

const PublicPortfolio = () => {
  const navigate = useNavigate();
  const { handleDemoLogin } = useContext(AuthContext);
  const rootRef = useRef(null);
  const [selectedFeature, setSelectedFeature] = useState(0);
  const [selectedLayer, setSelectedLayer] = useState(0);
  const [data, setData] = useState({
    profile: fallbackProfile,
    projects: [fallbackProject],
    seo: {},
  });
  const [motionPaused, setMotionPaused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [demoLoading, setDemoLoading] = useState("");
  const [demoError, setDemoError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchPortfolio()
      .then(({ data: payload }) => {
        if (!cancelled)
          setData({
            profile: { ...fallbackProfile, ...payload?.profile },
            projects:
              Array.isArray(payload?.projects) && payload.projects.length
                ? payload.projects
                : [fallbackProject],
            seo: payload?.seo || {},
          });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const profile = data.profile;
  const project = data.projects[0] || fallbackProject;
  const features = useMemo(
    () =>
      [...(project.features || [])].sort(
        (a, b) => (a.position || 0) - (b.position || 0),
      ),
    [project.features],
  );
  useEffect(() => setSelectedFeature(0), [project]);
  const feature = features[selectedFeature] || features[0];
  const { activeSection, reducedMotion } = usePortfolioMotion(rootRef, [
    features.length,
    data,
  ], !motionPaused);
  const socialLinks = profile.social_links || {};
  const caseStudy = project.case_study || {};
  const seo = data.seo || {};
  const initials = (profile.full_name || fallbackProfile.full_name)
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
  const browserOrigin =
    typeof window === "undefined"
      ? "http://localhost:3000"
      : document.querySelector('meta[name="nexus-site-url"]')?.content || window.location.origin;
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
      name: project.title,
      applicationCategory: "BusinessApplication",
      description: project.summary,
    },
  };

  const scrollTo = (id) => {
    document
      .getElementById(id)
      ?.scrollIntoView({
        behavior: reducedMotion ? "instant" : "smooth",
        block: "start",
      });
    setMenuOpen(false);
  };
  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  const openDemo = async (path = "/demo") => {
    if (demoLoading) return;
    setDemoError("");
    setDemoLoading(path);
    try {
      await handleDemoLogin(path);
    } catch (error) {
      setDemoError(
        error.response?.data?.error === "demo_disabled"
          ? "The live demo is not enabled on this deployment."
          : "The demo could not be started. Please try again.",
      );
    } finally {
      setDemoLoading("");
    }
  };

  return (
    <div className="pf-page" ref={rootRef}>
      <Helmet>
        <title>
          {seo.title || `${profile.full_name} | Full-stack Engineer`}
        </title>
        <meta name="description" content={seo.description || profile.summary} />
        <link rel="canonical" href={seo.canonical_url || `${browserOrigin}/`} />
        <meta
          property="og:title"
          content={seo.title || `${profile.full_name} | Full-stack Engineer`}
        />
        <meta
          property="og:description"
          content={seo.description || project.summary}
        />
        <meta property="og:type" content="website" />
        <meta
          property="og:url"
          content={seo.canonical_url || `${browserOrigin}/`}
        />
        <meta name="twitter:card" content="summary_large_image" />
        {seo.image_url || project.cover_image_url ? (
          <meta
            property="og:image"
            content={seo.image_url || project.cover_image_url}
          />
        ) : null}
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      </Helmet>
      <a className="pf-skip-link" href="#portfolio-main">
        Skip to content
      </a>
      <div className="pf-atmosphere" aria-hidden="true"><span /><span /><div /></div>
      <div className="pf-scroll-progress" aria-hidden="true" />
      <nav className="pf-chapter-rail" aria-label="Scroll chapters">
        {[["Start", "top"], ...navItems.slice(0, 3), ["Architecture", "architecture"], ...navItems.slice(3)].map(([label, id], index) => (
          <a key={id} href={`#${id}`} aria-label={label} aria-current={activeSection === id ? "location" : undefined} onClick={(event) => { event.preventDefault(); scrollTo(id); }}>
            <span>{pad(index)}</span><i /><strong>{label}</strong>
          </a>
        ))}
      </nav>
      <button type="button" className="pf-motion-toggle" aria-pressed={motionPaused} aria-label={motionPaused ? "Resume visual motion" : "Pause visual motion"} onClick={() => setMotionPaused((value) => !value)}>
        {motionPaused ? <FiPlay aria-hidden="true" /> : <FiPause aria-hidden="true" />}<span>{motionPaused ? "Motion paused" : reducedMotion ? "Reduced motion" : "Motion on"}</span>
      </button>
      <header className="pf-header">
        <a
          className="pf-brand"
          href="#top"
          onClick={(event) => {
            event.preventDefault();
            scrollTo("top");
          }}
          aria-label={`${profile.full_name}, back to top`}
        >
          <span className="pf-brand-symbol">
            {initials}
            <span>®</span>
          </span>
          <span className="pf-brand-name">
            {profile.full_name}
            <small>Independent full-stack engineer</small>
          </span>
        </a>
        <nav className="pf-desktop-nav" aria-label="Portfolio">
          {navItems.map(([label, id]) => (
            <a
              key={id}
              href={`#${id}`}
              aria-current={activeSection === id ? "location" : undefined}
              onClick={(event) => {
                event.preventDefault();
                scrollTo(id);
              }}
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="pf-header-actions">
          <button
            type="button"
            className="pf-demo-link"
            onClick={() => openDemo()}
            disabled={!!demoLoading}
          >
            {demoLoading ? "Opening demo…" : "Live demo"} <FiArrowUpRight />
          </button>
          <PortfolioSocialButtons links={socialLinks} className="pf-header-social" />
          <button
            className="pf-workspace-link"
            onClick={() => navigate("/login")}
          >
            Workspace <FiArrowUpRight />
          </button>
          <button
            className="pf-menu-toggle"
            onClick={() => setMenuOpen((value) => !value)}
            aria-expanded={menuOpen}
            aria-controls="portfolio-mobile-nav"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          >
            {menuOpen ? <FiX /> : <FiMenu />}
          </button>
        </div>
        {menuOpen ? (
          <nav
            id="portfolio-mobile-nav"
            className="pf-mobile-nav"
            aria-label="Mobile portfolio"
          >
            {navItems.map(([label, id], index) => (
              <a
                key={id}
                href={`#${id}`}
                onClick={(event) => {
                  event.preventDefault();
                  scrollTo(id);
                }}
              >
                <span>{pad(index + 1)}</span>
                {label}
                <FiArrowUpRight />
              </a>
            ))}
            <button onClick={() => navigate("/login")}>
              Open workspace <FiArrowUpRight />
            </button>
          </nav>
        ) : null}
      </header>

      <main id="portfolio-main">
        <section
          id="top"
          data-portfolio-section
          className="pf-hero pf-container"
        >
          <div className="pf-hero-content" data-parallax="0.08">
            <p className="pf-eyebrow">
              <span className="pf-status-dot" /> Engineering with a product
              mindset
            </p>
            <h1>
              {profile.full_name}
              <br />
              <span className="pf-serif">Full-stack engineer.</span>
            </h1>
            <p className="pf-hero-description">
              {profile.headline}. Rails APIs, React interfaces, and production deployment.
            </p>
            <div className="pf-hero-actions">
              <a
                className="pf-button pf-button-primary"
                href="#case-study"
                onClick={(event) => {
                  event.preventDefault();
                  scrollTo("case-study");
                }}
              >
                Explore my work <FiArrowDown />
              </a>
              {profile.resume_url ? (
                <a className="pf-text-link" href={profile.resume_url}>View résumé <FiDownload /></a>
              ) : (
                <a className="pf-text-link" href="#about" onClick={(event) => { event.preventDefault(); scrollTo("about"); }}>My experience <FiArrowUpRight /></a>
              )}
            </div>
            <div className="pf-hero-note">
              <FiMapPin />
              <span>Based in {profile.location || "India"}</span>
              <i />
              <span>Building for the web</span>
            </div>
          </div>
          <div className="pf-hero-depth" data-parallax="-0.15"><OrbitScene initials={initials} /></div>
          <span className="pf-hero-ghost" data-parallax="0.2" aria-hidden="true">ENGINEER</span>
          <div className="pf-hero-bottom">
            <span>STRATEGY → DESIGN → DEVELOPMENT</span>
            <a
              href="#case-study"
              onClick={(event) => {
                event.preventDefault();
                scrollTo("case-study");
              }}
            >
              <span>Scroll to discover</span>
              <span className="pf-scroll-indicator">
                <FiArrowDown />
              </span>
            </a>
            <span>PORTFOLIO / {new Date().getFullYear()}</span>
          </div>
        </section>

        <KineticRibbon words="IDEAS INTO INTERFACES" />

        <section
          id="case-study"
          data-portfolio-section
          className="pf-section pf-case-study"
        >
          <div className="pf-container">
            <div className="pf-section-heading" data-reveal>
              <div>
                <SectionLabel number="01">Flagship Case Study</SectionLabel>
                <h2>
                  {project.title}
                  <br />
                  <span className="pf-serif">Built from interface to infrastructure.</span>
                </h2>
              </div>
              <span className="pf-project-year">
                DESIGN + DEVELOPMENT
                <br />
                FULL-STACK PRODUCT
              </span>
            </div>
            <div className="pf-cinema" data-scroll-scene>
              <div className="pf-cinema-sticky">
                <div className="pf-cinema-caption"><span>01 / THE PRODUCT</span><span>SCROLL TO REVEAL <FiArrowDown /></span></div>
                <div className="pf-project-stage">
                  <span className="pf-cinema-word" aria-hidden="true">{project.title}</span>
                  <div className="pf-project-window">
                <div className="pf-window-bar">
                  <span className="pf-window-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span>nexus / connected workspace</span>
                  <FiArrowUpRight />
                </div>
                <LoopingVideo
                  srcWebm={reducedMotion ? undefined : NEXUS_PRODUCT_LOOP_WEBM}
                  srcMp4={reducedMotion ? undefined : NEXUS_PRODUCT_LOOP_MP4}
                  poster={nexusProductPoster}
                  ariaLabel="Current Nexus Hub application screens"
                  className="pf-product-video"
                />
                  </div>
                </div>
                <div className="pf-cinema-meter" aria-hidden="true"><i /></div>
              </div>
            </div>
            <div className="pf-project-details" data-reveal>
              <div>
                <span className="pf-overline">SELECTED WORK / 001</span>
                <h3>{project.title}</h3>
                <p>{project.tagline}</p>
              </div>
              <div>
                <p>{project.summary}</p>
                <div className="pf-project-actions">
                  <button
                    className="pf-button pf-button-primary"
                    onClick={() => openDemo()}
                    disabled={!!demoLoading}
                  >
                    {demoLoading ? "Starting demo…" : "Explore Nexus Hub"}
                    <FiArrowUpRight />
                  </button>
                  {project.repository_url ? (
                    <a
                      className="pf-text-link"
                      href={project.repository_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View code <FiGithub />
                    </a>
                  ) : null}
                </div>
                <div className="pf-stack-tags">
                  {(project.stack || profile.skills || []).map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" data-portfolio-section className="pf-section pf-container pf-walkthrough">
          <div className="pf-section-heading" data-reveal>
            <div>
              <SectionLabel number="02">Product walkthrough</SectionLabel>
              <h2>Explore what I <span className="pf-serif">built.</span></h2>
              <p>Choose a product area to inspect its interface and purpose.</p>
            </div>
          </div>
          <div className="pf-feature-selector" role="group" aria-label="Product areas">
            {features.map((item, index) => (
              <button key={item.id || item.title} type="button" aria-pressed={feature === item} aria-controls="portfolio-feature-panel" onClick={() => setSelectedFeature(index)}>
                <span>{pad(index + 1)}</span> {item.category || item.title}
              </button>
            ))}
          </div>
          {feature ? (
            <article id="portfolio-feature-panel" className="pf-walkthrough-panel" aria-label={feature.title}>
              <div className="pf-walkthrough-screen">
                <div className="pf-window-bar"><span>{project.title} / {feature.category}</span></div>
                <FeatureScreenshot key={`${feature.id || feature.title}:${feature.screenshot_url}`} feature={feature} />
              </div>
              <div className="pf-walkthrough-copy">
                <p className="pf-overline">{feature.category}</p>
                <h3>{feature.title}</h3>
                <p>{feature.summary}</p>
                {feature.review_notes && <p className="pf-review-note"><strong>Review focus</strong><br />{feature.review_notes}</p>}
                <button type="button" className="pf-button pf-button-primary" onClick={() => openDemo(feature.demo_path || "/demo")} disabled={!!demoLoading}>
                  Open live screen <FiArrowUpRight />
                </button>
              </div>
            </article>
          ) : <p role="status">No product walkthroughs are available yet. Explore the flagship demo above.</p>}
        </section>

        <KineticRibbon words="DESIGN / BUILD / SHIP" reverse />

        <section
          id="decisions"
          data-portfolio-section
          className="pf-section pf-container pf-approach"
        >
          <div className="pf-approach-intro" data-reveal>
            <SectionLabel number="03">Engineering Decisions</SectionLabel>
            <h2>
              Good products.
              <br />
              <span className="pf-muted">Considered decisions.</span>
            </h2>
            <p>
              Every interface has a system behind it. Here’s the thinking behind{" "}
              {project.title}.
            </p>
          </div>
          <div className="pf-decision-list">
            {[["The challenge", caseStudy.problem], ["My contribution", caseStudy.role]].map(([title, content]) => content ? (
              <article className="pf-story-overview" key={title}><h3>{title}</h3><p>{content}</p></article>
            ) : null)}
            {[["Constraints", caseStudy.constraints], ["Decisions", caseStudy.decisions], ["Tradeoffs", caseStudy.trade_offs], ["Outcomes", caseStudy.outcomes]].map(([title, content]) => Array.isArray(content) && content.length ? (
              <details className="pf-story-detail" key={title}>
                <summary>{title}<FiArrowDown aria-hidden="true" /></summary>
                <ul>{content.map((item) => <li key={item}>{item}</li>)}</ul>
              </details>
            ) : null)}
          </div>
        </section>

        <section
          id="architecture"
          data-portfolio-section
          className="pf-section pf-architecture"
        >
          <span className="pf-section-ghost" data-parallax="-0.12" aria-hidden="true">SYSTEMS</span>
          <div className="pf-container">
            <div className="pf-section-heading" data-reveal>
              <div>
                <SectionLabel number="04">Architecture</SectionLabel>
                <h2>
                  From pixel
                  <br />
                  to <span className="pf-serif">production.</span>
                </h2>
              </div>
              <p>Simplified system overview. Select a layer to see its responsibility.</p>
            </div>
            <div className="pf-architecture-flow" data-reveal>
              {architectureLayers.map(({ title, stack, Icon }, index) => (
                <button type="button" className="pf-architecture-node" key={title} aria-pressed={selectedLayer === index} aria-controls="portfolio-layer-detail" onClick={() => setSelectedLayer(index)}>
                  <div><span>{pad(index + 1)}</span><Icon aria-hidden="true" /></div>
                  <h3>{title}</h3><p>{stack}</p>
                </button>
              ))}
            </div>
            <div id="portfolio-layer-detail" className="pf-layer-detail">
              <h3>{architectureLayers[selectedLayer].title}</h3>
              <p>{architectureLayers[selectedLayer].description}</p>
              <p className="pf-overline">{architectureLayers[selectedLayer].stack}</p>
            </div>
            <div className="pf-architecture-tags" data-reveal>
              {(profile.architecture || []).map((item) => (
                <span key={item}>
                  <FiCheck />
                  {item}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section
          id="about"
          data-portfolio-section
          className="pf-section pf-container pf-about"
        >
          <div data-reveal>
            <SectionLabel number="05">A little about me</SectionLabel>
            <h2>
              About {profile.full_name}
              <br />
              <span className="pf-muted">Full-stack engineer &amp; product builder.</span>
            </h2>
          </div>
          <div className="pf-about-body" data-reveal>
            <p>{profile.summary}</p>
            <h3>Engineering experience</h3>
            <p>{project.case_study?.role || profile.headline}</p>
            <h3>Skills</h3>
            <p>{(profile.skills || []).join(" · ")}</p>
            <h3>Engineering achievements</h3>
            <ul>
              {(profile.engineering_highlights || []).map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>
            <div className="pf-about-signature">
              {profile.full_name}
              <span>Full-stack engineer & product builder</span>
            </div>
            {profile.resume_url ? (
              <a href={profile.resume_url} className="pf-text-link">
                Download résumé <FiDownload />
              </a>
            ) : null}
          </div>
          <div className="pf-metrics" data-reveal>
            {(profile.metrics || []).map((metric, index) => {
              const numeric = metric.match(/^(\d+\+?)\s+(.*)/);
              return (
                <div key={metric}>
                  <span className="pf-metric-index">{pad(index + 1)} —</span>
                  <strong>
                    {numeric ? (
                      numeric[1]
                    ) : index === 0 ? (
                      <FiGlobe />
                    ) : (
                      <FiCode />
                    )}
                  </strong>
                  <p>{numeric ? numeric[2] : metric}</p>
                </div>
              );
            })}
          </div>
        </section>

        <KineticRibbon words="LET’S MAKE SOMETHING MATTER" />

        <section
          id="contact"
          data-portfolio-section
          className="pf-section pf-container pf-contact"
        >
          <div data-reveal>
            <SectionLabel number="06">Contact</SectionLabel>
            <h2>
              Let’s build
              <br />
              something <span className="pf-serif">great.</span>
              <span className="pf-contact-arrow-depth" data-parallax="-0.18"><FiArrowUpRight className="pf-contact-arrow" aria-hidden="true" /></span>
            </h2>
            <p>
              Have a product in mind, a challenging problem, or a role to talk
              about? I’d love to hear it.
            </p>
            <PortfolioSocialButtons links={socialLinks} />
          </div>
          <div data-reveal>
            <div className="pf-contact-form-heading">
              <FiMail />
              <span>A conversation starts here.</span>
            </div>
            <ContactForm />
          </div>
        </section>
      </main>
      {demoError ? (
        <div className="pf-demo-error" role="alert">
          <span>{demoError}</span>
          <button
            aria-label="Dismiss demo error"
            onClick={() => setDemoError("")}
          >
            <FiX />
          </button>
        </div>
      ) : null}
      <footer className="pf-footer pf-container">
        <a
          className="pf-footer-wordmark"
          href="#top"
          onClick={(event) => {
            event.preventDefault();
            scrollTo("top");
          }}
        >
          {profile.full_name.split(" ")[0].toLowerCase()}
          <span>®</span>
        </a>
        <div>
          <span>Thoughtfully engineered.</span>
          <span>
            © {new Date().getFullYear()} {profile.full_name}
          </span>
        </div>
        <button className="pf-back-top" onClick={() => scrollTo("top")}>
          Back to top <FiArrowUpRight />
        </button>
      </footer>
    </div>
  );
};
export default PublicPortfolio;
