import fs from "fs";
import http from "http";
import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import config from "./config.js";
import logger from "./logger.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import projectRoutes from "./routes/projects.js";
import templateRoutes from "./routes/templates.js";
import exportRoutes from "./routes/exports.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { setupCollaborationSocket } from "./socket/collaboration.js";
import { securityHeaders, sanitizeInput, requestLogger } from "./middleware/security.js";
import { rateLimit, authRateLimit } from "./middleware/rateLimit.js";

if (!fs.existsSync(config.exportBasePath)) {
  fs.mkdirSync(config.exportBasePath, { recursive: true });
}

const app = express();
const server = http.createServer(app);

app.use(
  pinoHttp({
    logger,
    customLogLevel(_req, res, error) {
      if (error || res.statusCode >= 500) {
        return "error";
      }
      if (res.statusCode >= 400) {
        return "warn";
      }
      return "info";
    }
  })
);

app.use(securityHeaders);
app.use(requestLogger);

app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",")
      : ["http://localhost:3217", "http://127.0.0.1:3217"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
    exposedHeaders: ["X-Request-Id", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
    credentials: true,
    maxAge: 86400
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use(sanitizeInput);

app.use(rateLimit({ windowMs: 60 * 1000, max: 200 }));

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    message: "服务运行正常",
    data: {
      service: "JDeDesign 后端",
      version: "1.0.0",
      time: new Date().toISOString(),
      env: config.nodeEnv
    }
  });
});

app.use("/api/auth", authRateLimit(), authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/exports", exportRoutes);

app.use(notFound);
app.use(errorHandler);

setupCollaborationSocket(server);

server.listen(config.port, () => {
  logger.info({ port: config.port, env: config.nodeEnv }, "JDeDesign 后端服务已启动");
});

process.on("uncaughtException", (error) => {
  logger.error({ error }, "Uncaught Exception");
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error({ reason, promise }, "Unhandled Rejection");
});
