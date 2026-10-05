import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import {
  FiArrowDown,
  FiArrowRight,
  FiArrowLeft,
  FiBox,
  FiCpu,
  FiDatabase,
  FiGlobe,
  FiZap,
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
const NEXUS_PRODUCT_LOOP_WEBM = "/media/nexus/nexus-product-loop.webm";
const NEXUS_PRODUCT_LOOP_MP4 = "/media/nexus/nexus-product-loop.mp4";

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
    "React 18",
    "Vite 6",
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

    const existing = document.querySelector(
      'script[data-portfolio-recaptcha="true"]',
    );
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
      if (!RECAPTCHA_SITE_KEY || !window.grecaptcha?.execute)
        throw new Error("Contact form is not configured yet.");
      const recaptchaToken = await window.grecaptcha.execute(
        RECAPTCHA_SITE_KEY,
        { action: "contact_form_submit" },
      );
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
        disabled={!ready || sending}
        className="pf-button pf-button-primary pf-submit"
      >
        <FiSend /> {sending ? "Sending..." : "Send message"}
      </button>
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
  ["About", "about"],
  ["Work", "case-study"],
  ["Features", "features"],
  ["Approach", "decisions"],
  ["Contact", "contact"],
];
const featureIcons = [FiLayers, FiZap, FiGlobe, FiCode, FiBox, FiCpu];
const pad = (value) => String(value).padStart(2, "0");

const SectionLabel = ({ number, children }) => (
  <p className="pf-section-label">
    <span>{number} /</span> {children}
  </p>
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
  const galleryRef = useRef(null);
  const [data, setData] = useState({
    profile: fallbackProfile,
    projects: [fallbackProject],
    seo: {},
  });
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
  const { activeSection, reducedMotion } = usePortfolioMotion(rootRef, [
    features.length,
    data,
  ]);
  const socialLinks = profile.social_links || {};
  const caseStudy = { ...fallbackProject.case_study, ...project.case_study };
  const seo = data.seo || {};
  const initials = (profile.full_name || fallbackProfile.full_name)
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
  const browserOrigin =
    typeof window === "undefined"
      ? "http://localhost:3000"
      : window.location.origin;
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

  const focusFeature = (index, smooth = true) => {
    const gallery = galleryRef.current;
    if (!gallery || gallery.dataset.galleryPinned !== "true") return;
    const track = gallery.querySelector("[data-gallery-track]");
    const cards = [...track.children];
    const max = Math.max(
      1,
      track.scrollWidth -
        gallery.querySelector("[data-gallery-viewport]").clientWidth,
    );
    const progress = Math.min(1, cards[index].offsetLeft / max);
    const top = window.scrollY + gallery.getBoundingClientRect().top;
    window.scrollTo({
      top: top + progress * (gallery.offsetHeight - window.innerHeight),
      behavior: smooth && !reducedMotion ? "smooth" : "instant",
    });
  };
  const stepGallery = (direction) => {
    const gallery = galleryRef.current;
    if (!gallery) return;
    const viewport = gallery.querySelector("[data-gallery-viewport]");
    const track = gallery.querySelector("[data-gallery-track]");
    const distance = track.scrollWidth - viewport.clientWidth;
    if (distance <= 0 || gallery.dataset.galleryPinned !== "true") return;
    const current = -(
      parseFloat(gallery.style.getPropertyValue("--gallery-shift")) || 0
    );
    const step =
      track.firstElementChild.offsetWidth +
      (parseFloat(getComputedStyle(track).gap) || 24);
    const progress =
      Math.max(0, Math.min(distance, current + direction * step)) / distance;
    const top = window.scrollY + gallery.getBoundingClientRect().top;
    window.scrollTo({
      top: top + progress * (gallery.offsetHeight - window.innerHeight),
      behavior: reducedMotion ? "instant" : "smooth",
    });
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
      <div className="pf-scroll-progress" aria-hidden="true" />
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
          <div className="pf-hero-content">
            <p className="pf-eyebrow">
              <span className="pf-status-dot" /> Engineering with a product
              mindset
            </p>
            <h1>
              From ideas
              <br />
              to <span className="pf-serif">impact.</span>
            </h1>
            <p className="pf-hero-description">
              I’m {profile.full_name.split(" ")[0]}. I build thoughtful digital
              products — from the first interaction to the last line of
              infrastructure.
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
              <a
                className="pf-text-link"
                href="#contact"
                onClick={(event) => {
                  event.preventDefault();
                  scrollTo("contact");
                }}
              >
                Let’s talk <FiArrowUpRight />
              </a>
            </div>
            <div className="pf-hero-note">
              <FiMapPin />
              <span>Based in {profile.location || "India"}</span>
              <i />
              <span>Building for the web</span>
            </div>
          </div>
          <OrbitScene initials={initials} />
          <div className="pf-hero-bottom">
            <span>STRATEGY → DESIGN → DEVELOPMENT</span>
            <a
              href="#about"
              onClick={(event) => {
                event.preventDefault();
                scrollTo("about");
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

        <div className="pf-skills-strip" aria-label="Technology stack">
          <div className="pf-container">
            {[
              "Ruby on Rails",
              "React",
              "PostgreSQL",
              "AWS",
              "Creative engineering",
            ].map((skill) => (
              <span key={skill}>
                <span className="pf-spark" aria-hidden="true">
                  ✳
                </span>
                {skill}
              </span>
            ))}
          </div>
        </div>

        <section
          id="about"
          data-portfolio-section
          className="pf-section pf-container pf-about"
        >
          <div data-reveal>
            <SectionLabel number="01">A little about me</SectionLabel>
            <h2>
              I connect the dots.
              <br />
              <span className="pf-muted">You get the whole picture.</span>
            </h2>
          </div>
          <div className="pf-about-body" data-reveal>
            <p>{profile.summary}</p>
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

        <section
          id="case-study"
          data-portfolio-section
          className="pf-section pf-case-study"
        >
          <div className="pf-container">
            <div className="pf-section-heading" data-reveal>
              <div>
                <SectionLabel number="02">Flagship Case Study</SectionLabel>
                <h2>
                  One product.
                  <br />
                  <span className="pf-serif">A world of possibilities.</span>
                </h2>
              </div>
              <span className="pf-project-year">
                DESIGN + DEVELOPMENT
                <br />
                FULL-STACK PRODUCT
              </span>
            </div>
            <div className="pf-project-stage" data-reveal>
              <div className="pf-project-orbit" aria-hidden="true" />
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
                  srcWebm={NEXUS_PRODUCT_LOOP_WEBM}
                  srcMp4={NEXUS_PRODUCT_LOOP_MP4}
                  poster={nexusProductPoster}
                  ariaLabel="Animated Nexus Hub workspace product overview"
                  className="pf-product-video"
                />
              </div>
              <span className="pf-floating-tag pf-floating-tag-one">
                <FiLayers /> Six connected product areas
              </span>
              <span className="pf-floating-tag pf-floating-tag-two">
                <span className="pf-status-dot" /> Designed. Built. Deployed.
              </span>
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

        <section
          id="features"
          data-portfolio-section
          data-portfolio-gallery
          ref={galleryRef}
          className="pf-gallery-section"
        >
          <div className="pf-gallery-sticky">
            <div className="pf-container pf-gallery-heading">
              <div>
                <SectionLabel number="03">Feature Map</SectionLabel>
                <h2>
                  Built to <span className="pf-serif">work together.</span>
                </h2>
                <p>A large product, organized for a fast technical review.</p>
              </div>
              <div className="pf-gallery-controls">
                <span>
                  SCROLL TO EXPLORE <FiArrowRight />
                </span>
                <button
                  aria-label="Previous feature"
                  onClick={() => stepGallery(-1)}
                >
                  <FiArrowLeft />
                </button>
                <button
                  aria-label="Next feature"
                  onClick={() => stepGallery(1)}
                >
                  <FiArrowRight />
                </button>
              </div>
            </div>
            <div className="pf-gallery-viewport" data-gallery-viewport>
              <div className="pf-gallery-track" data-gallery-track>
                {features.map((feature, index) => {
                  const Icon = featureIcons[index % featureIcons.length];
                  return (
                    <article
                      key={feature.id || feature.title}
                      className="pf-feature-card"
                    >
                      <button
                        type="button"
                        className="pf-feature-hitarea"
                        aria-label={`Open ${feature.title} live screen`}
                        onClick={() => openDemo(feature.demo_path || "/demo")}
                        disabled={!!demoLoading}
                        onFocus={() => focusFeature(index, false)}
                      />
                      <div className="pf-feature-image">
                        {feature.screenshot_url ? (
                          <img
                            src={feature.screenshot_url}
                            alt={feature.alt_text || feature.title}
                            loading="lazy"
                          />
                        ) : (
                          <div className="pf-feature-placeholder">
                            <Icon />
                            <span>{feature.category}</span>
                            <div className="pf-placeholder-lines">
                              <i />
                              <i />
                              <i />
                            </div>
                          </div>
                        )}
                        <span className="pf-feature-number">
                          {pad(index + 1)}
                        </span>
                        <span className="pf-feature-open">
                          <FiArrowUpRight />
                        </span>
                      </div>
                      <div className="pf-feature-content">
                        <p className="pf-overline">{feature.category}</p>
                        <h3>{feature.title}</h3>
                        <p>{feature.summary}</p>
                        {feature.review_notes ? (
                          <span className="pf-feature-note">
                            Review focus: {feature.review_notes}
                          </span>
                        ) : null}
                        <span className="pf-feature-link">
                          Open live screen <FiArrowUpRight />
                        </span>
                      </div>
                    </article>
                  );
                })}
                {!features.length && (
                  <article className="pf-feature-card">
                    <div className="pf-feature-content" role="status">
                      <p>Feature map is loading. Refresh the page if this message stays visible.</p>
                    </div>
                  </article>
                )}
              </div>
            </div>
            <div className="pf-gallery-footer pf-container">
              <span>
                {pad(features.length)} PRODUCT AREAS / ONE CONNECTED SYSTEM
              </span>
              <div aria-hidden="true" className="pf-gallery-progress">
                <i />
              </div>
            </div>
          </div>
        </section>

        <section
          id="decisions"
          data-portfolio-section
          className="pf-section pf-container pf-approach"
        >
          <div className="pf-approach-intro" data-reveal>
            <SectionLabel number="04">Engineering Decisions</SectionLabel>
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
            {[
              ["The challenge", caseStudy.problem, FiBox],
              ["The constraints", caseStudy.constraints, FiShield],
              ["My contribution", caseStudy.role, FiCode],
              ["The decisions", caseStudy.decisions, FiCpu],
              ["The trade-offs", caseStudy.trade_offs, FiShield],
              ["The outcomes", caseStudy.outcomes, FiCheck],
            ].map(([title, content, Icon], index) => (
              <article className="pf-decision" key={title} data-reveal>
                <span className="pf-decision-icon">
                  <Icon />
                </span>
                <div>
                  <span className="pf-overline">{pad(index + 1)}</span>
                  <h3>{title}</h3>
                  {Array.isArray(content) ? (
                    <ul>
                      {content.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>{content}</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section
          id="architecture"
          data-portfolio-section
          className="pf-section pf-architecture"
        >
          <div className="pf-container">
            <div className="pf-section-heading" data-reveal>
              <div>
                <SectionLabel number="05">Architecture</SectionLabel>
                <h2>
                  From pixel
                  <br />
                  to <span className="pf-serif">production.</span>
                </h2>
              </div>
              <p>A connected stack, with intention at every layer.</p>
            </div>
            <div className="pf-architecture-flow" data-reveal>
              {[
                ["01", "The experience", "React + Vite", FiLayers],
                ["02", "The engine", "Rails · APIs · Realtime", FiCpu],
                ["03", "The foundation", "PostgreSQL · Redis · S3", FiDatabase],
              ].map(([number, title, stack, Icon]) => (
                <div key={number} className="pf-architecture-node">
                  <div>
                    <span>{number}</span>
                    <Icon />
                  </div>
                  <h3>{title}</h3>
                  <p>{stack}</p>
                  <span className="pf-node-port" />
                </div>
              ))}
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
              <FiArrowUpRight className="pf-contact-arrow" aria-hidden="true" />
            </h2>
            <p>
              Have a product in mind, a challenging problem, or a role to talk
              about? I’d love to hear it.
            </p>
            <div className="pf-social-links">
              {socialLinks.github ? (
                <a href={socialLinks.github} target="_blank" rel="noreferrer">
                  <FiGithub />
                  GitHub <FiArrowUpRight />
                </a>
              ) : null}
              {socialLinks.linkedin ? (
                <a href={socialLinks.linkedin} target="_blank" rel="noreferrer">
                  <FiLinkedin />
                  LinkedIn <FiArrowUpRight />
                </a>
              ) : null}
            </div>
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
