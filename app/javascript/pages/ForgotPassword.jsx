import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { requestPasswordReset } from "../components/api";
import SpinnerOverlay from "../components/ui/SpinnerOverlay";
import WorkspaceOrb from "../components/landing/WorkspaceOrb";

const resetMetrics = [
  ["Secure", "Reset flow"],
  ["Fast", "Inbox link"],
  ["Private", "Account safe"],
];

const resetFeatures = [
  {
    title: "Recovery Brief",
    metric: "Email",
    copy: "Send a protected reset link and get back to planning without leaving the premium workspace feel.",
  },
  {
    title: "Security First",
    metric: "Vault",
    copy: "Your address stays private, reset links are time-sensitive, and sign-in remains protected.",
  },
];

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
      toast.success("If that account exists, a reset link is on the way.");
    } catch (error) {
      toast.error("Something went wrong. Please retry.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.22),transparent_32%),radial-gradient(circle_at_80%_20%,rgba(168,85,247,0.18),transparent_28%),linear-gradient(135deg,#020617_0%,#0f172a_48%,#111827_100%)] text-slate-900">
      {loading && <SpinnerOverlay />}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="absolute right-0 top-1/3 h-80 w-80 rounded-full bg-indigo-400/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 h-72 w-72 rounded-full bg-fuchsia-300/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-45"
          style={{
            backgroundImage:
              "linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
      </div>
      <div className="relative z-10 flex min-h-dvh items-center px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.8fr)] lg:gap-8 xl:gap-10">
          <div className="auth-orb-panel hidden lg:block">
            <WorkspaceOrb
              eyebrow="Secure Recovery"
              title="Reset access without breaking your flow."
              description="Request a password link from the same cinematic command experience and return to your projects, chat, vault, and daily focus."
              metrics={resetMetrics}
              featureCards={resetFeatures}
            />
          </div>

          <div className="flex justify-center lg:justify-end">
            <div className="w-full max-w-sm rounded-2xl border border-white/60 bg-white/95 p-6 shadow-2xl shadow-slate-900/10 transition-transform duration-200 hover:-translate-y-1 sm:p-7">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-100">
                🔒 Security first
              </p>
              <h2 className="mb-2 text-center text-2xl font-bold text-slate-900">Forgot password?</h2>
              <p className="mb-6 text-center text-sm text-slate-600">
                Enter the email you use to sign in. We will send a secure link to reset your password.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700 required-label" htmlFor="email">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    name="email"
                    placeholder="you@example.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-2.5 text-slate-800 placeholder-slate-400 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 font-semibold text-white shadow-lg transition hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  Send reset email
                </button>
              </form>

              {sent && (
                <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                  Check your inbox for the reset link. If it is not there, look in Spam or try again.
                </div>
              )}

              <p className="mt-5 text-center text-sm text-slate-600">
                Remembered it?{" "}
                <button
                  type="button"
                  onClick={() => navigate("/", { state: { mode: "login" } })}
                  className="font-semibold text-blue-600 transition hover:text-blue-700"
                >
                  Go back to sign in
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
