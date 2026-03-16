import express from "express";
import { requireAuth } from "../middleware/auth.js";
import prisma from "../prisma.js";
import HttpError from "../utils/httpError.js";

const router = express.Router();

router.get("/", requireAuth, async (_req, res, next) => {
  try {
    const templates = await prisma.template.findMany({
      orderBy: { createdAt: "desc" }
    });

    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/apply", requireAuth, async (req, res, next) => {
  try {
    const templateId = Number(req.params.id);

    if (Number.isNaN(templateId)) {
      throw new HttpError(400, "模板 ID 无效");
    }

    const template = await prisma.template.findUnique({ where: { id: templateId } });
    if (!template) {
      throw new HttpError(404, "模板不存在");
    }

    const project = await prisma.project.create({
      data: {
        userId: req.user.id,
        name: `${template.name} - ${new Date().toLocaleString("zh-CN")}`,
        description: `由模板「${template.name}」创建`,
        status: "DRAFT",
        tags: ["模板", template.category]
      }
    });

    await prisma.designVersion.create({
      data: {
        projectId: project.id,
        version: 1,
        data: template.baseData
      }
    });

    await prisma.realtimeState.upsert({
      where: { projectId: project.id },
      update: { data: template.baseData },
      create: { projectId: project.id, data: template.baseData }
    });

    res.json({
      success: true,
      message: "模板应用成功",
      data: project
    });
  } catch (error) {
    next(error);
  }
});

export default router;
