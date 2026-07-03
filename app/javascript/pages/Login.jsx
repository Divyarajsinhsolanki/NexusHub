import React, { useState, useContext, useEffect } from "react";
import { AuthContext } from "../context/AuthContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { firebaseEnabled } from "../firebaseFlags";
import { Toaster, toast } from "react-hot-toast";
import SpinnerOverlay from "../components/ui/SpinnerOverlay";
import WorkspaceOrb from "../components/landing/WorkspaceOrb";

const Login = ({ switchToSignup }) => {
  const { handleLogin, handleGoogleLogin } = useContext(AuthContext);
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await handleLogin({ auth: formData });
    } catch (err) {
      const msg = "Invalid email or password. Please try again.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (searchParams.get("confirmed")) {
      toast.success("Email confirmed. Please log in.");
    }

  }, [searchParams]);

  return (
    <div className="w-full">
      <Toaster position="top-right" />
      {loading && <SpinnerOverlay />}
      <div className="mx-auto grid w-full max-w-6xl items-center gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.8fr)] lg:gap-8 xl:gap-10">
        <div className="auth-orb-panel hidden lg:block">
          <WorkspaceOrb />
        </div>

        <div className="flex justify-start sm:justify-center lg:justify-end">
          <div className="w-full max-w-xs rounded-2xl border border-shell-border bg-surface-elevated p-6 shadow-shell-lg transition-transform duration-200 hover:-translate-y-1 sm:max-w-sm sm:p-7">
            <h2 className="mb-1 text-center text-2xl font-bold text-shell-text-strong">Welcome back</h2>
            <p className="mb-6 text-center text-sm text-shell-muted">Sign in to continue where you left off.</p>

            {/* 📝 Login Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-semibold text-shell-muted-strong required-label" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  name="email"
                  placeholder="you@example.com"
                  required
                  className="w-full rounded-xl border-2 border-shell-border bg-surface-card px-4 py-2.5 text-shell-text placeholder:text-muted/70 shadow-sm transition focus:border-theme focus:ring-1 focus:ring-theme/35"
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-sm font-semibold text-shell-muted-strong required-label" htmlFor="password">
                    Password
                  </label>
                  <div className="flex items-center gap-3 text-xs text-theme">
                    <button
                      type="button"
                      onClick={() => navigate("/forgot-password")}
                      className="font-semibold text-theme transition hover:text-theme/80"
                    >
                      Forgot?
                    </button>
                    <span className="text-[11px] text-theme/80">Secure login</span>
                  </div>
                </div>
                <input
                  id="password"
                  type="password"
                  name="password"
                  placeholder="••••••••"
                  required
                  className="w-full rounded-xl border-2 border-shell-border bg-surface-card px-4 py-2.5 text-shell-text placeholder:text-muted/70 shadow-sm transition focus:border-theme focus:ring-1 focus:ring-theme/35"
                  value={formData.password}
                  onChange={handleChange}
                />
              </div>

              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-shell-primary py-2.5 font-semibold text-white shadow-lg shadow-theme/20 transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-theme/25"
              >
                Log In
              </button>
            </form>

            {/* 🚨 Error Message */}
            {error && (
              <div className="mt-5 flex items-center gap-2 rounded-lg border border-danger/20 bg-danger-soft p-3 text-danger">
                ⚠️ {error}
              </div>
            )}
            {firebaseEnabled ? (
              <>
                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-shell-border" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="bg-surface-elevated px-2 text-shell-muted">OR</span>
                  </div>
                </div>

                <button
                  onClick={async () => {
                    setLoading(true);
                    try {
                      await handleGoogleLogin();
                    } catch (googleError) {
                      toast.error(googleError.message || "Google login failed.");
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-shell-border bg-surface-card py-2.5 font-medium text-shell-muted-strong shadow-sm transition hover:-translate-y-0.5 hover:bg-surface-card-hover hover:shadow-lg"
                >
                  <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M12.545 10.239v3.821h5.445c-.712 2.315-2.647 3.972-5.445 3.972a6.033 6.033 0 110-12.064c1.835 0 3.456.705 4.691 1.942l3.099-3.101A10.113 10.113 0 0012.545 2C7.021 2 2.545 6.477 2.545 12s4.476 10 10 10c5.523 0 10-4.477 10-10a10.1 10.1 0 00-.167-1.785l-9.833-.006z"
                    />
                  </svg>
                  Sign in with Google
                </button>
              </>
            ) : null}

            <p className="mt-5 text-center text-sm text-shell-muted">
              Don't have an account?{" "}
              <button
                type="button"
                onClick={switchToSignup}
                className="font-semibold text-theme transition hover:text-theme/80"
              >
                Sign Up
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
  
};

export default Login;
