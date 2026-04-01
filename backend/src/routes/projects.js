import express from "express";
import { z } from "zod";
import prisma from "../prisma.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { rateLimit, exportRateLimit } from "../middleware/rateLimit.js";
import HttpError from "../utils/httpError.js";
import { validateSchema } from "../utils/validate.js";
import { generateExportFile, getExportStats } from "../services/exportService.js";
import { logAudit, getAuditLogs, getUserActivityStats, getProjectActivityStats } from "../services/auditService.js";

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
  data: designSchema,
  note: z.string().max(200).optional()
});

const exportSchema = z.object({
  format: z.enum(["PDF", "SVG", "DXF", "PNG"])
});

const batchDeleteSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(50)
});

const batchUpdateStatusSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(50),
  status: z.enum(["DRAFT", "COMPLETED", "ARCHIVED"])
});

const searchSchema = z.object({
  keyword: z.string().max(100).optional(),
  status: z.enum(["DRAFT", "COMPLETED", "ARCHIVED"]).optional(),
  tags: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "name"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional()
});

function buildProjectWhereByRole(projectId, user) {
  if (user.role === "ADMIN") {
    return { id: projectId };
  }

  return {
    id: projectId,
    OR: [
      { userId: user.id },
      { members: { some: { userId: user.id } } }
    ]
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

async function ensureProjectAccess(projectId, user, minRole = "VIEWER") {
  const project = await prisma.project.findFirst({
    where: buildProjectWhereRole(projectId, user),
    include: {
      members: {
        where: { userId: user.id },
        select: { role: true }
      }
    }
  });

  if (!project) {
    throw new HttpError(404, "项目不存在或无权限访问");
  }

  if (minRole === "OWNER" && project.userId !== user.id && user.role !== "ADMIN") {
    throw new HttpError(403, "需要项目所有者权限");
  }

  if (minRole === "EDITOR") {
    const isOwner = project.userId === user.id;
    const isEditor = project.members.some((m) => m.role === "EDITOR" || m.role === "OWNER");
    if (!isOwner && !isEditor && user.role !== "ADMIN") {
      throw new HttpError(403, "需要编辑权限");
    }
  }

  return project;
}

function buildProjectWhereRole(projectId, user) {
  if (user.role === "ADMIN") {
    return { id: projectId };
  }

  return {
    id: projectId,
    OR: [
      { userId: user.id },
      { members: { some: { userId: user.id } } }
    ]
  };
}

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const {
      keyword,
      status,
      tags,
      startDate,
      endDate,
      sortBy = "updatedAt",
      sortOrder = "desc",
      page = 1,
      pageSize = 20
    } = validateSchema(searchSchema, req.query);

    const where = {
      ...(req.user.role === "ADMIN"
        ? {}
        : {
            OR: [
              { userId: req.user.id },
              { members: { some: { userId: req.user.id } } }
            ]
          }),
      ...(status ? { status } : {}),
      ...(keyword
        ? {
            OR: [
              { name: { contains: keyword } },
              { description: { contains: keyword } }
            ]
          }
        : {}),
      ...(tags
        ? {
            tags: { hasSome: tags.split(",").map((t) => t.trim()).filter(Boolean) }
          }
        : {}),
      ...(startDate || endDate
        ? {
            createdAt: {
              ...(startDate ? { gte: new Date(startDate) } : {}),
              ...(endDate ? { lte: new Date(endDate) } : {})
            }
          }
        : {})
    };

    const [total, projects] = await Promise.all([
      prisma.project.count({ where }),
      prisma.project.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              role: true
            }
          },
          members: {
            select: {
              userId: true,
              role: true,
              user: {
                select: { id: true, username: true }
              }
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
              exports: true,
              members: true
            }
          }
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ]);

    res.json({
      success: true,
      data: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        items: projects
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get("/stats", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.role === "ADMIN" ? undefined : req.user.id;

    const [projectStats, versionStats, exportStats, activityStats] = await Promise.all([
      prisma.project.groupBy({
        by: ["status"],
        where: userId ? { userId } : undefined,
        _count: { id: true }
      }),
      prisma.designVersion.count({
        where: userId ? { project: { userId } } : undefined
      }),
      prisma.exportRecord.groupBy({
        by: ["format"],
        where: userId ? { project: { userId } } : undefined,
        _count: { id: true }
      }),
      getUserActivityStats(req.user.id, 30)
    ]);

    const totalProjects = projectStats.reduce((sum, s) => sum + s._count.id, 0);

    res.json({
      success: true,
      data: {
        projects: {
          total: totalProjects,
          byStatus: projectStats.reduce((acc, s) => {
            acc[s.status] = s._count.id;
            return acc;
          }, {})
        },
        versions: {
          total: versionStats
        },
        exports: {
          byFormat: exportStats.reduce((acc, e) => {
            acc[e.format] = e._count.id;
            return acc;
          }, {}),
          stats: getExportStats()
        },
        activity: activityStats
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireAuth, rateLimit({ max: 20 }), async (req, res, next) => {
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

    await prisma.projectMember.create({
      data: {
        projectId: project.id,
        userId: req.user.id,
        role: "OWNER"
      }
    });

    await logAudit({
      userId: req.user.id,
      projectId: project.id,
      action: "CREATE",
      entity: "Project",
      entityId: project.id,
      newValue: { name: project.name, status: project.status },
      ip: req.ip,
      userAgent: req.headers["user-agent"]
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

router.post("/batch/delete", requireAuth, async (req, res, next) => {
  try {
    const { ids } = validateSchema(batchDeleteSchema, req.body);

    const where = {
      id: { in: ids },
      ...(req.user.role === "ADMIN" ? {} : { userId: req.user.id })
    };

    const projects = await prisma.project.findMany({
      where,
      select: { id: true, name: true }
    });

    if (projects.length === 0) {
      throw new HttpError(404, "未找到可删除的项目");
    }

    const deleteIds = projects.map((p) => p.id);

    await prisma.project.deleteMany({
      where: { id: { in: deleteIds } }
    });

    for (const project of projects) {
      await logAudit({
        userId: req.user.id,
        projectId: project.id,
        action: "DELETE",
        entity: "Project",
        entityId: project.id,
        oldValue: { name: project.name },
        ip: req.ip,
        userAgent: req.headers["user-agent"]
      });
    }

    res.json({
      success: true,
      message: `成功删除 ${deleteIds.length} 个项目`,
      data: { deletedCount: deleteIds.length, deletedIds: deleteIds }
    });
  } catch (error) {
    next(error);
  }
});

router.post("/batch/status", requireAuth, async (req, res, next) => {
  try {
    const { ids, status } = validateSchema(batchUpdateStatusSchema, req.body);

    const where = {
      id: { in: ids },
      ...(req.user.role === "ADMIN" ? {} : { userId: req.user.id })
    };

    const projects = await prisma.project.findMany({
      where,
      select: { id: true, name: true, status: true }
    });

    if (projects.length === 0) {
      throw new HttpError(404, "未找到可更新的项目");
    }

    const updateIds = projects.map((p) => p.id);

    await prisma.project.updateMany({
      where: { id: { in: updateIds } },
      data: { status }
    });

    for (const project of projects) {
      await logAudit({
        userId: req.user.id,
        projectId: project.id,
        action: "UPDATE",
        entity: "Project",
        entityId: project.id,
        oldValue: { status: project.status },
        newValue: { status },
        ip: req.ip,
        userAgent: req.headers["user-agent"]
      });
    }

    res.json({
      success: true,
      message: `成功更新 ${updateIds.length} 个项目状态`,
      data: { updatedCount: updateIds.length, updatedIds: updateIds, newStatus: status }
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

    const project = await prisma.project.findFirst({
      where: buildProjectWhereRole(projectId, req.user),
      include: {
        user: {
          select: { id: true, username: true, email: true, role: true }
        },
        members: {
          include: {
            user: {
              select: { id: true, username: true, email: true }
            }
          }
        },
        versions: {
          orderBy: { version: "desc" },
          take: 1
        },
        realtime: true
      }
    });

    if (!project) {
      throw new HttpError(404, "项目不存在或无权限访问");
    }

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
    const project = await ensureProjectAccess(projectId, req.user, "EDITOR");

    const oldData = { name: project.name, status: project.status, description: project.description };

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: {
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(payload.description !== undefined ? { description: payload.description || "" } : {}),
        ...(payload.tags !== undefined ? { tags: payload.tags } : {}),
        ...(payload.status !== undefined ? { status: payload.status } : {})
      }
    });

    await logAudit({
      userId: req.user.id,
      projectId,
      action: "UPDATE",
      entity: "Project",
      entityId: projectId,
      oldValue: oldData,
      newValue: payload,
      ip: req.ip,
      userAgent: req.headers["user-agent"]
    });

    res.json({
      success: true,
      message: "项目更新成功",
      data: updated
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

    const project = await ensureProjectAccess(projectId, req.user, "OWNER");

    await prisma.project.delete({ where: { id: projectId } });

    await logAudit({
      userId: req.user.id,
      projectId,
      action: "DELETE",
      entity: "Project",
      entityId: projectId,
      oldValue: { name: project.name },
      ip: req.ip,
      userAgent: req.headers["user-agent"]
    });

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

router.post("/:id/versions", requireAuth, rateLimit({ max: 30 }), async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    if (Number.isNaN(projectId)) {
      throw new HttpError(400, "项目 ID 无效");
    }

    const payload = validateSchema(designSaveSchema, req.body);
    await ensureProjectAccess(projectId, req.user, "EDITOR");

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
        data: payload.data,
        note: payload.note
      }
    });

    await prisma.realtimeState.upsert({
      where: { projectId },
      update: { data: payload.data },
      create: { projectId, data: payload.data }
    });

    await logAudit({
      userId: req.user.id,
      projectId,
      action: "UPDATE",
      entity: "DesignVersion",
      entityId: created.id,
      newValue: { version: nextVersion, note: payload.note },
      ip: req.ip,
      userAgent: req.headers["user-agent"]
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

    await ensureProjectAccess(projectId, req.user, "EDITOR");

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
        data: targetVersion.data,
        note: `恢复自版本 V${targetVersion.version}`
      }
    });

    await prisma.realtimeState.upsert({
      where: { projectId },
      update: { data: targetVersion.data },
      create: { projectId, data: targetVersion.data }
    });

    await logAudit({
      userId: req.user.id,
      projectId,
      action: "RESTORE",
      entity: "DesignVersion",
      entityId: created.id,
      oldValue: { fromVersion: targetVersion.version },
      newValue: { toVersion: created.version },
      ip: req.ip,
      userAgent: req.headers["user-agent"]
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

router.post("/:id/exports", requireAuth, exportRateLimit(), async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    if (Number.isNaN(projectId)) {
      throw new HttpError(400, "项目 ID 无效");
    }

    const payload = validateSchema(exportSchema, req.body);
    await ensureProjectAccess(projectId, req.user, "EDITOR");

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
        filePath: file.relativePath,
        fileSize: file.size,
        duration: file.duration
      }
    });

    await logAudit({
      userId: req.user.id,
      projectId,
      action: "EXPORT",
      entity: "ExportRecord",
      entityId: record.id,
      newValue: { format: payload.format, fileSize: file.size },
      ip: req.ip,
      userAgent: req.headers["user-agent"]
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

router.get("/:id/activity", requireAuth, async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    if (Number.isNaN(projectId)) {
      throw new HttpError(400, "项目 ID 无效");
    }

    await ensureProjectAccess(projectId, req.user);

    const stats = await getProjectActivityStats(projectId, 30);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/members", requireAuth, async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    if (Number.isNaN(projectId)) {
      throw new HttpError(400, "项目 ID 无效");
    }

    await ensureProjectAccess(projectId, req.user);

    const members = await prisma.projectMember.findMany({
      where: { projectId },
      include: {
        user: {
          select: { id: true, username: true, email: true, role: true }
        }
      },
      orderBy: { joinedAt: "asc" }
    });

    res.json({
      success: true,
      data: members
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/members", requireAuth, async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    if (Number.isNaN(projectId)) {
      throw new HttpError(400, "项目 ID 无效");
    }

    const { userId, role } = req.body;

    if (!userId || !["EDITOR", "VIEWER"].includes(role)) {
      throw new HttpError(400, "参数无效");
    }

    await ensureProjectAccess(projectId, req.user, "OWNER");

    const existing = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } }
    });

    if (existing) {
      throw new HttpError(400, "该用户已是项目成员");
    }

    const member = await prisma.projectMember.create({
      data: {
        projectId,
        userId,
        role,
        invitedBy: req.user.id
      },
      include: {
        user: {
          select: { id: true, username: true, email: true }
        }
      }
    });

    await logAudit({
      userId: req.user.id,
      projectId,
      action: "SHARE",
      entity: "ProjectMember",
      entityId: member.id,
      newValue: { userId, role },
      ip: req.ip,
      userAgent: req.headers["user-agent"]
    });

    res.status(201).json({
      success: true,
      message: "成员添加成功",
      data: member
    });
  } catch (error) {
    next(error);
  }
});

router.put("/:id/members/:userId", requireAuth, async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    const memberUserId = Number(req.params.userId);

    if (Number.isNaN(projectId) || Number.isNaN(memberUserId)) {
      throw new HttpError(400, "参数无效");
    }

    const { role } = req.body;

    if (!["EDITOR", "VIEWER"].includes(role)) {
      throw new HttpError(400, "角色无效");
    }

    await ensureProjectAccess(projectId, req.user, "OWNER");

    const member = await prisma.projectMember.update({
      where: { projectId_userId: { projectId, userId: memberUserId } },
      data: { role },
      include: {
        user: {
          select: { id: true, username: true, email: true }
        }
      }
    });

    await logAudit({
      userId: req.user.id,
      projectId,
      action: "UPDATE",
      entity: "ProjectMember",
      entityId: member.id,
      newValue: { role },
      ip: req.ip,
      userAgent: req.headers["user-agent"]
    });

    res.json({
      success: true,
      message: "成员权限更新成功",
      data: member
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id/members/:userId", requireAuth, async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    const memberUserId = Number(req.params.userId);

    if (Number.isNaN(projectId) || Number.isNaN(memberUserId)) {
      throw new HttpError(400, "参数无效");
    }

    await ensureProjectAccess(projectId, req.user, "OWNER");

    await prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId: memberUserId } }
    });

    await logAudit({
      userId: req.user.id,
      projectId,
      action: "DELETE",
      entity: "ProjectMember",
      newValue: { removedUserId: memberUserId },
      ip: req.ip,
      userAgent: req.headers["user-agent"]
    });

    res.json({
      success: true,
      message: "成员移除成功"
    });
  } catch (error) {
    next(error);
  }
});

router.get("/audit/logs", requireAuth, requireRoles("ADMIN"), async (req, res, next) => {
  try {
    const {
      userId,
      projectId,
      action,
      entity,
      startDate,
      endDate,
      page = 1,
      pageSize = 20
    } = req.query;

    const result = await getAuditLogs({
      userId: userId ? Number(userId) : undefined,
      projectId: projectId ? Number(projectId) : undefined,
      action,
      entity,
      startDate,
      endDate,
      page: Number(page),
      pageSize: Number(pageSize)
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

export default router;
