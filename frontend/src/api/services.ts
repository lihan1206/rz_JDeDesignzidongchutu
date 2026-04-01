import http from "./http";
import type {
  User,
  Project,
  DesignVersion,
  Template,
  ExportRecord,
  DesignData
} from "../types";

interface LoginPayload {
  email: string;
  password: string;
}

interface RegisterPayload {
  username: string;
  email: string;
  password: string;
}

interface UpdatePasswordPayload {
  oldPassword: string;
  newPassword: string;
}

interface CreateProjectPayload {
  name: string;
  description?: string;
  tags?: string[];
  status?: "DRAFT" | "COMPLETED" | "ARCHIVED";
}

interface UpdateProjectPayload {
  name?: string;
  description?: string | null;
  tags?: string[];
  status?: "DRAFT" | "COMPLETED" | "ARCHIVED";
}

interface SaveVersionPayload {
  data: DesignData;
}

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

export async function apiLogin(payload: LoginPayload): Promise<{
  user: User;
  token: string;
}> {
  const { data } = await http.post<ApiResponse<{ user: User; token: string }>>(
    "/auth/login",
    payload
  );
  return data.data;
}

export async function apiRegister(
  payload: RegisterPayload
): Promise<{ user: User; token: string }> {
  const { data } = await http.post<ApiResponse<{ user: User; token: string }>>(
    "/auth/register",
    payload
  );
  return data.data;
}

export async function apiGetCurrentUser(): Promise<User> {
  const { data } = await http.get<ApiResponse<User>>("/users/me");
  return data.data;
}

export async function apiUpdatePassword(
  payload: UpdatePasswordPayload
): Promise<void> {
  const { data } = await http.put<ApiResponse<void>>("/users/password", payload);
  return data.data;
}

export async function apiGetUsers(): Promise<User[]> {
  const { data } = await http.get<ApiResponse<User[]>>("/users");
  return data.data;
}

export async function apiGetProjects(params?: {
  keyword?: string;
  status?: string;
}): Promise<Project[]> {
  const { data } = await http.get<ApiResponse<Project[]>>("/projects", { params });
  return data.data;
}

export async function apiCreateProject(
  payload: CreateProjectPayload
): Promise<Project> {
  const { data } = await http.post<ApiResponse<Project>>("/projects", payload);
  return data.data;
}

export async function apiUpdateProject(
  projectId: number,
  payload: UpdateProjectPayload
): Promise<Project> {
  const { data } = await http.put<ApiResponse<Project>>(
    `/projects/${projectId}`,
    payload
  );
  return data.data;
}

export async function apiDeleteProject(projectId: number): Promise<void> {
  const { data } = await http.delete<ApiResponse<void>>(`/projects/${projectId}`);
  return data.data;
}

export async function apiGetProject(projectId: number): Promise<Project> {
  const { data } = await http.get<ApiResponse<Project>>(`/projects/${projectId}`);
  return data.data;
}

export async function apiGetVersions(projectId: number): Promise<DesignVersion[]> {
  const { data } = await http.get<ApiResponse<DesignVersion[]>>(
    `/projects/${projectId}/versions`
  );
  return data.data;
}

export async function apiSaveVersion(
  projectId: number,
  payload: SaveVersionPayload
): Promise<DesignVersion> {
  const { data } = await http.post<ApiResponse<DesignVersion>>(
    `/projects/${projectId}/versions`,
    payload
  );
  return data.data;
}

export async function apiRestoreVersion(
  projectId: number,
  versionId: number
): Promise<DesignVersion> {
  const { data } = await http.post<ApiResponse<DesignVersion>>(
    `/projects/${projectId}/restore/${versionId}`
  );
  return data.data;
}

export async function apiGetTemplates(): Promise<Template[]> {
  const { data } = await http.get<ApiResponse<Template[]>>("/templates");
  return data.data;
}

export async function apiApplyTemplate(templateId: number): Promise<Project> {
  const { data } = await http.post<ApiResponse<Project>>(
    `/templates/${templateId}/apply`
  );
  return data.data;
}

export async function apiExportProject(
  projectId: number,
  format: "PDF" | "SVG" | "DXF" | "PNG"
): Promise<ExportRecord> {
  const { data } = await http.post<ApiResponse<ExportRecord>>(
    `/projects/${projectId}/exports`,
    { format }
  );
  return data.data;
}

export async function apiGetExportRecords(projectId: number): Promise<ExportRecord[]> {
  const { data } = await http.get<ApiResponse<ExportRecord[]>>(
    `/projects/${projectId}/exports`
  );
  return data.data;
}

export function buildDownloadUrl(exportId: number): string {
  return `/api/exports/${exportId}/download`;
}
