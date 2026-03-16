import HttpError from "../utils/httpError.js";
import logger from "../logger.js";

export function notFound(_req, _res, next) {
  next(new HttpError(404, "接口不存在"));
}

export function errorHandler(error, req, res, _next) {
  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof HttpError ? error.message : "服务器内部错误";
  const details = error instanceof HttpError ? error.details : null;

  logger.error(
    {
      err: error,
      path: req.path,
      method: req.method,
      status
    },
    "请求处理失败"
  );

  res.status(status).json({
    success: false,
    message,
    details
  });
}
