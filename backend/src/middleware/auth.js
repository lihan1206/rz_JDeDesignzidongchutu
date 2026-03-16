import prisma from "../prisma.js";
import HttpError from "../utils/httpError.js";
import { verifyToken } from "../utils/jwt.js";

export async function requireAuth(req, _res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new HttpError(401, "未授权访问，请先登录");
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const payload = verifyToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        createdAt: true
      }
    });

    if (!user) {
      throw new HttpError(401, "登录状态无效，请重新登录");
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRoles(...roles) {
  return function roleMiddleware(req, _res, next) {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new HttpError(403, "当前账号没有操作权限"));
      return;
    }

    next();
  };
}
