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

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);
app.use(express.json({ limit: "3mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    message: "服务运行正常",
    data: {
      service: "JDeDesign 后端",
      time: new Date().toISOString()
    }
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/exports", exportRoutes);

app.use(notFound);
app.use(errorHandler);

setupCollaborationSocket(server);

server.listen(config.port, () => {
  logger.info({ port: config.port }, "JDeDesign 后端服务已启动");
});
