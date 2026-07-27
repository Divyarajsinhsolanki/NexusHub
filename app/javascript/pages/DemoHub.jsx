import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowUpRight, FiClock, FiDatabase, FiLayers, FiShield, FiZap } from "react-icons/fi";
import { fetchDemoManifest } from "../components/api";

const iconMap = [FiLayers, FiClock, FiZap, FiDatabase, FiShield, FiArrowUpRight];

const DemoHub = () => {
  const [manifest, setManifest] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchDemoManifest()
      .then(({ data }) => setManifest(data))
      .catch(() => setError("The guided tour could not be loaded."));
  }, []);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white/85 px-5 py-8 text-slate-950 shadow-sm sm:rounded-[30px] sm:px-8 sm:py-9 lg:px-10">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-blue-700">Guided Product Tour</p>
        <div className="mt-5 grid gap-8 lg:grid-cols-[1.4fr_0.6fr] lg:items-end">
          <div>
            <h1 className="max-w-4xl text-[clamp(1.85rem,5vw,2.65rem)] font-semibold leading-tight tracking-[-0.035em]">
              Understand Nexus Hub in about five minutes.
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-slate-600">
              Follow the six product areas below. Each card opens a real application screen backed by synthetic,
              read-only data.
            </p>
          </div>
          <div className="rounded-2xl border border-blue-100 bg-blue-50/80 p-5">
            <p className="text-sm text-slate-500">Demo workspace</p>
            <p className="mt-1 text-lg font-semibold text-slate-950">{manifest?.workspace?.name || "Nexus Hub Demo"}</p>
            <p className="mt-4 inline-flex items-center gap-2 text-sm text-blue-700">
              <FiClock /> {manifest?.duration || "5 minutes"}
            </p>
          </div>
        </div>
      </section>

      {error ? <p className="mt-6 rounded-2xl bg-rose-50 p-4 text-rose-700">{error}</p> : null}

      <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {(manifest?.groups || []).map((group, index) => {
          const Icon = iconMap[index % iconMap.length];
          return (
            <Link
              key={group.key}
              to={group.route}
              className="group rounded-[22px] border border-white/80 bg-white/80 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur transition hover:-translate-y-1 hover:shadow-[0_32px_70px_rgba(15,23,42,0.14)] sm:rounded-[30px] sm:p-6"
            >
              <div className="flex items-start justify-between">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-sm font-semibold text-slate-400">
                  0{group.step || index + 1} / 0{manifest?.total_steps || 6}
                </span>
              </div>
              <h2 className="mt-8 text-xl font-semibold tracking-[-0.03em] text-slate-950">{group.title}</h2>
              <p className="mt-3 leading-7 text-slate-600">{group.summary}</p>
              {group.review_notes ? (
                <p className="mt-4 rounded-2xl bg-blue-50 p-4 text-sm leading-6 text-blue-900">
                  <span className="font-semibold">What to notice:</span> {group.review_notes}
                </p>
              ) : null}
              <span className="mt-6 inline-flex items-center gap-2 font-semibold text-blue-700">
                Explore screen <FiArrowUpRight className="transition group-hover:translate-x-1 group-hover:-translate-y-1" />
              </span>
            </Link>
          );
        })}
      </section>

      <section id="architecture" className="mt-8 rounded-[24px] border border-slate-200 bg-white p-5 sm:rounded-[32px] sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-blue-700">Architecture</p>
        <h2 className="mt-3 text-[clamp(1.45rem,3vw,2rem)] font-semibold tracking-[-0.035em] text-slate-950">What to look for behind the UI</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            "Rails JSON APIs with workspace-scoped authorization",
            "React route-level code splitting and reusable product components",
            "PostgreSQL, Active Job, Active Storage, and Action Cable workflows",
          ].map((item) => (
            <div key={item} className="rounded-2xl bg-slate-50 p-5 font-medium leading-7 text-slate-700">{item}</div>
          ))}
        </div>
        {manifest?.recommended_start ? (
          <Link to={manifest.recommended_start} className="mt-7 inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 font-semibold text-white">
            Start the recommended tour <FiArrowUpRight />
          </Link>
        ) : null}
      </section>
    </div>
  );
};

export default DemoHub;
