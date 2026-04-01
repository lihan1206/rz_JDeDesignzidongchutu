import fs from "fs";
import path from "path";
import { createReadStream, createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import crypto from "crypto";
import dayjs from "dayjs";
import config from "../config.js";
import HttpError from "../utils/httpError.js";

// 存储类型枚举
export const StorageType = {
  LOCAL: "local",
  MINIO: "minio",
  OSS: "oss"
};

// 文件类型枚举
export const FileType = {
  EXPORT: "export",
  IMPORT: "import",
  TEMP: "temp",
  BACKUP: "backup"
};

// 确保目录存在
function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// 生成唯一文件名
function generateUniqueFileName(originalName) {
  const timestamp = dayjs().format("YYYYMMDD_HHmmss_SSS");
  const random = crypto.randomBytes(4).toString("hex");
  const ext = path.extname(originalName) || "";
  const baseName = path.basename(originalName, ext) || "file";
  return `${baseName}_${timestamp}_${random}${ext}`;
}

// 计算文件哈希
export async function calculateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = createReadStream(filePath);
    
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

// 获取文件信息
export async function getFileInfo(filePath) {
  try {
    const stats = await fs.promises.stat(filePath);
    return {
      exists: true,
      size: stats.size,
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory()
    };
  } catch (error) {
    return { exists: false };
  }
}

// 格式化文件大小
export function formatFileSize(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// 本地存储服务
class LocalStorageService {
  constructor() {
    this.basePath = config.storageBasePath || path.join(process.cwd(), "storage");
    ensureDirSync(this.basePath);
  }

  // 获取存储路径
  getStoragePath(fileType = FileType.TEMP) {
    const storagePath = path.join(this.basePath, fileType);
    ensureDirSync(storagePath);
    return storagePath;
  }

  // 保存文件
  async saveFile(sourcePath, options = {}) {
    const { fileType = FileType.TEMP, fileName, keepOriginalName = false } = options;
    
    const storagePath = this.getStoragePath(fileType);
    const finalFileName = keepOriginalName 
      ? (fileName || path.basename(sourcePath))
      : (fileName || generateUniqueFileName(path.basename(sourcePath)));
    
    const targetPath = path.join(storagePath, finalFileName);
    
    // 如果源路径是文件路径，复制文件
    if (fs.existsSync(sourcePath)) {
      await fs.promises.copyFile(sourcePath, targetPath);
    }
    
    const stats = await fs.promises.stat(targetPath);
    const hash = await calculateFileHash(targetPath);
    
    return {
      fileName: finalFileName,
      filePath: targetPath,
      relativePath: path.join(fileType, finalFileName),
      fileSize: stats.size,
      hash,
      storageType: StorageType.LOCAL
    };
  }

  // 保存流
  async saveStream(sourceStream, options = {}) {
    const { fileType = FileType.TEMP, fileName } = options;
    
    const storagePath = this.getStoragePath(fileType);
    const finalFileName = fileName || generateUniqueFileName("stream.bin");
    const targetPath = path.join(storagePath, finalFileName);
    
    const writeStream = createWriteStream(targetPath);
    await pipeline(sourceStream, writeStream);
    
    const stats = await fs.promises.stat(targetPath);
    const hash = await calculateFileHash(targetPath);
    
    return {
      fileName: finalFileName,
      filePath: targetPath,
      relativePath: path.join(fileType, finalFileName),
      fileSize: stats.size,
      hash,
      storageType: StorageType.LOCAL
    };
  }

  // 保存Buffer
  async saveBuffer(buffer, options = {}) {
    const { fileType = FileType.TEMP, fileName } = options;
    
    const storagePath = this.getStoragePath(fileType);
    const finalFileName = fileName || generateUniqueFileName("buffer.bin");
    const targetPath = path.join(storagePath, finalFileName);
    
    await fs.promises.writeFile(targetPath, buffer);
    
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    
    return {
      fileName: finalFileName,
      filePath: targetPath,
      relativePath: path.join(fileType, finalFileName),
      fileSize: buffer.length,
      hash,
      storageType: StorageType.LOCAL
    };
  }

  // 读取文件
  async readFile(filePath) {
    const absolutePath = this.resolvePath(filePath);
    
    if (!fs.existsSync(absolutePath)) {
      throw new HttpError(404, "文件不存在");
    }
    
    return fs.promises.readFile(absolutePath);
  }

  // 创建读取流
  createReadStream(filePath) {
    const absolutePath = this.resolvePath(filePath);
    
    if (!fs.existsSync(absolutePath)) {
      throw new HttpError(404, "文件不存在");
    }
    
    return createReadStream(absolutePath);
  }

  // 删除文件
  async deleteFile(filePath) {
    const absolutePath = this.resolvePath(filePath);
    
    if (fs.existsSync(absolutePath)) {
      await fs.promises.unlink(absolutePath);
      return true;
    }
    
    return false;
  }

  // 移动文件
  async moveFile(sourcePath, targetPath) {
    const absoluteSource = this.resolvePath(sourcePath);
    const absoluteTarget = this.resolvePath(targetPath);
    
    if (!fs.existsSync(absoluteSource)) {
      throw new HttpError(404, "源文件不存在");
    }
    
    ensureDirSync(path.dirname(absoluteTarget));
    await fs.promises.rename(absoluteSource, absoluteTarget);
    
    return {
      filePath: absoluteTarget,
      relativePath: targetPath
    };
  }

  // 复制文件
  async copyFile(sourcePath, targetPath) {
    const absoluteSource = this.resolvePath(sourcePath);
    const absoluteTarget = this.resolvePath(targetPath);
    
    if (!fs.existsSync(absoluteSource)) {
      throw new HttpError(404, "源文件不存在");
    }
    
    ensureDirSync(path.dirname(absoluteTarget));
    await fs.promises.copyFile(absoluteSource, absoluteTarget);
    
    return {
      filePath: absoluteTarget,
      relativePath: targetPath
    };
  }

  // 检查文件是否存在
  exists(filePath) {
    const absolutePath = this.resolvePath(filePath);
    return fs.existsSync(absolutePath);
  }

  // 获取文件状态
  async stat(filePath) {
    const absolutePath = this.resolvePath(filePath);
    
    if (!fs.existsSync(absolutePath)) {
      return null;
    }
    
    const stats = await fs.promises.stat(absolutePath);
    return {
      size: stats.size,
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory()
    };
  }

  // 列出目录内容
  async listDir(dirPath = "", options = {}) {
    const { recursive = false, fileType } = options;
    const absolutePath = fileType 
      ? this.getStoragePath(fileType)
      : path.join(this.basePath, dirPath);
    
    if (!fs.existsSync(absolutePath)) {
      return [];
    }
    
    const entries = await fs.promises.readdir(absolutePath, { withFileTypes: true });
    const result = [];
    
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      const fullPath = path.join(absolutePath, entry.name);
      const stats = await fs.promises.stat(fullPath);
      
      result.push({
        name: entry.name,
        path: entryPath,
        relativePath: path.join(fileType || "", entryPath),
        isFile: entry.isFile(),
        isDirectory: entry.isDirectory(),
        size: stats.size,
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime
      });
      
      if (recursive && entry.isDirectory()) {
        const subEntries = await this.listDir(entryPath, { recursive, fileType });
        result.push(...subEntries);
      }
    }
    
    return result;
  }

  // 清理过期文件
  async cleanup(maxAgeDays = 30, fileType) {
    const cutoffDate = dayjs().subtract(maxAgeDays, "day").toDate();
    const files = await this.listDir("", { recursive: true, fileType });
    
    let deletedCount = 0;
    let freedSpace = 0;
    
    for (const file of files) {
      if (file.isFile && new Date(file.modifiedAt) < cutoffDate) {
        try {
          await this.deleteFile(file.relativePath);
          deletedCount++;
          freedSpace += file.size;
        } catch (error) {
          console.error(`删除文件失败: ${file.path}`, error);
        }
      }
    }
    
    return {
      deletedCount,
      freedSpace,
      freedSpaceFormatted: formatFileSize(freedSpace)
    };
  }

  // 获取存储统计
  async getStats(fileType) {
    const files = await this.listDir("", { recursive: true, fileType });
    
    let totalSize = 0;
    let fileCount = 0;
    let dirCount = 0;
    
    for (const file of files) {
      if (file.isFile) {
        fileCount++;
        totalSize += file.size;
      } else {
        dirCount++;
      }
    }
    
    return {
      totalSize,
      totalSizeFormatted: formatFileSize(totalSize),
      fileCount,
      dirCount,
      totalCount: fileCount + dirCount
    };
  }

  // 解析路径
  resolvePath(filePath) {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.join(this.basePath, filePath);
  }
}

// 存储服务工厂
class StorageServiceFactory {
  constructor() {
    this.services = new Map();
    this.defaultType = config.storageType || StorageType.LOCAL;
  }

  getService(type) {
    const storageType = type || this.defaultType;
    
    if (!this.services.has(storageType)) {
      switch (storageType) {
        case StorageType.LOCAL:
          this.services.set(storageType, new LocalStorageService());
          break;
        default:
          throw new HttpError(500, `不支持的存储类型: ${storageType}`);
      }
    }
    
    return this.services.get(storageType);
  }

  setDefaultType(type) {
    this.defaultType = type;
  }
}

// 创建全局存储服务工厂
const storageFactory = new StorageServiceFactory();

// 导出便捷方法
export function getStorageService(type) {
  return storageFactory.getService(type);
}

export async function saveFile(sourcePath, options = {}) {
  const service = getStorageService(options.storageType);
  return service.saveFile(sourcePath, options);
}

export async function saveStream(sourceStream, options = {}) {
  const service = getStorageService(options.storageType);
  return service.saveStream(sourceStream, options);
}

export async function saveBuffer(buffer, options = {}) {
  const service = getStorageService(options.storageType);
  return service.saveBuffer(buffer, options);
}

export async function readFile(filePath, storageType) {
  const service = getStorageService(storageType);
  return service.readFile(filePath);
}

export function createFileReadStream(filePath, storageType) {
  const service = getStorageService(storageType);
  return service.createReadStream(filePath);
}

export async function deleteFile(filePath, storageType) {
  const service = getStorageService(storageType);
  return service.deleteFile(filePath);
}

export async function moveFile(sourcePath, targetPath, storageType) {
  const service = getStorageService(storageType);
  return service.moveFile(sourcePath, targetPath);
}

export async function copyFile(sourcePath, targetPath, storageType) {
  const service = getStorageService(storageType);
  return service.copyFile(sourcePath, targetPath);
}

export function fileExists(filePath, storageType) {
  const service = getStorageService(storageType);
  return service.exists(filePath);
}

export async function getFileStat(filePath, storageType) {
  const service = getStorageService(storageType);
  return service.stat(filePath);
}

export async function listFiles(dirPath = "", options = {}) {
  const service = getStorageService(options.storageType);
  return service.listDir(dirPath, options);
}

export async function cleanupFiles(maxAgeDays = 30, fileType, storageType) {
  const service = getStorageService(storageType);
  return service.cleanup(maxAgeDays, fileType);
}

export async function getStorageStats(fileType, storageType) {
  const service = getStorageService(storageType);
  return service.getStats(fileType);
}

export default {
  StorageType,
  FileType,
  getStorageService,
  saveFile,
  saveStream,
  saveBuffer,
  readFile,
  createFileReadStream,
  deleteFile,
  moveFile,
  copyFile,
  fileExists,
  getFileStat,
  listFiles,
  cleanupFiles,
  getStorageStats,
  calculateFileHash,
  getFileInfo,
  formatFileSize
};
