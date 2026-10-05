import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { requestPasswordReset } from "../components/api";
import AuthBackground from "../components/ui/AuthBackground";
import logo from "../images/logo.webp";
import { FiArrowLeft, FiMail } from "react-icons/fi";
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
  const submitting = useRef(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setError(null);
    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
      toast.success("If that account exists, a reset link is on the way.");
    } catch {
      setError("Something went wrong. Please retry.");
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-dvh overflow-x-hidden auth-page bg-shell-bg">
      <AuthBackground />
      <div className="relative z-10 flex min-h-dvh items-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.8fr)] lg:gap-8 xl:gap-10">
          <div className="auth-orb-panel hidden lg:block">
            <WorkspaceOrb
              eyebrow="Secure Recovery"
              title="Reset access without breaking your flow."
              description="Get a secure reset link and return to your projects, conversations, and daily focus."
              metrics={resetMetrics}
              featureCards={resetFeatures}
            />
          </div>

          <div className="flex justify-center lg:justify-end">
            <div className="auth-login-card w-full max-w-md rounded-2xl border border-shell-border bg-surface-elevated p-6 sm:p-9">
              <div className="mb-7 flex items-center gap-3"><img src={logo} alt="" className="h-10 w-10 rounded-xl object-contain" /><span className="text-lg font-bold text-shell-text-strong">NexusHub</span></div>
              <h2 className="mb-2 text-3xl font-bold text-shell-text-strong">Forgot password?</h2>
              <p className="mb-7 text-sm text-shell-muted">
                Enter the email you use to sign in. We will send a secure link to reset your password.
              </p>
              <form onSubmit={handleSubmit} className="space-y-5" aria-busy={loading}>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-shell-muted-strong required-label" htmlFor="email">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    disabled={loading}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "reset-error" : undefined}
                    placeholder="you@example.com"
                    required
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(null); setSent(false); }}
                    className="w-full rounded-xl border border-shell-border bg-surface-card px-4 py-2.5 text-shell-text placeholder:text-muted/70 shadow-sm transition focus:border-theme focus:outline-none focus:ring-1 focus:ring-theme/35"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-shell-primary px-4 py-2.5 font-semibold text-white shadow-lg shadow-theme/20 transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-theme/25 disabled:cursor-wait disabled:opacity-60"
                >
                  <FiMail aria-hidden="true" /> {loading ? "Sending…" : "Send reset email"}
                </button>
              </form>

              {error && <p id="reset-error" role="alert" className="mt-5 rounded-xl border border-danger/20 bg-danger-soft p-3 text-sm text-danger">{error}</p>}
              {sent && (
                <div role="status" className="mt-6 rounded-xl border border-success/20 bg-success-soft p-4 text-sm text-success">
                  If an account exists for this address, a reset link is on the way. Check your inbox and spam folder.
                </div>
              )}

              <p className="mt-5 text-center text-sm text-shell-muted">
                Remembered it?{" "}
                <button
                  type="button"
                  onClick={() => navigate("/login")}
                  className="inline-flex items-center gap-1 font-semibold text-theme transition hover:text-theme/80"
                >
                  <FiArrowLeft aria-hidden="true" /> Back to sign in
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
