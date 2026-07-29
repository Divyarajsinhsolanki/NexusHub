import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import { resetPassword } from "../components/api";
import SpinnerOverlay from "../components/ui/SpinnerOverlay";

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const emailParam = searchParams.get("email") || "";
  const [form, setForm] = useState({ password: "", password_confirmation: "" });
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await resetPassword({ token, ...form });
      setComplete(true);
      toast.success("Password updated. You can sign in now.");
      setTimeout(() => navigate("/", { state: { mode: "login" } }), 800);
    } catch (error) {
      const msg = error?.response?.data?.errors?.join(", ") || "Could not reset password. Try again.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-950 px-4 text-slate-100">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl">
          <h1 className="text-2xl font-bold">Reset link is missing or expired</h1>
          <p className="mt-3 text-sm text-slate-300">Request a new one and try again.</p>
          <button
            onClick={() => navigate("/forgot-password")}
            className="mt-6 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-2 text-slate-900 font-semibold shadow-lg"
          >
            Request reset link
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-50">
      {loading && <SpinnerOverlay />}
      <div className="mx-auto flex min-h-dvh max-w-5xl flex-col items-center justify-center gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:py-8">
        <div className="relative w-full rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur sm:p-7 lg:w-2/5">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-10 top-8 h-32 w-32 rounded-full bg-indigo-500/20 blur-3xl" />
            <div className="absolute -right-10 bottom-4 h-28 w-28 rounded-full bg-cyan-400/25 blur-3xl" />
          </div>
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-blue-100 ring-1 ring-white/10">
            ✅ Final step
          </p>
          <h1 className="text-3xl font-bold leading-tight text-white">Set a new password</h1>
          <p className="mt-3 text-sm text-slate-200/80">
            Keep this password unique to your account. We will sign you in right after the update.
          </p>
          <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-400/80">Resetting for</p>
            <p className="text-lg font-semibold text-white">{decodeURIComponent(emailParam || "") || "Your account"}</p>
          </div>
        </div>

        <div className="w-full lg:w-3/5">
          <div className="w-full rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur sm:p-7">
            <h2 className="mb-2 text-2xl font-bold text-white">Create strong credentials</h2>
            <p className="mb-6 text-sm text-slate-300">
              Use at least 12 characters and include letters, numbers, and symbols.
            </p>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-200 required-label" htmlFor="password">
                  New password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  value={form.password}
                  onChange={handleChange}
                  placeholder="••••••••••"
                  className="w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2.5 text-slate-50 placeholder-slate-400 shadow-inner focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200/60"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-200 required-label" htmlFor="password_confirmation">
                  Confirm password
                </label>
                <input
                  id="password_confirmation"
                  name="password_confirmation"
                  type="password"
                  required
                  minLength={8}
                  value={form.password_confirmation}
                  onChange={handleChange}
                  placeholder="Repeat password"
                  className="w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2.5 text-slate-50 placeholder-slate-400 shadow-inner focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200/60"
                />
              </div>
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-400 to-blue-500 px-4 py-2.5 font-semibold text-slate-900 shadow-lg shadow-indigo-500/30 transition hover:from-indigo-300 hover:to-blue-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                Update password
              </button>
            </form>

            {complete && (
              <div className="mt-6 rounded-xl border border-emerald-300/30 bg-emerald-400/10 p-4 text-sm text-emerald-100">
                Password updated. Redirecting you to sign in...
              </div>
            )}

            <p className="mt-5 text-center text-sm text-slate-300">
              Stuck?{" "}
              <button
                type="button"
                onClick={() => navigate("/forgot-password")}
                className="font-semibold text-cyan-200 hover:text-white"
              >
                Request a fresh link
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
