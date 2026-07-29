import React, { useContext, useState, useEffect } from "react";
import api from "../components/api";
import { AuthContext } from "../context/AuthContext";
import { COLOR_MAP, THEME_PRESETS } from "/utils/theme";
import { Switch, Tab } from "@headlessui/react";
import { Toaster, toast } from "react-hot-toast";
import {
  User,
  Palette,
  Bell,
  Shield,
  Building2,
  Moon,
  Sun,
  Check,
  CreditCard,
  Boxes,
  Users,
  HardDrive,
  FileText,
  ArrowUpRight
} from "lucide-react";

const landingPageOptions = [
  { value: "calendar", label: "Calendar" },
  { value: "posts", label: "Posts Feed" },
  { value: "profile", label: "My Profile" },
  { value: "vault", label: "Personal Vault" },
  { value: "knowledge", label: "Knowledge Base" },
  { value: "worklog", label: "Work Logs" },
  { value: "projects", label: "Projects Dashboard" },
  { value: "teams", label: "Teams Overview" },
  { value: "pdf-master", label: "PDF Master" },
  { value: "users", label: "People Directory" },
  { value: "departments", label: "Departments" },
  { value: "chat", label: "Chat" },
  { value: "notifications", label: "Notifications" },
];

const notificationPreferenceOptions = [
  {
    key: "commented",
    label: "Comments",
    description: "Get notified when someone comments on your posts."
  },
  {
    key: "assigned",
    label: "Assignments",
    description: "Get notified when a task or project is assigned to you."
  },
  {
    key: "update",
    label: "Task Updates",
    description: "Get notified when a task assigned to you changes status."
  },
  {
    key: "chat_message",
    label: "Chat Messages",
    description: "Get notified when someone sends a message in your conversations."
  },
  {
    key: "chat_ping",
    label: "Chat Mentions",
    description: "Get notified when someone mentions you in chat."
  },
  {
    key: "reacted",
    label: "Message Reactions",
    description: "Get notified when someone reacts to one of your chat messages."
  },
  {
    key: "calendar_reminder",
    label: "Calendar Reminders",
    description: "Get notified when your calendar reminders are due."
  },
  {
    key: "digest",
    label: "Weekly Digest",
    description: "Receive a weekly summary of your team's activity."
  },
];

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

const formatBytes = (bytes) => {
  const value = Number(bytes || 0);
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(value >= 10 * 1024 ** 3 ? 0 : 1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(0)} MB`;
  return `${value} B`;
};

const usagePercent = (used, limit) => {
  if (!limit) return 0;
  return Math.min(100, Math.round((Number(used || 0) / Number(limit)) * 100));
};

const planPriceLabel = (plan) => {
  if (!plan) return "";
  if (plan.monthly_cents === null || plan.monthly_cents === undefined) return "Custom";
  if (plan.monthly_cents === 0) return "Free";
  return `$${(plan.monthly_cents / 100).toFixed(0)}/mo`;
};

const Settings = () => {
  const { user, setUser } = useContext(AuthContext);
  const initialColor = COLOR_MAP[user?.color_theme] || user?.color_theme || "#3b82f6";
  const defaultNotificationPrefs = {
    commented: true,
    assigned: true,
    update: true,
    chat_message: true,
    chat_ping: true,
    reacted: true,
    calendar_reminder: true,
    digest: false
  };

  // State
  const [color, setColor] = useState(initialColor);
  const [darkMode, setDarkMode] = useState(user?.dark_mode || false);
  const [landingPage, setLandingPage] = useState(user?.landing_page || "posts");
  const [saving, setSaving] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState(defaultNotificationPrefs);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    password: "",
    password_confirmation: ""
  });
  const workspaceSaas = user?.workspace?.saas || {};
  const currentPlan = workspaceSaas.plan || {};
  const billing = workspaceSaas.billing || {};
  const limits = workspaceSaas.limits || {};
  const usage = workspaceSaas.usage || {};
  const modules = workspaceSaas.modules || [];
  const plans = workspaceSaas.plans || [];
  const nextPlan = plans.find((plan) => plan.key === currentPlan.next_plan_key);
  const limitRows = [
    { key: "seats", label: "Seats", icon: Users, used: usage.seats, limit: limits.seats },
    { key: "projects", label: "Projects", icon: Boxes, used: usage.projects, limit: limits.projects },
    { key: "pdf_documents", label: "PDF documents", icon: FileText, used: usage.pdf_documents, limit: limits.pdf_documents },
    { key: "storage_bytes", label: "Storage", icon: HardDrive, used: usage.storage_bytes, limit: limits.storage_bytes, format: formatBytes },
  ];

  useEffect(() => {
    setDarkMode(user?.dark_mode || false);
    setLandingPage(user?.landing_page || "posts");
    setColor(COLOR_MAP[user?.color_theme] || user?.color_theme || "#3b82f6");
    setNotificationPrefs({
      ...defaultNotificationPrefs,
      ...(user?.notification_preferences || {})
    });
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post("/update_profile", {
        auth: {
          color_theme: color,
          dark_mode: darkMode,
          landing_page: landingPage
        },
      });
      setUser((prev) => ({
        ...prev,
        color_theme: color,
        dark_mode: darkMode,
        landing_page: landingPage,
      }));
      toast.success("Settings updated.");
    } catch (err) {
      console.error("Failed to update profile", err);
      toast.error("Unable to update settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotifications = async () => {
    setSavingNotifications(true);
    try {
      await api.post("/update_profile", {
        auth: {
          notification_preferences: notificationPrefs
        },
      });
      setUser((prev) => ({
        ...prev,
        notification_preferences: notificationPrefs,
      }));
      toast.success("Notification preferences saved.");
    } catch (err) {
      console.error("Failed to update notification preferences", err);
      toast.error("Unable to save notifications. Please try again.");
    } finally {
      setSavingNotifications(false);
    }
  };

  const handlePasswordInput = (event) => {
    const { name, value } = event.target;
    setPasswordForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleChangePassword = async (event) => {
    event.preventDefault();

    if (passwordForm.password !== passwordForm.password_confirmation) {
      toast.error("New password confirmation does not match.");
      return;
    }

    setChangingPassword(true);
    try {
      await api.patch("/password/change", { password: passwordForm });
      setPasswordForm({ current_password: "", password: "", password_confirmation: "" });
      setShowPasswordForm(false);
      toast.success("Password changed successfully.");
    } catch (err) {
      const message = err?.response?.data?.errors?.join(", ") || "Unable to change password. Please try again.";
      toast.error(message);
    } finally {
      setChangingPassword(false);
    }
  };

  const tabs = [
    { name: 'Profile', icon: User },
    { name: 'Workspace', icon: Building2 },
    { name: 'Appearance', icon: Palette },
    { name: 'Notifications', icon: Bell },
    { name: 'Security', icon: Shield },
  ];

  return (
    <div className="app-page px-4 py-8 sm:px-6 lg:px-8">
      <Toaster position="top-right" />
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-primary">Settings</h1>
          <p className="mt-1 text-sm text-muted">Manage your account preferences and application settings.</p>
        </div>

        <Tab.Group as="div" className="lg:grid lg:grid-cols-12 lg:gap-x-8">
          <aside className="py-6 lg:col-span-3 lg:py-0">
            <Tab.List className="flex flex-col space-y-1">
              {tabs.map((tab) => (
                <Tab
                  key={tab.name}
                  className={({ selected }) =>
                    classNames(
                      selected ? 'app-tab-active' : '',
                      'app-tab outline-none focus-visible:ring-2 focus-visible:ring-theme/35'
                    )
                  }
                >
                  <tab.icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                  <span className="truncate">{tab.name}</span>
                </Tab>
              ))}
            </Tab.List>
          </aside>

          <main className="app-panel min-h-[500px] overflow-hidden lg:col-span-9">
            <Tab.Panels>
              <Tab.Panel className="space-y-8 p-6 focus:outline-none">
                <div>
                  <h3 className="text-lg font-semibold leading-6 text-primary">Profile Information</h3>
                  <p className="mt-1 text-sm text-muted">Update your account's public information and landing preferences.</p>
                </div>

                <div className="grid grid-cols-1 gap-y-6 sm:grid-cols-6 sm:gap-x-6">
                  <div className="sm:col-span-4">
                    <label className="block text-sm font-semibold text-shell-muted-strong">Email Address</label>
                    <div className="mt-1 flex rounded-xl shadow-sm">
                      <span className="inline-flex items-center rounded-l-xl border border-r-0 border-default bg-muted-surface px-3 text-sm text-muted">
                        @
                      </span>
                      <input
                        type="text"
                        disabled
                        value={user?.email || ''}
                        className="app-input min-w-0 flex-1 cursor-not-allowed rounded-none rounded-r-xl px-3 py-2 text-sm opacity-70"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-6">
                    <label className="block text-sm font-semibold text-shell-muted-strong">Landing Page</label>
                    <p className="mb-2 text-xs text-muted">Choose which page you see when you first log in.</p>
                    <select
                      value={landingPage}
                      onChange={(e) => setLandingPage(e.target.value)}
                      className="app-select mt-1 px-3 py-2 text-sm"
                    >
                      {landingPageOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end border-t border-default pt-6">
                  <button onClick={handleSave} disabled={saving} className="app-primary-button">
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </Tab.Panel>

              <Tab.Panel className="space-y-8 p-6 focus:outline-none">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold leading-6 text-primary">Workspace Plan</h3>
                    <p className="mt-1 text-sm text-muted">Package modules, limits, and upgrade path for {user?.workspace?.name || "this workspace"}.</p>
                  </div>
                  <span className="app-badge border-theme/25 bg-theme/10 text-theme">
                    {billing.status || "trialing"}
                  </span>
                </div>

                <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                  <section className="app-card p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Current tier</p>
                        <h4 className="mt-2 text-2xl font-bold text-primary">{currentPlan.name || "Starter"}</h4>
                        <p className="mt-2 text-sm text-muted">{currentPlan.positioning || "Operations workspace for software and service teams."}</p>
                      </div>
                      <div className="rounded-2xl border border-theme/20 bg-theme/10 p-3 text-theme">
                        <CreditCard className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="mt-6 flex flex-wrap items-center gap-3">
                      <span className="text-xl font-bold text-primary">{planPriceLabel(currentPlan)}</span>
                      {billing.trial_ends_at ? (
                        <span className="app-badge">Trial ends {new Date(billing.trial_ends_at).toLocaleDateString()}</span>
                      ) : null}
                    </div>
                    {nextPlan ? (
                      <button type="button" className="app-primary-button mt-6">
                        <ArrowUpRight className="h-4 w-4" />
                        Plan upgrade: {nextPlan.name}
                      </button>
                    ) : (
                      <button type="button" className="app-secondary-button mt-6">
                        Contact enterprise support
                      </button>
                    )}
                  </section>

                  <section className="app-card p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">Workspace usage</p>
                    <div className="mt-4 space-y-4">
                      {limitRows.map((row) => {
                        const Icon = row.icon;
                        const percent = usagePercent(row.used, row.limit);
                        const format = row.format || ((value) => value ?? 0);
                        return (
                          <div key={row.key}>
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <span className="flex items-center gap-2 text-sm font-semibold text-primary">
                                <Icon className="h-4 w-4 text-theme" />
                                {row.label}
                              </span>
                              <span className="text-xs font-semibold text-muted">
                                {format(row.used)} / {row.limit ? format(row.limit) : "Unlimited"}
                              </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-muted-surface">
                              <div className="h-full rounded-full bg-theme" style={{ width: `${row.limit ? percent : 100}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </div>

                <section>
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <div>
                      <h4 className="text-sm font-semibold text-primary">Packaged modules</h4>
                      <p className="mt-1 text-sm text-muted">Modules are centralized in the SaaS plan catalog for future billing enforcement.</p>
                    </div>
                    <span className="app-badge">{modules.filter((item) => item.enabled).length}/{modules.length} enabled</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {modules.map((module) => (
                      <div key={module.key} className={`app-card p-4 ${module.enabled ? "" : "opacity-65"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-primary">{module.name}</p>
                            <p className="mt-1 text-xs leading-5 text-muted">{module.description}</p>
                          </div>
                          <span className={module.enabled ? "app-badge app-badge-success" : "app-badge"}>
                            {module.enabled ? "Enabled" : module.minimum_plan}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </Tab.Panel>

              <Tab.Panel className="space-y-8 p-6 focus:outline-none">
                <div>
                  <h3 className="text-lg font-semibold leading-6 text-primary">Appearance Details</h3>
                  <p className="mt-1 text-sm text-muted">Customize the look and feel of your workspace.</p>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="mb-3 block text-sm font-semibold text-shell-muted-strong">Theme Color</label>
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="h-10 w-10 cursor-pointer overflow-hidden rounded-full border border-default bg-card p-1"
                        title="Custom Color"
                      />
                      {THEME_PRESETS.map((preset) => (
                        <button
                          key={preset.key}
                          type="button"
                          onClick={() => setColor(preset.value)}
                          className={`flex h-10 w-10 items-center justify-center rounded-full transition-all ${color === preset.value ? "scale-110 ring-2 ring-theme ring-offset-2 ring-offset-app" : "hover:scale-105"}`}
                          style={{ backgroundColor: preset.value }}
                          title={preset.name}
                        >
                          {color === preset.value && <Check className="h-5 w-5 text-white drop-shadow-md" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-default pt-4">
                    <label className="mb-3 block text-sm font-semibold text-shell-muted-strong">Display Mode</label>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setDarkMode(false)}
                        className={`flex items-center justify-center gap-2 rounded-xl border p-4 transition-all ${!darkMode ? 'border-theme bg-theme/10 text-theme ring-1 ring-theme' : 'border-default text-shell-muted-strong hover:bg-card'}`}
                      >
                        <Sun className="h-5 w-5" />
                        <span className="text-sm font-semibold">Light Mode</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDarkMode(true)}
                        className={`flex items-center justify-center gap-2 rounded-xl border p-4 transition-all ${darkMode ? 'border-theme bg-theme/10 text-theme ring-1 ring-theme' : 'border-default text-shell-muted-strong hover:bg-card'}`}
                      >
                        <Moon className="h-5 w-5" />
                        <span className="text-sm font-semibold">Dark Mode</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-4 border-t border-default pt-4 sm:grid-cols-3">
                    <div className="app-card p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Primary Button</p>
                      <button
                        type="button"
                        className="mt-4 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-lg"
                        style={{ backgroundColor: color }}
                      >
                        Preview
                      </button>
                    </div>
                    <div className="app-card p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Card Surface</p>
                      <p className="mt-3 text-sm font-semibold text-primary">Workspace card</p>
                      <p className="mt-1 text-xs text-muted">Uses shared surface and border tokens.</p>
                    </div>
                    <div className="app-card space-y-2 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Status Palette</p>
                      <span className="app-badge app-badge-success">Success</span>
                      <span className="app-badge app-badge-warning">Warning</span>
                      <span className="app-badge app-badge-danger">Danger</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end border-t border-default pt-6">
                  <button onClick={handleSave} disabled={saving} className="app-primary-button">
                    {saving ? 'Saving...' : 'Save Appearance'}
                  </button>
                </div>
              </Tab.Panel>

              <Tab.Panel className="space-y-8 p-6 focus:outline-none">
                <div>
                  <h3 className="text-lg font-semibold leading-6 text-primary">Notifications</h3>
                  <p className="mt-1 text-sm text-muted">Decide how and when you want to be notified.</p>
                </div>

                <div className="space-y-4">
                  {notificationPreferenceOptions.map((option, index) => (
                    <React.Fragment key={option.key}>
                      {index > 0 && <div className="border-t border-default"></div>}
                      <Switch.Group as="div" className="flex items-center justify-between gap-4 py-3">
                        <span className="flex flex-grow flex-col">
                          <Switch.Label as="span" className="text-sm font-semibold text-primary" passive>
                            {option.label}
                          </Switch.Label>
                          <Switch.Description as="span" className="text-sm text-muted">
                            {option.description}
                          </Switch.Description>
                        </span>
                        <Switch
                          checked={Boolean(notificationPrefs[option.key])}
                          onChange={(val) => setNotificationPrefs((p) => ({ ...p, [option.key]: val }))}
                          className={`${notificationPrefs[option.key] ? 'bg-theme' : 'bg-muted-surface'} relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-theme/35 focus:ring-offset-2 focus:ring-offset-app`}
                        >
                          <span aria-hidden="true" className={`${notificationPrefs[option.key] ? 'translate-x-5' : 'translate-x-0'} pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`} />
                        </Switch>
                      </Switch.Group>
                    </React.Fragment>
                  ))}
                </div>

                <div className="flex justify-end border-t border-default pt-6">
                  <button onClick={handleSaveNotifications} disabled={savingNotifications} className="app-primary-button">
                    {savingNotifications ? 'Saving...' : 'Save Notifications'}
                  </button>
                </div>
              </Tab.Panel>

              <Tab.Panel className="space-y-8 p-6 focus:outline-none">
                <div>
                  <h3 className="text-lg font-semibold leading-6 text-primary">Security</h3>
                  <p className="mt-1 text-sm text-muted">Manage your password and security sessions.</p>
                </div>

                <div className="border-l-4 border-warning bg-warning-soft p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <Shield className="h-5 w-5 text-warning" aria-hidden="true" />
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-warning">
                        Two-factor authentication is not yet enabled for this account.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-primary">Password</h4>
                  <div className="mt-4 max-w-xl text-sm text-muted">
                    <p>Ensure your account is using a long, random password to stay secure.</p>
                  </div>
                  <div className="mt-4">
                    {!showPasswordForm ? (
                      <button type="button" onClick={() => setShowPasswordForm(true)} className="app-secondary-button">
                        Change Password
                      </button>
                    ) : (
                      <form onSubmit={handleChangePassword} className="max-w-xl space-y-4 rounded-lg border border-default bg-surface-card p-4">
                        <div>
                          <label className="mb-1 block text-sm font-semibold text-primary" htmlFor="current_password">
                            Current password
                          </label>
                          <input
                            id="current_password"
                            name="current_password"
                            type="password"
                            required
                            value={passwordForm.current_password}
                            onChange={handlePasswordInput}
                            className="w-full rounded-lg border border-default bg-surface-elevated px-3 py-2 text-primary focus:border-theme focus:outline-none focus:ring-2 focus:ring-theme/20"
                          />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-sm font-semibold text-primary" htmlFor="password">
                              New password
                            </label>
                            <input
                              id="password"
                              name="password"
                              type="password"
                              required
                              minLength={6}
                              value={passwordForm.password}
                              onChange={handlePasswordInput}
                              className="w-full rounded-lg border border-default bg-surface-elevated px-3 py-2 text-primary focus:border-theme focus:outline-none focus:ring-2 focus:ring-theme/20"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-sm font-semibold text-primary" htmlFor="password_confirmation">
                              Confirm new password
                            </label>
                            <input
                              id="password_confirmation"
                              name="password_confirmation"
                              type="password"
                              required
                              minLength={6}
                              value={passwordForm.password_confirmation}
                              onChange={handlePasswordInput}
                              className="w-full rounded-lg border border-default bg-surface-elevated px-3 py-2 text-primary focus:border-theme focus:outline-none focus:ring-2 focus:ring-theme/20"
                            />
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          <button type="submit" disabled={changingPassword} className="app-primary-button">
                            {changingPassword ? "Saving..." : "Save Password"}
                          </button>
                          <button
                            type="button"
                            disabled={changingPassword}
                            onClick={() => {
                              setShowPasswordForm(false);
                              setPasswordForm({ current_password: "", password: "", password_confirmation: "" });
                            }}
                            className="app-secondary-button"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                </div>

                <div className="border-t border-default pt-6">
                  <h4 className="text-sm font-semibold text-danger">Danger Zone</h4>
                  <div className="mt-4 max-w-xl text-sm text-muted">
                    <p>Once you delete your account, there is no going back. Please be certain.</p>
                  </div>
                  <div className="mt-4">
                    <button type="button" className="app-secondary-button app-danger-button">
                      Delete Account
                    </button>
                  </div>
                </div>
              </Tab.Panel>
            </Tab.Panels>
          </main>
        </Tab.Group>
      </div>
    </div>
  );
};

export default Settings;
