import http from "./http";

export async function apiLogin(payload) {
  const { data } = await http.post("/auth/login", payload);
  return data.data;
}

export async function apiRegister(payload) {
  const { data } = await http.post("/auth/register", payload);
  return data.data;
}

export async function apiGetCurrentUser() {
  const { data } = await http.get("/users/me");
  return data.data;
}

export async function apiUpdatePassword(payload) {
  const { data } = await http.put("/users/password", payload);
  return data;
}

export async function apiGetUsers() {
  const { data } = await http.get("/users");
  return data.data;
}

export async function apiGetProjects(params = {}) {
  const { data } = await http.get("/projects", { params });
  return data.data;
}

export async function apiCreateProject(payload) {
  const { data } = await http.post("/projects", payload);
  return data.data;
}

export async function apiUpdateProject(projectId, payload) {
  const { data } = await http.put(`/projects/${projectId}`, payload);
  return data.data;
}

export async function apiDeleteProject(projectId) {
  const { data } = await http.delete(`/projects/${projectId}`);
  return data;
}

export async function apiGetProject(projectId) {
  const { data } = await http.get(`/projects/${projectId}`);
  return data.data;
}

export async function apiGetVersions(projectId) {
  const { data } = await http.get(`/projects/${projectId}/versions`);
  return data.data;
}

export async function apiSaveVersion(projectId, payload) {
  const { data } = await http.post(`/projects/${projectId}/versions`, payload);
  return data.data;
}

export async function apiRestoreVersion(projectId, versionId) {
  const { data } = await http.post(`/projects/${projectId}/restore/${versionId}`);
  return data.data;
}

export async function apiGetTemplates() {
  const { data } = await http.get("/templates");
  return data.data;
}

export async function apiApplyTemplate(templateId) {
  const { data } = await http.post(`/templates/${templateId}/apply`);
  return data.data;
}

export async function apiExportProject(projectId, format) {
  const { data } = await http.post(`/projects/${projectId}/exports`, { format });
  return data.data;
}

export async function apiGetExportRecords(projectId) {
  const { data } = await http.get(`/projects/${projectId}/exports`);
  return data.data;
}

export function buildDownloadUrl(exportId) {
  return `/api/exports/${exportId}/download`;
}
