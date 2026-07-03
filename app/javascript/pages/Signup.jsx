import React, { useState, useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import submitForm from "../utils/formSubmit";
import { Toaster, toast } from "react-hot-toast";
import SpinnerOverlay from "../components/ui/SpinnerOverlay";
import WorkspaceOrb from "../components/landing/WorkspaceOrb";

const signupMetrics = [
  ["2 min", "Quick setup"],
  ["SSO", "Google ready"],
  ["Vault", "Secure profile"],
];

const signupFeatures = [
  {
    title: "Team Launch",
    metric: "Ready",
    copy: "Create your profile, join the workspace, and start planning from one premium command deck.",
  },
  {
    title: "Smart Flow",
    metric: "AI",
    copy: "Unlock momentum, knowledge prompts, chat, tasks, and vault access with a focused account.",
  },
];

const Signup = ({ switchToLogin }) => {
  const { handleGoogleLogin } = useContext(AuthContext);
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    profile_picture: null,
  });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, type, files, value } = e.target;
    if (type === "file") {
      setFormData((prev) => ({ ...prev, [name]: files[0] }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const submissionData = new FormData();
    submissionData.append("auth[first_name]", formData.first_name);
    submissionData.append("auth[last_name]", formData.last_name);
    submissionData.append("auth[email]", formData.email);
    submissionData.append("auth[password]", formData.password);
    if (formData.profile_picture) {
      submissionData.append("auth[profile_picture]", formData.profile_picture);
    }

    try {
      await submitForm("/api/signup", "POST", submissionData);
      if (switchToLogin) switchToLogin();
      else navigate("/", { state: { mode: "login" } });
      toast.success("Account created. Please log in.");
    } catch (err) {
      const msg = err.response?.data?.errors?.join(", ") || "Signup failed. Please try again.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <Toaster position="top-right" />
      {loading && <SpinnerOverlay />}
      <div className="mx-auto grid w-full max-w-6xl items-center gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.84fr)] lg:gap-8 xl:gap-10">
        <div className="auth-orb-panel hidden lg:block">
          <WorkspaceOrb
            eyebrow="Start NexusHub"
            title="Build your workspace identity in one polished flow."
            description="Create an account to unlock sprints, conversations, knowledge signals, secure vaults, and a calmer daily operating rhythm."
            metrics={signupMetrics}
            featureCards={signupFeatures}
          />
        </div>

        <div className="flex justify-start sm:justify-center lg:justify-end">
          <div className="w-full max-w-xs rounded-2xl border border-shell-border bg-surface-elevated p-6 shadow-shell-lg transition-transform duration-200 hover:-translate-y-1 sm:max-w-md sm:p-7">
            <h2 className="mb-1 text-center text-2xl font-bold text-shell-text-strong">Create account</h2>
            <p className="mb-6 text-center text-sm text-shell-muted">Join the workspace and start your command deck.</p>

            <form onSubmit={handleSubmit} className="space-y-4" encType="multipart/form-data">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-shell-muted-strong required-label" htmlFor="first_name">
                    First name
                  </label>
                  <input
                    id="first_name"
                    type="text"
                    name="first_name"
                    placeholder="Ada"
                    required
                    className="w-full rounded-xl border-2 border-shell-border bg-surface-card px-4 py-2.5 text-shell-text placeholder:text-muted/70 shadow-sm transition focus:border-theme focus:ring-1 focus:ring-theme/35"
                    value={formData.first_name}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-shell-muted-strong required-label" htmlFor="last_name">
                    Last name
                  </label>
                  <input
                    id="last_name"
                    type="text"
                    name="last_name"
                    placeholder="Lovelace"
                    required
                    className="w-full rounded-xl border-2 border-shell-border bg-surface-card px-4 py-2.5 text-shell-text placeholder:text-muted/70 shadow-sm transition focus:border-theme focus:ring-1 focus:ring-theme/35"
                    value={formData.last_name}
                    onChange={handleChange}
                  />
                </div>
              </div>

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
                <label className="mb-1 block text-sm font-semibold text-shell-muted-strong required-label" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  name="password"
                  placeholder="Create a strong password"
                  required
                  className="w-full rounded-xl border-2 border-shell-border bg-surface-card px-4 py-2.5 text-shell-text placeholder:text-muted/70 shadow-sm transition focus:border-theme focus:ring-1 focus:ring-theme/35"
                  value={formData.password}
                  onChange={handleChange}
                />
              </div>

              <div>
                <label htmlFor="profile_picture" className="mb-2 block text-sm font-semibold text-shell-muted-strong">
                  Profile picture <span className="font-normal text-shell-muted">optional</span>
                </label>
                <input
                  type="file"
                  id="profile_picture"
                  name="profile_picture"
                  accept="image/*"
                  title="Profile Picture"
                  onChange={handleChange}
                  className="w-full rounded-xl border-2 border-shell-border bg-surface-card px-4 py-2.5 text-sm text-shell-muted-strong shadow-sm transition file:mr-4 file:rounded-lg file:border-0 file:bg-theme/10 file:px-4 file:py-1.5 file:text-sm file:font-semibold file:text-theme hover:file:bg-theme/15 focus:border-theme focus:ring-1 focus:ring-theme/35"
                />
              </div>

              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-shell-primary py-2.5 font-semibold text-white shadow-lg shadow-theme/20 transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-theme/25"
              >
                Sign Up
              </button>
            </form>

            {error && (
              <div className="mt-5 flex items-center gap-2 rounded-lg border border-danger/20 bg-danger-soft p-3 text-sm text-danger">
                ⚠️ {error}
              </div>
            )}

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
              Sign up with Google
            </button>

            <p className="mt-5 text-center text-sm text-shell-muted">
              Already have an account?{" "}
              <button
                type="button"
                onClick={switchToLogin}
                className="font-semibold text-theme transition hover:text-theme/80"
              >
                Log in
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signup;
