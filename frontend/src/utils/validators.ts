import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "邮箱不能为空")
    .email("请输入有效的邮箱地址"),
  password: z.string().min(1, "密码不能为空")
});

export const registerSchema = z
  .object({
    username: z
      .string()
      .min(3, "用户名至少需要3个字符")
      .max(20, "用户名不能超过20个字符")
      .regex(
        /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/,
        "用户名只能包含字母、数字、下划线和中文"
      ),
    email: z
      .string()
      .min(1, "邮箱不能为空")
      .email("请输入有效的邮箱地址"),
    password: z
      .string()
      .min(6, "密码至少需要6个字符")
      .max(32, "密码不能超过32个字符"),
    confirmPassword: z.string().min(1, "请确认密码")
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "两次输入的密码不一致",
    path: ["confirmPassword"]
  });

export function parseWithSchema<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.issues[0]?.message || "参数验证失败";
    throw new Error(message);
  }
  return result.data;
}

export const projectSchema = z.object({
  name: z
    .string()
    .min(1, "项目名称不能为空")
    .max(100, "项目名称不能超过100个字符"),
  description: z
    .string()
    .max(1000, "项目描述不能超过1000个字符")
    .optional(),
  tags: z
    .array(z.string().max(30, "标签不能超过30个字符"))
    .optional(),
  status: z.enum(["DRAFT", "COMPLETED", "ARCHIVED"]).optional()
});

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidPassword(password: string): {
  valid: boolean;
  message?: string;
} {
  if (!password || password.length < 6) {
    return { valid: false, message: "密码至少需要6个字符" };
  }
  if (password.length > 32) {
    return { valid: false, message: "密码不能超过32个字符" };
  }
  return { valid: true };
}

export function isValidUsername(username: string): {
  valid: boolean;
  message?: string;
} {
  if (!username || username.length < 3) {
    return { valid: false, message: "用户名至少需要3个字符" };
  }
  if (username.length > 20) {
    return { valid: false, message: "用户名不能超过20个字符" };
  }
  if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(username)) {
    return {
      valid: false,
      message: "用户名只能包含字母、数字、下划线和中文"
    };
  }
  return { valid: true };
}

export function isValidProjectName(name: string): {
  valid: boolean;
  message?: string;
} {
  if (!name || name.trim().length === 0) {
    return { valid: false, message: "项目名称不能为空" };
  }
  if (name.length > 100) {
    return { valid: false, message: "项目名称不能超过100个字符" };
  }
  return { valid: true };
}

export function sanitizeInput(input: string): string {
  if (typeof input !== "string") {
    return "";
  }
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+=/g, "");
}

export function validateNumberRange(
  value: number,
  min: number,
  max: number
): boolean {
  if (typeof value !== "number" || isNaN(value)) {
    return false;
  }
  return value >= min && value <= max;
}

export function validateColor(color: string): boolean {
  if (typeof color !== "string") {
    return false;
  }
  const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  const rgbRegex = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/;
  const rgbaRegex =
    /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0|1|0?\.\d+)\s*\)$/;
  const namedColors = new Set([
    "transparent",
    "none",
    "red",
    "green",
    "blue",
    "black",
    "white",
    "gray"
  ]);

  return (
    hexRegex.test(color) ||
    rgbRegex.test(color) ||
    rgbaRegex.test(color) ||
    namedColors.has(color.toLowerCase())
  );
}
