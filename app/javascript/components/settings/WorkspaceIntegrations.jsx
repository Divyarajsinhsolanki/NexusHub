import React, { useContext, useEffect, useState } from "react";
import api from "../api";
import { AuthContext } from "../../context/AuthContext";

export default function WorkspaceIntegrations() {
  const { user } = useContext(AuthContext);
  const allowed = user?.permissions?.includes("integrations.manage");
  const [connections, setConnections] = useState([]);
  const [provider, setProvider] = useState("google_sheets");
  const [credential, setCredential] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => { const { data } = await api.get("/workspace_integrations"); setConnections(data); };
  useEffect(() => {
    setCredential(""); setConnections([]);
    if (allowed) load().catch(() => setError("Verify MFA before managing workspace connections."));
  }, [allowed, user?.id, user?.workspace?.id, user?.mfa?.recent]);
  if (!allowed) return null;
  const run = async (action) => {
    setBusy(true); setError(""); setNotice("");
    try { await action(); setCredential(""); await load(); setNotice("Workspace connection updated."); }
    catch (failure) { setCredential(""); setError(failure.response?.data?.message || failure.response?.data?.error || "Connection could not be updated."); }
    finally { setBusy(false); }
  };
  return <section className="space-y-4 rounded-xl border border-default p-6">
    <h3 className="text-lg font-semibold">Workspace connections</h3>
    <p className="text-sm text-muted">Connect this company's Google Sheets and Slack. Saved credentials stay hidden. Recent MFA verification is required to replace or disconnect a connection.</p>
    {connections.map((connection) => <article key={connection.provider} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-default p-3">
      <div><strong>{connection.provider === "google_sheets" ? "Google Sheets" : "Slack"}</strong><p>{connection.configured ? "Configured" : "Not connected"}</p>{connection.settings?.service_account_email && <p className="break-all text-sm">Share project spreadsheets with {connection.settings.service_account_email}.</p>}</div>
      {connection.configured && <button type="button" className="app-secondary-button" disabled={busy} onClick={() => run(() => api.delete(`/workspace_integrations/${connection.provider}`))}>Disconnect {connection.provider === "google_sheets" ? "Google Sheets" : "Slack"}</button>}
    </article>)}
    <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); run(() => api.put(`/workspace_integrations/${provider}`, { integration: { credential } })); }}>
      <label className="block">Connection<select className="mt-2 block w-full rounded-lg border border-default bg-card p-3" value={provider} onChange={(event) => { setProvider(event.target.value); setCredential(""); }}><option value="google_sheets">Google Sheets</option><option value="slack">Slack</option></select></label>
      <label className="block">{provider === "google_sheets" ? "Service-account JSON" : "Slack incoming webhook URL"}
        {provider === "google_sheets" ? <textarea required autoComplete="off" spellCheck={false} rows={5} maxLength={32768} value={credential} onChange={(event) => setCredential(event.target.value)} className="mt-2 block w-full rounded-lg border border-default bg-card p-3 font-mono text-sm" /> : <input required type="password" autoComplete="new-password" spellCheck={false} maxLength={32768} value={credential} onChange={(event) => setCredential(event.target.value)} className="mt-2 block w-full rounded-lg border border-default bg-card p-3" />}
      </label>
      <button disabled={busy || !credential} className="app-primary-button">{busy ? "Saving…" : "Save connection"}</button>
    </form>
    {notice && <p role="status">{notice}</p>}{error && <p role="alert" className="text-red-600">{error}</p>}
  </section>;
}
