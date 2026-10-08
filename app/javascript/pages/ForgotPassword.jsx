import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { requestPasswordReset } from "../components/api";
import AuthLayout from "../components/ui/AuthLayout";
import { FiArrowLeft, FiMail } from "react-icons/fi";

const ForgotPassword = ({ switchToLogin, embedded = false }) => {
  const Layout = embedded ? React.Fragment : AuthLayout;
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
    <Layout>
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
                  onClick={switchToLogin || (() => navigate("/login"))}
                  className="inline-flex items-center gap-1 font-semibold text-theme transition hover:text-theme/80"
                >
                  <FiArrowLeft aria-hidden="true" /> Back to sign in
                </button>
              </p>
    </Layout>
  );
};

export default ForgotPassword;
