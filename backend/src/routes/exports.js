import express from "express";
import fs from "fs";
import path from "path";
import prisma from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import HttpError from "../utils/httpError.js";
import { resolveFilePath } from "../services/exportService.js";

const router = express.Router();

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

export default router;
