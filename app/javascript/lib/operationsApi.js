import api from '../components/api';

const base = projectId => `/projects/${projectId}/operations`;
export const operationsApi = {
  snapshot: projectId => api.get(base(projectId)),
  history: (projectId, beforeId) => api.get(`${base(projectId)}/history`, { params: { before_id: beforeId } }),
  saveEnvironment: (projectId, id, payload) => id ? api.patch(`/projects/${projectId}/environments/${id}.json`, payload) : api.post(`/projects/${projectId}/environments.json`, payload),
  deleteEnvironment: (projectId, id, payload) => api.delete(`/projects/${projectId}/environments/${id}.json`, { data: payload }),
  createItem: (projectId, payload) => api.post(`${base(projectId)}/items`, payload),
  updateItem: (projectId, id, payload) => api.patch(`${base(projectId)}/items/${id}`, payload),
  deleteItem: (projectId, id, payload) => api.delete(`${base(projectId)}/items/${id}`, { data: payload }),
  saveEntry: (projectId, id, environmentId, payload) => api.put(`${base(projectId)}/items/${id}/entries/${environmentId}`, payload),
  previewImport: (projectId, payload) => api.post(`${base(projectId)}/imports/preview`, payload),
  commitImport: (projectId, payload) => api.post(`${base(projectId)}/imports/commit`, payload),
  deployments: projectId => api.get(`${base(projectId)}/deployments`),
  saveDeployment: (projectId, id, payload) => id ? api.patch(`${base(projectId)}/deployments/${id}`, payload) : api.post(`${base(projectId)}/deployments`, payload),
  transition: (projectId, id, payload) => api.post(`${base(projectId)}/deployments/${id}/transition`, payload),
  observations: (projectId, id, payload) => api.post(`${base(projectId)}/deployments/${id}/observations`, payload),
  verify: (projectId, id, payload) => api.post(`${base(projectId)}/deployments/${id}/verify`, payload),
  saveSeries: (projectId, id, payload) => id ? api.patch(`${base(projectId)}/deployment_series/${id}`, payload) : api.post(`${base(projectId)}/deployment_series`, payload),
  deleteSeries: (projectId, id, payload) => api.delete(`${base(projectId)}/deployment_series/${id}`, { data: payload }),
};
