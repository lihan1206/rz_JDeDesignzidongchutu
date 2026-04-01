import express from "express";
import fs from "fs";
import path from "path";
import prisma from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import HttpError from "../utils/httpError.js";
import { 
  resolveFilePath, 
  generateExportFile, 
  queueExport, 
  batchExport,
  getExportHistory,
  deleteExportRecord,
  batchDeleteExportRecords,
  getExportQueueStatus,
  cancelExport,
  cleanupExpiredExports
} from "../services/exportService.js";

const router = express.Router();

// 获取导出历史列表
router.get("/history", requireAuth, async (req, res, next) => {
  try {
    const { 
      page = 1, 
      pageSize = 20, 
      status, 
      format, 
      projectId,
      startDate,
      endDate
    } = req.query;

    const options = {
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
      status,
      format,
      projectId: projectId ? parseInt(projectId, 10) : undefined
    };

    // 添加日期过滤
    if (startDate || endDate) {
      options.dateRange = {};
      if (startDate) options.dateRange.start = new Date(startDate);
      if (endDate) options.dateRange.end = new Date(endDate);
    }

    const result = await getExportHistory(req.user.id, options);
    
    res.json({
      success: true,
      data: result.records,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
});

// 获取导出队列状态
router.get("/queue", requireAuth, async (req, res, next) => {
  try {
    const queueStatus = getExportQueueStatus(req.user.id);
    
    res.json({
      success: true,
      data: queueStatus
    });
  } catch (error) {
    next(error);
  }
});

// 创建导出任务（异步）
router.post("/queue", requireAuth, async (req, res, next) => {
  try {
    const { projectId, format, designData } = req.body;

    if (!projectId || !format) {
      throw new HttpError(400, "缺少必要参数: projectId, format");
    }

    // 检查项目权限
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { userId: true }
    });

    if (!project) {
      throw new HttpError(404, "项目不存在");
    }

    if (project.userId !== req.user.id && req.user.role !== "ADMIN") {
      throw new HttpError(403, "没有权限导出该项目");
    }

    const result = await queueExport(projectId, format, designData, req.user.id);
    
    res.status(202).json({
      success: true,
      message: "导出任务已添加到队列",
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// 立即导出（同步）
router.post("/export-now", requireAuth, async (req, res, next) => {
  try {
    const { projectId, format, designData } = req.body;

    if (!projectId || !format) {
      throw new HttpError(400, "缺少必要参数: projectId, format");
    }

    // 检查项目权限
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { userId: true, name: true }
    });

    if (!project) {
      throw new HttpError(404, "项目不存在");
    }

    if (project.userId !== req.user.id && req.user.role !== "ADMIN") {
      throw new HttpError(403, "没有权限导出该项目");
    }

    const result = await generateExportFile(projectId, format, designData, req.user.id);
    
    res.json({
      success: true,
      message: "导出成功",
      data: {
        fileName: result.fileName,
        filePath: result.relativePath,
        fileSize: result.fileSize,
        downloadUrl: `/api/exports/download?filePath=${encodeURIComponent(result.relativePath)}&fileName=${encodeURIComponent(result.fileName)}`
      }
    });
  } catch (error) {
    next(error);
  }
});

// 批量导出
router.post("/batch", requireAuth, async (req, res, next) => {
  try {
    const { exports } = req.body;

    if (!Array.isArray(exports) || exports.length === 0) {
      throw new HttpError(400, "缺少导出列表");
    }

    if (exports.length > 10) {
      throw new HttpError(400, "单次批量导出最多支持10个项目");
    }

    // 验证所有项目的权限
    const projectIds = [...new Set(exports.map(e => e.projectId))];
    const projects = await prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, userId: true }
    });

    const projectMap = new Map(projects.map(p => [p.id, p]));

    for (const item of exports) {
      const project = projectMap.get(item.projectId);
      if (!project) {
        throw new HttpError(404, `项目不存在: ${item.projectId}`);
      }
      if (project.userId !== req.user.id && req.user.role !== "ADMIN") {
        throw new HttpError(403, `没有权限导出项目: ${item.projectId}`);
      }
    }

    const result = await batchExport(exports, req.user.id);
    
    res.status(202).json({
      success: true,
      message: `批量导出任务已创建，成功: ${result.success}, 失败: ${result.failed}`,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// 取消导出任务
router.post("/cancel/:id", requireAuth, async (req, res, next) => {
  try {
    const exportId = Number(req.params.id);
    if (Number.isNaN(exportId)) {
      throw new HttpError(400, "导出记录 ID 无效");
    }

    const result = await cancelExport(exportId, req.user.id);
    
    res.json({
      success: result.success,
      message: result.message
    });
  } catch (error) {
    next(error);
  }
});

// 下载导出文件（通过 exportId）
router.get("/:id/download", requireAuth, async (req, res, next) => {
  try {
    const exportId = Number(req.params.id);
    if (Number.isNaN(exportId)) {
      throw new HttpError(400, "导出记录 ID 无效");
    }

    const record = await prisma.exportRecord.findUnique({
      where: { id: exportId },
      include: {
        project: {
          select: {
            id: true,
            userId: true
          }
        }
      }
    });

    if (!record) {
      throw new HttpError(404, "导出记录不存在");
    }

    if (req.user.role !== "ADMIN" && record.project.userId !== req.user.id) {
      throw new HttpError(403, "没有权限下载该文件");
    }

    if (record.status !== "COMPLETED") {
      throw new HttpError(400, "导出任务尚未完成");
    }

    const absolutePath = resolveFilePath(record.filePath);
    if (!fs.existsSync(absolutePath)) {
      throw new HttpError(404, "导出文件不存在");
    }

    const fileName = path.basename(absolutePath);
    res.download(absolutePath, fileName);
  } catch (error) {
    next(error);
  }
});

// 直接下载文件（通过文件路径）
router.get("/download", requireAuth, async (req, res, next) => {
  try {
    const { filePath, fileName } = req.query;

    if (!filePath) {
      throw new HttpError(400, "缺少文件路径");
    }

    // 安全检查：防止目录遍历
    const normalizedPath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, "");
    const absolutePath = resolveFilePath(normalizedPath);
    
    if (!fs.existsSync(absolutePath)) {
      throw new HttpError(404, "文件不存在");
    }

    const stats = await fs.promises.stat(absolutePath);
    if (!stats.isFile()) {
      throw new HttpError(400, "无效的文件路径");
    }

    const downloadName = fileName || path.basename(absolutePath);
    res.download(absolutePath, downloadName);
  } catch (error) {
    next(error);
  }
});

// 获取导出记录详情
router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const exportId = Number(req.params.id);
    if (Number.isNaN(exportId)) {
      throw new HttpError(400, "导出记录 ID 无效");
    }

    const record = await prisma.exportRecord.findUnique({
      where: { id: exportId },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            userId: true
          }
        }
      }
    });

    if (!record) {
      throw new HttpError(404, "导出记录不存在");
    }

    if (req.user.role !== "ADMIN" && record.project.userId !== req.user.id) {
      throw new HttpError(403, "没有权限查看该导出记录");
    }

    res.json({
      success: true,
      data: record
    });
  } catch (error) {
    next(error);
  }
});

// 删除导出记录
router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const exportId = Number(req.params.id);
    if (Number.isNaN(exportId)) {
      throw new HttpError(400, "导出记录 ID 无效");
    }

    await deleteExportRecord(exportId, req.user.id);
    
    res.json({
      success: true,
      message: "导出记录已删除"
    });
  } catch (error) {
    next(error);
  }
});

// 批量删除导出记录
router.post("/batch-delete", requireAuth, async (req, res, next) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      throw new HttpError(400, "缺少导出记录 ID 列表");
    }

    const result = await batchDeleteExportRecords(ids, req.user.id);
    
    res.json({
      success: true,
      message: `删除完成，成功: ${result.success}, 失败: ${result.failed}`,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// 清理过期导出文件（管理员）
router.post("/cleanup", requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== "ADMIN") {
      throw new HttpError(403, "只有管理员可以执行清理操作");
    }

    const { maxAgeDays = 30 } = req.body;
    
    const result = await cleanupExpiredExports(maxAgeDays);
    
    res.json({
      success: true,
      message: `清理完成，已删除 ${result.deletedCount} 个过期导出文件`,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// 获取导出统计（管理员）
router.get("/stats/overview", requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== "ADMIN") {
      throw new HttpError(403, "只有管理员可以查看统计信息");
    }

    const [
      totalCount,
      completedCount,
      failedCount,
      pendingCount,
      processingCount,
      formatStats
    ] = await Promise.all([
      prisma.exportRecord.count(),
      prisma.exportRecord.count({ where: { status: "COMPLETED" } }),
      prisma.exportRecord.count({ where: { status: "FAILED" } }),
      prisma.exportRecord.count({ where: { status: "PENDING" } }),
      prisma.exportRecord.count({ where: { status: "PROCESSING" } }),
      prisma.exportRecord.groupBy({
        by: ["format"],
        _count: { format: true }
      })
    ]);

    // 计算今日导出数量
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = await prisma.exportRecord.count({
      where: { createdAt: { gte: today } }
    });

    res.json({
      success: true,
      data: {
        total: totalCount,
        completed: completedCount,
        failed: failedCount,
        pending: pendingCount,
        processing: processingCount,
        today: todayCount,
        successRate: totalCount > 0 ? ((completedCount / totalCount) * 100).toFixed(2) + "%" : "0%",
        formatDistribution: formatStats.map(s => ({
          format: s.format,
          count: s._count.format
        }))
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
