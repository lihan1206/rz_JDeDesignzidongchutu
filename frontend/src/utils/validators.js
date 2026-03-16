import { z } from "zod";

export const loginSchema = z.object({
  account: z.string().min(1, "请输入用户名或邮箱"),
  password: z.string().min(1, "请输入密码")
});

export const registerSchema = z
  .object({
    username: z.string().min(3, "用户名至少 3 位"),
    email: z.string().email("邮箱格式错误"),
    password: z.string().min(6, "密码至少 6 位"),
    confirmPassword: z.string().min(6, "确认密码至少 6 位")
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "两次输入的密码不一致",
    path: ["confirmPassword"]
  });

export const projectSchema = z.object({
  name: z.string().min(1, "请输入项目名称").max(100, "项目名称最多 100 字"),
  description: z.string().max(1000, "项目描述最多 1000 字").optional(),
  tags: z.array(z.string().max(30, "标签最多 30 字")).optional()
});

export function parseWithSchema(schema, payload) {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const message = result.error.issues?.[0]?.message || "输入参数不合法";
    throw new Error(message);
  }
  return result.data;
}
