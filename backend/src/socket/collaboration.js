import { Server } from "socket.io";
import logger from "../logger.js";
import prisma from "../prisma.js";
import { verifyToken } from "../utils/jwt.js";

const projectPresenceMap = new Map();

// WebSocket 服务器实例
let ioInstance = null;

const fallbackDesign = {
  canvas: {
    width: 1200,
    height: 780,
    background: "#f6f9ff"
  },
  layers: [{ id: "layer-main", name: "主图层", visible: true, locked: false, order: 1 }],
  elements: []
};

function roomName(projectId) {
  return `project:${projectId}`;
}

function toSafeNumber(value) {
  const num = Number(value);
  if (Number.isNaN(num)) {
    return null;
  }
  return num;
}

function getCollaborators(projectId) {
  const members = projectPresenceMap.get(projectId);
  if (!members) {
    return [];
  }

  return Array.from(members.values()).map((item) => ({
    userId: item.userId,
    username: item.username,
    role: item.role
  }));
}

function emitCollaborators(io, projectId) {
  io.to(roomName(projectId)).emit("project:collaborators", {
    projectId,
    collaborators: getCollaborators(projectId)
  });
}

function removePresence(io, socket) {
  const joinedProjectId = socket.data?.projectId;
  if (!joinedProjectId) {
    return;
  }

  const members = projectPresenceMap.get(joinedProjectId);
  if (members) {
    members.delete(socket.id);
    if (members.size === 0) {
      projectPresenceMap.delete(joinedProjectId);
    }
  }

  emitCollaborators(io, joinedProjectId);
}

async function canAccessProject(projectId, user) {
  const project = await prisma.project.findFirst({
    where:
      user.role === "ADMIN"
        ? { id: projectId }
        : {
            id: projectId,
            userId: user.id
          },
    select: { id: true }
  });

  return Boolean(project);
}

function isValidDesignData(data) {
  if (!data || typeof data !== "object") {
    return false;
  }

  if (!data.canvas || !Array.isArray(data.elements) || !Array.isArray(data.layers)) {
    return false;
  }

  return true;
}

async function socketAuthMiddleware(socket, next) {
  try {
    const authToken =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "").trim();

    if (!authToken) {
      next(new Error("未提供认证令牌"));
      return;
    }

    const payload = verifyToken(authToken);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        username: true,
        role: true
      }
    });

    if (!user) {
      next(new Error("登录状态无效"));
      return;
    }

    socket.data.user = user;
    socket.userId = user.id; // 用于导出进度通知
    next();
  } catch (_error) {
    next(new Error("鉴权失败"));
  }
}

export function setupCollaborationSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: "*"
    }
  });

  // 保存实例供其他模块使用
  ioInstance = io;

  io.use(socketAuthMiddleware);

  io.on("connection", (socket) => {
    const user = socket.data.user;

    socket.on("project:join", async (payload, ack) => {
      try {
        const projectId = toSafeNumber(payload?.projectId);
        if (!projectId) {
          throw new Error("项目 ID 无效");
        }

        const access = await canAccessProject(projectId, user);
        if (!access) {
          throw new Error("没有权限加入该项目协作");
        }

        removePresence(io, socket);

        socket.data.projectId = projectId;
        socket.join(roomName(projectId));

        const members = projectPresenceMap.get(projectId) || new Map();
        members.set(socket.id, {
          userId: user.id,
          username: user.username,
          role: user.role
        });
        projectPresenceMap.set(projectId, members);

        const [realtime, latestVersion] = await Promise.all([
          prisma.realtimeState.findUnique({ where: { projectId } }),
          prisma.designVersion.findFirst({
            where: { projectId },
            orderBy: { version: "desc" }
          })
        ]);

        const designData = realtime?.data || latestVersion?.data || fallbackDesign;

        socket.emit("project:init", {
          projectId,
          designData,
          collaborators: getCollaborators(projectId)
        });

        emitCollaborators(io, projectId);

        if (typeof ack === "function") {
          ack({ success: true });
        }
      } catch (error) {
        if (typeof ack === "function") {
          ack({ success: false, message: error.message || "加入协作失败" });
        }
      }
    });

    socket.on("project:sync", async (payload, ack) => {
      try {
        const projectId = toSafeNumber(payload?.projectId);
        const designData = payload?.designData;

        if (!projectId || !isValidDesignData(designData)) {
          throw new Error("协作数据格式不正确");
        }

        if (socket.data.projectId !== projectId) {
          throw new Error("当前连接未加入该项目协作房间");
        }

        await prisma.realtimeState.upsert({
          where: { projectId },
          update: { data: designData },
          create: { projectId, data: designData }
        });

        socket.to(roomName(projectId)).emit("project:sync", {
          projectId,
          designData,
          editor: {
            userId: user.id,
            username: user.username
          }
        });

        if (typeof ack === "function") {
          ack({ success: true });
        }
      } catch (error) {
        if (typeof ack === "function") {
          ack({ success: false, message: error.message || "同步失败" });
        }
      }
    });

    socket.on("disconnect", () => {
      removePresence(io, socket);
      logger.info({ socketId: socket.id, userId: user.id }, "协作连接已断开");
    });
  });

  return io;
}

// 获取 WebSocket 服务器实例
export function getWebSocketServer() {
  return ioInstance;
}

// 发送导出进度通知给特定用户
export function sendExportProgressToUser(userId, payload) {
  if (!ioInstance) {
    logger.warn("WebSocket 服务器未初始化，无法发送导出进度");
    return false;
  }

  let sent = false;
  ioInstance.sockets.sockets.forEach((socket) => {
    if (socket.userId === userId) {
      socket.emit("export:progress", payload);
      sent = true;
    }
  });

  return sent;
}

export default {
  setupCollaborationSocket,
  getWebSocketServer,
  sendExportProgressToUser
};
