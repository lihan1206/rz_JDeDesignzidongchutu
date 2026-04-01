import { ZodError } from "zod";
import HttpError from "../utils/httpError.js";
import logger from "../logger.js";
import config from "../config.js";

export function notFound(_req, _res, next) {
  next(new HttpError(404, "接口不存在"));
}

export function errorHandler(error, req, res, _next) {
  let status = 500;
  let message = "服务器内部错误";
  let code = "INTERNAL_ERROR";
  let details = null;

  if (error instanceof HttpError) {
    status = error.status;
    message = error.message;
    details = error.details;
    code = error.code || `HTTP_${status}`;
  } else if (error instanceof ZodError) {
    status = 400;
    message = "参数校验失败";
    code = "VALIDATION_ERROR";
    details = error.errors.map((e) => ({
      path: e.path.join("."),
      message: e.message
    }));
  } else if (error.name === "SyntaxError" && error.status === 400 && "body" in error) {
    status = 400;
    message = "JSON 格式错误";
    code = "INVALID_JSON";
  } else if (error.name === "UnauthorizedError") {
    status = 401;
    message = "Token 无效或已过期";
    code = "INVALID_TOKEN";
  } else if (error.code === "LIMIT_FILE_SIZE") {
    status = 413;
    message = "请求体过大";
    code = "PAYLOAD_TOO_LARGE";
  } else if (error.code === "ECONNREFUSED") {
    status = 503;
    message = "服务暂时不可用";
    code = "SERVICE_UNAVAILABLE";
  } else if (error.code === "PRISMA") {
    status = 500;
    message = "数据库操作失败";
    code = "DATABASE_ERROR";
    if (config.nodeEnv === "development") {
      details = error.meta;
    }
  }

  if (status >= 500) {
    logger.error(
      {
        err: error,
        path: req.path,
        method: req.method,
        status,
        requestId: req.requestId,
        body: req.body,
        query: req.query
      },
      "服务器错误"
    );
  } else {
    logger.warn(
      {
        path: req.path,
        method: req.method,
        status,
        code,
        message,
        requestId: req.requestId
      },
      "请求处理失败"
    );
  }

  res.status(status).json({
    success: false,
    error: {
      code,
      message,
      details,
      requestId: req.requestId
    }
  });
}
