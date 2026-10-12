export type OperationKind = 'configuration' | 'software' | 'service' | 'license';
export type OperationRecord = Record<string, any> & { id: number; name?: string };
export type OperationsSnapshot = {
  revision: number; can_edit: boolean; encryption_available: boolean;
  environments: OperationRecord[]; members: OperationRecord[]; items: OperationItem[];
  history: OperationRecord[]; deployments: OperationRecord[]; series: OperationRecord[];
  summary: Record<string, number>;
};
export type OperationItem = OperationRecord & { kind: OperationKind; secret: boolean; comparison: string; details: Record<string, any>; entries: OperationRecord[]; status: string };
export const sections = [{ key: 'configuration', label: 'Configuration' }, { key: 'software', label: 'Software versions' }, { key: 'service', label: 'Services' }, { key: 'license', label: 'Licenses' }, { key: 'deployments', label: 'Deployments' }, { key: 'environments', label: 'Environments' }, { key: 'history', label: 'History' }];
export function numbers(text: string) {
  if (!text.trim()) return [];
  const values = text.split(',').map(value => Number(value.trim()));
  if (values.some(value => !Number.isInteger(value) || value < 1)) throw new Error('Use positive whole numbers separated by commas.');
  return values;
}
export function entryFor(item: OperationItem, environmentId?: number) { return item.entries.find(entry => entry.environment_id === environmentId); }
export function itemPayload(form: Record<string, any>, kind: OperationKind, secretValue: string, clearKey: boolean) {
  const result: Record<string, any> = { kind, name: form.name.trim(), description: form.description, category: form.category, comparison: form.comparison, secret: form.secret, details: form.details };
  if (kind === 'license') { if (secretValue) result.license_key = secretValue; if (clearKey) result.clear_license_key = true; }
  return result;
}
export function entryPayload(kind: OperationKind, secret: boolean, form: Record<string, any>) {
  const result: Record<string, any> = { required: !!form.required, details: form.details || {} };
  if (kind === 'configuration') { if (!secret || form.value) result.value = form.value; if (form.clear_value) result.clear_value = true; }
  if (kind === 'software') Object.assign(result, { expected_version: form.expected_version || '', observed_version: form.observed_version || '', source: form.source || 'manual' });
  return result;
}
export function operationError(error: any) {
  if (error?.response?.status === 409) return 'This project changed. Close this editor, refresh, and reopen the record before saving. Your draft has been kept.';
  return error?.message && !error?.response ? error.message : error?.response?.data?.errors?.join('. ') || error?.response?.data?.error?.message || (typeof error?.response?.data?.error === 'string' ? error.response.data.error : 'Unable to save. Your draft has been kept.');
}
export function comparison(item: OperationItem, environmentIds: number[]) {
  if (environmentIds.length !== 2) return '';
  const pair = (item.comparisons || []).find((row: any) => [row.left_environment_id, row.right_environment_id].sort().join(',') === [...environmentIds].sort().join(','));
  return !pair || pair.equal == null ? 'Incomplete' : pair.equal ? 'Same' : 'Different';
}
export function deploymentTransitions(status: string) { return status === 'planned' ? ['in_progress', 'cancelled'] : status === 'in_progress' ? ['deployed', 'failed', 'cancelled'] : []; }
export function canVerify(record: OperationRecord) { return record.status === 'deployed' && !record.verified_at && (record.verification || []).length > 0 && record.verification.every((row: any) => row.status === 'match'); }
