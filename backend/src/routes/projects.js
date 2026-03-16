import express from "express";
import { z } from "zod";
import prisma from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import HttpError from "../utils/httpError.js";
import { validateSchema } from "../utils/validate.js";
import { generateExportFile } from "../services/exportService.js";

const router = express.Router();

const layerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(50),
  visible: z.boolean(),
  locked: z.boolean(),
  order: z.number().int().min(0)
});

const designSchema = z.object({
  canvas: z.object({
    width: z.number().min(200).max(4000),
    height: z.number().min(200).max(4000),
    background: z.string().min(1)
  }),
  layers: z.array(layerSchema).min(1),
  elements: z.array(
    z
      .object({
        id: z.string(),
        type: z.enum(["rect", "circle", "line", "text", "dimension"]),
        layerId: z.string().optional()
      })
      .passthrough()
  )
});

const projectCreateSchema = z.object({
  name: z.string().min(1, "项目名称不能为空").max(100, "项目名称最多 100 字"),
  description: z.string().max(1000, "描述最多 1000 字").optional(),
  tags: z.array(z.string().max(30, "标签最多 30 字")).optional(),
  status: z.enum(["DRAFT", "COMPLETED", "ARCHIVED"]).optional()
});

const projectUpdateSchema = z.object({
  name: z.string().min(1, "项目名称不能为空").max(100, "项目名称最多 100 字").optional(),
  description: z.string().max(1000, "描述最多 1000 字").nullable().optional(),
  tags: z.array(z.string().max(30, "标签最多 30 字")).optional(),
  status: z.enum(["DRAFT", "COMPLETED", "ARCHIVED"]).optional()
});

const designSaveSchema = z.object({
  data: designSchema
});

const exportSchema = z.object({
  format: z.enum(["PDF", "SVG", "DXF", "PNG"])
});

function buildProjectWhereByRole(projectId, user) {
  if (user.role === "ADMIN") {
    return { id: projectId };
  }

  return {
    id: projectId,
    userId: user.id
  };
}

function getDefaultDesignData() {
  return {
    canvas: {
      width: 1200,
      height: 780,
      background: "#f6f9ff"
    },
    layers: [
      {
        id: "layer-main",
        name: "主图层",
        visible: true,
        locked: false,
        order: 1
      },
      {
        id: "layer-note",
        name: "标注层",
        visible: true,
        locked: false,
        order: 2
      }
    ],
    elements: []
  };
}

async function ensureProjectAccess(projectId, user) {
  const project = await prisma.project.findFirst({
    where: buildProjectWhereByRole(projectId, user)
  });

  if (!project) {
    throw new HttpError(404, "项目不存在或无权限访问");
  }

  return project;
}

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const keyword = String(req.query.keyword || "").trim();
    const status = String(req.query.status || "").trim();

    const where = {
      ...(req.user.role === "ADMIN" ? {} : { userId: req.user.id }),
      ...(status ? { status } : {}),
      ...(keyword
        ? {
            OR: [
              { name: { contains: keyword } },
              { description: { contains: keyword } }
            ]
          }
        : {})
    };

    const projects = await prisma.project.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            role: true
          }
        },
        versions: {
          orderBy: { version: "desc" },
          take: 1,
          select: {
            id: true,
            version: true,
            createdAt: true
          }
        },
        realtime: {
          select: {
            id: true,
            updatedAt: true
          }
        },
        _count: {
          select: {
            versions: true,
            exports: true
          }
        }
      },
      orderBy: { updatedAt: "desc" }
    });

    res.json({
      success: true,
      data: projects
    });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const payload = validateSchema(projectCreateSchema, req.body);

    const project = await prisma.project.create({
      data: {
        userId: req.user.id,
        name: payload.name,
        description: payload.description || "",
        tags: payload.tags || [],
        status: payload.status || "DRAFT"
      }
    });

    const defaultData = getDefaultDesignData();

    await prisma.designVersion.create({
      data: {
        projectId: project.id,
        version: 1,
        data: defaultData
      }
    });

    await prisma.realtimeState.upsert({
      where: { projectId: project.id },
      update: { data: defaultData },
      create: {
        projectId: project.id,
        data: defaultData
      }
    });

    res.status(201).json({
      success: true,
      message: "项目创建成功",
      data: project
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    if (Number.isNaN(projectId)) {
      throw new HttpError(400, "项目 ID 无效");
    }

    await ensureProjectAccess(projectId, req.user);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 1
        },
        realtime: true
      }
    });

    res.json({
      success: true,
      data: project
    });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", requireAuth, async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    if (Number.isNaN(projectId)) {
      throw new HttpError(400, "项目 ID 无效");
    }

    const payload = validateSchema(projectUpdateSchema, req.body);
    await ensureProjectAccess(projectId, req.user);

    const project = await prisma.project.update({
      where: { id: projectId },
      data: {
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(payload.description !== undefined ? { description: payload.description || "" } : {}),
        ...(payload.tags !== undefined ? { tags: payload.tags } : {}),
        ...(payload.status !== undefined ? { status: payload.status } : {})
      }
    });

    res.json({
      success: true,
      message: "项目更新成功",
      data: project
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    if (Number.isNaN(projectId)) {
      throw new HttpError(400, "项目 ID 无效");
    }

    await ensureProjectAccess(projectId, req.user);
    await prisma.project.delete({ where: { id: projectId } });

    res.json({
      success: true,
      message: "项目删除成功"
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/versions", requireAuth, async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    if (Number.isNaN(projectId)) {
      throw new HttpError(400, "项目 ID 无效");
    }

    await ensureProjectAccess(projectId, req.user);

    const versions = await prisma.designVersion.findMany({
      where: { projectId },
      orderBy: { version: "desc" }
    });

    res.json({
      success: true,
      data: versions
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/versions", requireAuth, async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    if (Number.isNaN(projectId)) {
      throw new HttpError(400, "项目 ID 无效");
    }

    const payload = validateSchema(designSaveSchema, req.body);
    await ensureProjectAccess(projectId, req.user);

    const latest = await prisma.designVersion.findFirst({
      where: { projectId },
      orderBy: { version: "desc" },
      select: { version: true }
    });

    const nextVersion = (latest?.version || 0) + 1;

    const created = await prisma.designVersion.create({
      data: {
        projectId,
        version: nextVersion,
        data: payload.data
      }
    });

    await prisma.realtimeState.upsert({
      where: { projectId },
      update: { data: payload.data },
      create: { projectId, data: payload.data }
    });

    res.status(201).json({
      success: true,
      message: `版本 V${nextVersion} 保存成功`,
      data: created
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/restore/:versionId", requireAuth, async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    const versionId = Number(req.params.versionId);

    if (Number.isNaN(projectId) || Number.isNaN(versionId)) {
      throw new HttpError(400, "参数无效");
    }

    await ensureProjectAccess(projectId, req.user);

    const targetVersion = await prisma.designVersion.findFirst({
      where: {
        id: versionId,
        projectId
      }
    });

    if (!targetVersion) {
      throw new HttpError(404, "目标版本不存在");
    }

    const latest = await prisma.designVersion.findFirst({
      where: { projectId },
      orderBy: { version: "desc" },
      select: { version: true }
    });

    const created = await prisma.designVersion.create({
      data: {
        projectId,
        version: (latest?.version || 0) + 1,
        data: targetVersion.data
      }
    });

    await prisma.realtimeState.upsert({
      where: { projectId },
      update: { data: targetVersion.data },
      create: { projectId, data: targetVersion.data }
    });

    res.json({
      success: true,
      message: "版本恢复成功，已生成新版本",
      data: created
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/exports", requireAuth, async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    if (Number.isNaN(projectId)) {
      throw new HttpError(400, "项目 ID 无效");
    }

    await ensureProjectAccess(projectId, req.user);

    const exportsList = await prisma.exportRecord.findMany({
      where: { projectId },
      orderBy: { exportedAt: "desc" }
    });

    res.json({
      success: true,
      data: exportsList
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/exports", requireAuth, async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    if (Number.isNaN(projectId)) {
      throw new HttpError(400, "项目 ID 无效");
    }

    const payload = validateSchema(exportSchema, req.body);
    await ensureProjectAccess(projectId, req.user);

    const [realtime, latest] = await Promise.all([
      prisma.realtimeState.findUnique({ where: { projectId } }),
      prisma.designVersion.findFirst({
        where: { projectId },
        orderBy: { version: "desc" }
      })
    ]);

    const designData = realtime?.data || latest?.data;
    if (!designData) {
      throw new HttpError(400, "当前项目还没有可导出的设计版本");
    }

    const file = await generateExportFile(projectId, payload.format, designData);

    const record = await prisma.exportRecord.create({
      data: {
        projectId,
        format: payload.format,
        filePath: file.relativePath
      }
    });

    res.json({
      success: true,
      message: "导出成功",
      data: {
        ...record,
        downloadUrl: `/api/exports/${record.id}/download`
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
