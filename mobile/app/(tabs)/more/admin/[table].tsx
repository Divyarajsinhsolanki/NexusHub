import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';

import { apiErrorMessage } from '@/src/api/client';
import { endpoints } from '@/src/api/endpoints';
import { EntityCollectionScreen, type EntityField } from '@/src/components/EntityCollectionScreen';
import { Screen } from '@/src/components/Screen';
import { ErrorState, LoadingState } from '@/src/components/StateView';

type Column = { name: string; type: string; null: boolean; default: unknown };

export default function AdminTableScreen() {
  const { table: encodedTable } = useLocalSearchParams<{ table: string }>();
  const table = decodeURIComponent(encodedTable || '');
  const meta = useQuery({ queryKey: ['admin-meta', table], queryFn: () => endpoints.rawResource<Column[]>(`/admin/meta/${encodeURIComponent(table)}`), enabled: Boolean(table) });
  if (meta.isLoading) return <Screen><LoadingState label="Loading resource definition" /></Screen>;
  if (meta.isError || !meta.data) return <Screen><ErrorState message={apiErrorMessage(meta.error)} onRetry={() => meta.refetch()} /></Screen>;

  const editable = meta.data.filter((column) => !['id', 'created_at', 'updated_at', 'encrypted_password', 'reset_password_token', 'confirmation_token'].includes(column.name)).slice(0, 12);
  const fields: EntityField[] = editable.map((column) => ({ key: column.name, label: humanize(column.name), multiline: ['text', 'json', 'jsonb'].includes(column.type) }));
  const primary = ['name', 'title', 'email', 'first_name'].find((key) => editable.some((column) => column.name === key)) || editable[0]?.name || 'id';

  return <EntityCollectionScreen canWrite fields={fields} path={`/admin/${encodeURIComponent(table)}`} primary={primary} secondary={editable.map((column) => column.name).filter((key) => key !== primary).slice(0, 2)} subtitle="Audited metadata-driven records" title={humanize(table)} wrapper="record" />;
}

function humanize(value: string) {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
}
