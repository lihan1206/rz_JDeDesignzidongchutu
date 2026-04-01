import http from "./http";

// 认证相关
export async function apiLogin(payload) {
  const { data } = await http.post("/auth/login", payload);
  return data.data;
}

export async function apiRegister(payload) {
  const { data } = await http.post("/auth/register", payload);
  return data.data;
}

// 用户相关
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

// 项目相关
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

// 版本相关
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

// 模板相关
export async function apiGetTemplates() {
  const { data } = await http.get("/templates");
  return data.data;
}

export async function apiApplyTemplate(templateId) {
  const { data } = await http.post(`/templates/${templateId}/apply`);
  return data.data;
}

// ==================== 导出功能 API ====================

/**
 * 获取导出历史列表
 * @param {Object} params - 查询参数
 * @param {number} params.page - 页码
 * @param {number} params.pageSize - 每页数量
 * @param {string} params.status - 状态过滤
 * @param {string} params.format - 格式过滤
 * @param {number} params.projectId - 项目ID过滤
 * @param {string} params.startDate - 开始日期
 * @param {string} params.endDate - 结束日期
 */
export async function apiGetExportHistory(params = {}) {
  const { data } = await http.get("/exports/history", { params });
  return data;
}

/**
 * 获取导出队列状态
 */
export async function apiGetExportQueue() {
  const { data } = await http.get("/exports/queue");
  return data;
}

/**
 * 创建异步导出任务
 * @param {Object} payload
 * @param {number} payload.projectId - 项目ID
 * @param {string} payload.format - 导出格式 (PDF, SVG, DXF, PNG)
 * @param {Object} payload.designData - 设计数据
 */
export async function apiQueueExport(payload) {
  const { data } = await http.post("/exports/queue", payload);
  return data;
}

/**
 * 立即导出（同步）
 * @param {Object} payload
 * @param {number} payload.projectId - 项目ID
 * @param {string} payload.format - 导出格式
 * @param {Object} payload.designData - 设计数据
 */
export async function apiExportNow(payload) {
  const { data } = await http.post("/exports/export-now", payload);
  return data;
}

/**
 * 批量导出
 * @param {Object} payload
 * @param {Array} payload.exports - 导出任务列表
 */
export async function apiBatchExport(payload) {
  const { data } = await http.post("/exports/batch", payload);
  return data;
}

/**
 * 取消导出任务
 * @param {number} exportId - 导出记录ID
 */
export async function apiCancelExport(exportId) {
  const { data } = await http.post(`/exports/cancel/${exportId}`);
  return data;
}

/**
 * 获取导出记录详情
 * @param {number} exportId - 导出记录ID
 */
export async function apiGetExportDetail(exportId) {
  const { data } = await http.get(`/exports/${exportId}`);
  return data;
}

/**
 * 删除导出记录
 * @param {number} exportId - 导出记录ID
 */
export async function apiDeleteExport(exportId) {
  const { data } = await http.delete(`/exports/${exportId}`);
  return data;
}

/**
 * 批量删除导出记录
 * @param {Object} payload
 * @param {number[]} payload.ids - 导出记录ID列表
 */
export async function apiBatchDeleteExports(payload) {
  const { data } = await http.post("/exports/batch-delete", payload);
  return data;
}

/**
 * 获取导出统计（管理员）
 */
export async function apiGetExportStats() {
  const { data } = await http.get("/exports/stats/overview");
  return data;
}

/**
 * 清理过期导出文件（管理员）
 * @param {number} maxAgeDays - 最大保留天数
 */
export async function apiCleanupExports(maxAgeDays = 30) {
  const { data } = await http.post("/exports/cleanup", { maxAgeDays });
  return data;
}

/**
 * 构建下载链接
 * @param {number} exportId - 导出记录ID
 */
export function buildDownloadUrl(exportId) {
  return `/api/exports/${exportId}/download`;
}

/**
 * 直接下载文件
 * @param {string} filePath - 文件路径
 * @param {string} fileName - 文件名
 */
export function buildDirectDownloadUrl(filePath, fileName) {
  const params = new URLSearchParams();
  if (filePath) params.append("filePath", filePath);
  if (fileName) params.append("fileName", fileName);
  return `/api/exports/download?${params.toString()}`;
}

// ==================== 批量操作 API ====================

/**
 * 批量删除项目
 * @param {number[]} projectIds - 项目ID列表
 */
export async function apiBatchDeleteProjects(projectIds) {
  const { data } = await http.post("/batch/projects/delete", { ids: projectIds });
  return data;
}

/**
 * 批量导出项目
 * @param {number[]} projectIds - 项目ID列表
 * @param {string} format - 导出格式
 */
export async function apiBatchExportProjects(projectIds, format) {
  const { data } = await http.post("/batch/projects/export", { projectIds, format });
  return data;
}

// ==================== 搜索 API ====================

/**
 * 全局搜索
 * @param {string} keyword - 搜索关键词
 * @param {string} type - 搜索类型 (all, project, template)
 */
export async function apiSearch(keyword, type = "all") {
  const { data } = await http.get("/search", { params: { keyword, type } });
  return data;
}

/**
 * 搜索项目
 * @param {string} keyword - 搜索关键词
 * @param {Object} filters - 过滤条件
 */
export async function apiSearchProjects(keyword, filters = {}) {
  const { data } = await http.get("/search/projects", { 
    params: { keyword, ...filters } 
  });
  return data;
}

/**
 * 搜索模板
 * @param {string} keyword - 搜索关键词
 */
export async function apiSearchTemplates(keyword) {
  const { data } = await http.get("/search/templates", { 
    params: { keyword } 
  });
  return data;
}

// ==================== 旧版导出 API（兼容）====================

/**
 * 导出项目（旧版，使用异步队列）
 * @param {number} projectId - 项目ID
 * @param {string} format - 导出格式
 * @param {Object} designData - 设计数据
 */
export async function apiExportProject(projectId, format, designData) {
  // 使用新的异步导出API
  return apiQueueExport({ projectId, format, designData });
}

/**
 * 获取项目导出记录（旧版，使用新的历史记录API）
 * @param {number} projectId - 项目ID
 */
export async function apiGetExportRecords(projectId) {
  const result = await apiGetExportHistory({ projectId, pageSize: 100 });
  return result.data || [];
}
