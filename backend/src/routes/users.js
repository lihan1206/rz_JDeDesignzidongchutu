import express from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "../prisma.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import HttpError from "../utils/httpError.js";
import { validateSchema } from "../utils/validate.js";

const router = express.Router();

const updatePasswordSchema = z.object({
  oldPassword: z.string().min(1, "请输入原密码"),
  newPassword: z.string().min(6, "新密码至少 6 位")
});

router.get("/me", requireAuth, async (req, res) => {
  res.json({
    success: true,
    data: req.user
  });
});

router.put("/password", requireAuth, async (req, res, next) => {
  try {
    const payload = validateSchema(updatePasswordSchema, req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (!user) {
      throw new HttpError(404, "用户不存在");
    }

    const valid = await bcrypt.compare(payload.oldPassword, user.passwordHash);
    if (!valid) {
      throw new HttpError(400, "原密码不正确");
    }

    const passwordHash = await bcrypt.hash(payload.newPassword, 10);

    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash }
    });

    res.json({
      success: true,
      message: "密码修改成功"
    });
  } catch (error) {
    next(error);
  }
});

router.get("/", requireAuth, requireRoles("ADMIN"), async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        createdAt: true,
        _count: {
          select: {
            projects: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    next(error);
  }
});

export default router;
