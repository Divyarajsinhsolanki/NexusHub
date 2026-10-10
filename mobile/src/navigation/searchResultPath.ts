import type { EntityRecord } from '../api/types';
import { normalizeMobileDeepLink } from './deepLinks';

export function searchResultPath(item: EntityRecord) {
  const projectId = String(item.path || '').match(/projects\/(\d+)/)?.[1];
  switch (item.type) {
    case 'project': return `/projects/${item.id}`;
    case 'task': return projectId ? `/projects/${projectId}?taskId=${item.id}` : `/work?taskId=${item.id}`;
    case 'post': return `/inbox/post/${item.id}`;
    case 'user': return `/profile/${item.id}`;
    case 'issue': return projectId ? `/projects/${projectId}/issues?issueId=${item.id}` : '/projects';
    case 'pdf_document': return `/more/pdf/${item.id}`;
    default: return normalizeMobileDeepLink(item.path) || '/(tabs)/today';
  }
}
