export const SECTIONS = [
  ['configuration', 'Configuration'], ['software', 'Software & versions'],
  ['services', 'Services'], ['licenses', 'Licenses'], ['deployments', 'Deployments'],
];
export const entryFor = (item, environmentId) => (item.entries || []).find(entry => String(entry.environment_id) === String(environmentId));
export const formatDate = (value, timeZone) => {
  if (!value || !Number.isFinite(new Date(value).getTime())) return 'Not recorded';
  try { return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', ...(timeZone ? { timeZone } : {}) }); } catch { return 'Invalid time zone'; }
};
export const versionStatus = entry => {
  if (!entry?.observed_version) return 'Unknown';
  if (!entry?.expected_version) return 'No target';
  if (entry.expected_version !== entry.observed_version) return 'Mismatch';
  return entry.verified_at ? 'Verified' : 'Matches · not verified';
};
export const entryStatus = (item, entry) => {
  if (item.kind === 'software') return versionStatus(entry);
  if (item.kind === 'service') return entry?.details?.endpoints?.length || entry?.details?.endpoint ? 'Recorded' : 'Not recorded';
  if (entry?.configured) return 'Configured';
  return entry?.required ? 'Missing required' : 'Not configured';
};
export const comparisonLabel = (item, environments) => {
  if (environments.length < 2) return 'Select two environments';
  const entries = environments.map(environment => entryFor(item, environment.id));
  if (item.kind === 'configuration' && entries.some(entry => !entry?.configured)) return 'Incomplete';
  if (item.kind === 'software' && entries.some(entry => !entry?.observed_version)) return 'Unknown';
  if (item.kind === 'service' && entries.some(entry => !entry?.details?.endpoints?.length && !entry?.details?.endpoint)) return 'Incomplete';
  if (item.secret || item.kind === 'service') {
    const pair = (item.comparisons || []).find(comparison => [comparison.left_environment_id, comparison.right_environment_id].map(String).sort().join(',') === environments.slice(0, 2).map(environment => String(environment.id)).sort().join(','));
    return pair && pair.equal !== null ? (pair.equal ? 'Same' : 'Different') : 'Values hidden';
  }
  const values = entries.map(entry => item.kind === 'software' ? entry?.observed_version : item.kind === 'service' ? entry?.details?.endpoint : entry?.value);
  return new Set(values).size === 1 ? 'Same' : 'Different';
};
export const dateStatus = (date, today = new Date()) => {
  if (!date) return 'No expiry';
  const days = Math.ceil((new Date(`${date}T00:00:00`) - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
  return days < 0 ? 'Expired' : days <= 30 ? 'Expiring soon' : 'Active';
};
export const errorMessage = error => {
  if (error?.response?.status === 409) return 'Someone updated this project. Close this panel, refresh the workspace, and reopen the record to review the latest data before retrying.';
  const errors = error?.response?.data?.errors;
  return Array.isArray(errors) ? errors.join('. ') : (typeof error?.response?.data?.error === 'string' ? error.response.data.error : 'Unable to save. Your changes are still here; please try again.');
};
export const csvNumbers = text => text.split(',').map(value => value.trim()).filter(Boolean).map(Number);
