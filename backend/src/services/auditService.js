import prisma from "../prisma.js";

export async function logAudit({
  userId,
  projectId,
  action,
  entity,
  entityId,
  oldValue,
  newValue,
  ip,
  userAgent
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId || null,
        projectId: projectId || null,
        action,
        entity,
        entityId: entityId || null,
        oldValue: oldValue || null,
        newValue: newValue || null,
        ip: ip || null,
        userAgent: userAgent || null
      }
    });
  } catch (error) {
    console.error("[AUDIT LOG ERROR]", error.message);
  }
}

export async function getAuditLogs({
  userId,
  projectId,
  action,
  entity,
  startDate,
  endDate,
  page = 1,
  pageSize = 20
}) {
  const where = {};

  if (userId) {
    where.userId = userId;
  }

  if (projectId) {
    where.projectId = projectId;
  }

  if (action) {
    where.action = action;
  }

  if (entity) {
    where.entity = entity;
  }

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) {
      where.createdAt.gte = new Date(startDate);
    }
    if (endDate) {
      where.createdAt.lte = new Date(endDate);
    }
  }

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: { id: true, username: true, email: true }
        },
        project: {
          select: { id: true, name: true }
        }
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ]);

  return {
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    logs
  };
}

export async function getUserActivityStats(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const logs = await prisma.auditLog.groupBy({
    by: ["action"],
    where: {
      userId,
      createdAt: { gte: startDate }
    },
    _count: { id: true }
  });

  const dailyActivity = await prisma.auditLog.groupBy({
    by: ["createdAt"],
    where: {
      userId,
      createdAt: { gte: startDate }
    },
    _count: { id: true }
  });

  return {
    actionStats: logs.reduce((acc, log) => {
      acc[log.action] = log._count.id;
      return acc;
    }, {}),
    totalActions: logs.reduce((sum, log) => sum + log._count.id, 0),
    dailyActivity: dailyActivity.map((d) => ({
      date: d.createdAt.toISOString().split("T")[0],
      count: d._count.id
    }))
  };
}

export async function getProjectActivityStats(projectId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const logs = await prisma.auditLog.groupBy({
    by: ["action", "userId"],
    where: {
      projectId,
      createdAt: { gte: startDate }
    },
    _count: { id: true }
  });

  const contributors = await prisma.auditLog.findMany({
    where: {
      projectId,
      createdAt: { gte: startDate }
    },
    select: {
      user: {
        select: { id: true, username: true, email: true }
      }
    },
    distinct: ["userId"]
  });

  return {
    actionStats: logs.reduce((acc, log) => {
      acc[log.action] = (acc[log.action] || 0) + log._count.id;
      return acc;
    }, {}),
    contributors: contributors.map((c) => c.user).filter(Boolean),
    totalActions: logs.reduce((sum, log) => sum + log._count.id, 0)
  };
}

export async function cleanupOldAuditLogs(daysToKeep = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  const result = await prisma.auditLog.deleteMany({
    where: {
      createdAt: { lt: cutoffDate }
    }
  });

  console.log(`[AUDIT CLEANUP] Deleted ${result.count} old audit logs`);
  return result.count;
}
