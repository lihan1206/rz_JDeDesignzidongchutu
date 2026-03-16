import express from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "../prisma.js";
import HttpError from "../utils/httpError.js";
import { signToken } from "../utils/jwt.js";
import { validateSchema } from "../utils/validate.js";

const router = express.Router();

const registerSchema = z.object({
  username: z.string().min(3, "用户名至少 3 位").max(30, "用户名最多 30 位"),
  email: z.string().email("邮箱格式不正确"),
  password: z.string().min(6, "密码至少 6 位"),
  role: z.enum(["USER", "DESIGNER"]).optional()
});

const loginSchema = z.object({
  account: z.string().min(1, "请输入用户名或邮箱"),
  password: z.string().min(1, "请输入密码")
});

router.post("/register", async (req, res, next) => {
  try {
    const payload = validateSchema(registerSchema, req.body);

    const exists = await prisma.user.findFirst({
      where: {
        OR: [{ username: payload.username }, { email: payload.email }]
      }
    });

    if (exists) {
      throw new HttpError(409, "用户名或邮箱已存在");
    }

    const passwordHash = await bcrypt.hash(payload.password, 10);

    const user = await prisma.user.create({
      data: {
        username: payload.username,
        email: payload.email,
        passwordHash,
        role: payload.role || "USER"
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        createdAt: true
      }
    });

    const token = signToken({ userId: user.id, role: user.role });

    res.json({
      success: true,
      message: "注册成功",
      data: { token, user }
    });
  } catch (error) {
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const payload = validateSchema(loginSchema, req.body);

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ username: payload.account }, { email: payload.account }]
      }
    });

    if (!user) {
      throw new HttpError(401, "账号或密码错误");
    }

    const valid = await bcrypt.compare(payload.password, user.passwordHash);
    if (!valid) {
      throw new HttpError(401, "账号或密码错误");
    }

    const token = signToken({ userId: user.id, role: user.role });

    res.json({
      success: true,
      message: "登录成功",
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
