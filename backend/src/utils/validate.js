import { ZodError } from "zod";
import HttpError from "./httpError.js";

export function validateSchema(schema, payload) {
  try {
    return schema.parse(payload);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new HttpError(400, "参数校验失败", error.flatten());
    }
    throw error;
  }
}
