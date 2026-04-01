import fs from "fs";
import path from "path";
import dayjs from "dayjs";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import config from "../config.js";
import HttpError from "../utils/httpError.js";

const MAX_FILE_AGE_DAYS = 30;
const MAX_FILE_SIZE_MB = 50;
const MAX_CANVAS_DIMENSION = 8000;
const MAX_ELEMENT_COUNT = 5000;

const SUPPORTED_FORMATS = ["PDF", "SVG", "DXF", "PNG"];
const MIME_TYPES = {
  PDF: "application/pdf",
  SVG: "image/svg+xml",
  DXF: "application/dxf",
  PNG: "image/png"
};

const exportMetrics = {
  totalExports: 0,
  errors: 0,
  byFormat: { PDF: 0, SVG: 0, DXF: 0, PNG: 0 }
};

function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function clampNumber(value, fallback = 0, min = -Infinity, max = Infinity) {
  const num = Number(value);
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, num));
}

function normalizeColor(color, fallback = "#1f1f1f") {
  if (typeof color !== "string") {
    return fallback;
  }
  const value = color.trim();
  if (!value) {
    return fallback;
  }
  if (value.length > 50) {
    return fallback;
  }
  return value;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function toHex24(color) {
  if (!color) {
    return "000000";
  }

  const text = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text)) {
    return text.slice(1).toUpperCase();
  }

  if (/^#[0-9a-fA-F]{3}$/.test(text)) {
    return `${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`.toUpperCase();
  }

  return "000000";
}

function validateDesignData(data) {
  if (!data || typeof data !== "object") {
    throw new HttpError(400, "设计数据无效");
  }

  const canvas = data?.canvas || {};
  const width = clampNumber(canvas.width, 1200, 200, MAX_CANVAS_DIMENSION);
  const height = clampNumber(canvas.height, 780, 200, MAX_CANVAS_DIMENSION);

  if (width * height > 64000000) {
    throw new HttpError(400, "画布尺寸过大，最大支持 8000x8000");
  }

  const elements = Array.isArray(data?.elements) ? data.elements : [];
  if (elements.length > MAX_ELEMENT_COUNT) {
    throw new HttpError(400, `元素数量超过限制（最大 ${MAX_ELEMENT_COUNT} 个）`);
  }

  return { width, height, elements };
}

function getVisibleElements(data) {
  const elements = Array.isArray(data?.elements) ? data.elements : [];
  const layers = Array.isArray(data?.layers) ? data.layers : [];

  if (layers.length === 0) {
    return elements;
  }

  const layerMap = new Map(layers.map((layer) => [layer.id, layer]));

  return elements.filter((element) => {
    if (!element.layerId) {
      return true;
    }
    const layer = layerMap.get(element.layerId);
    if (!layer) {
      return true;
    }
    return layer.visible !== false;
  });
}

function dimensionText(element) {
  if (element.text) {
    return String(element.text).substring(0, 100);
  }

  const x1 = clampNumber(element.x1);
  const y1 = clampNumber(element.y1);
  const x2 = clampNumber(element.x2);
  const y2 = clampNumber(element.y2);
  const distance = Math.hypot(x2 - x1, y2 - y1);
  return `${distance.toFixed(0)} mm`;
}

function buildSvg(data) {
  const canvas = data?.canvas || {};
  const width = clampNumber(canvas.width, 1200, 200, MAX_CANVAS_DIMENSION);
  const height = clampNumber(canvas.height, 780, 200, MAX_CANVAS_DIMENSION);
  const background = normalizeColor(canvas.background, "#ffffff");
  const elements = getVisibleElements(data);

  const items = elements
    .map((element) => {
      if (element.type === "rect") {
        const x = clampNumber(element.x);
        const y = clampNumber(element.y);
        const w = Math.max(1, clampNumber(element.width, 120));
        const h = Math.max(1, clampNumber(element.height, 80));
        const rotation = clampNumber(element.rotation, 0, -360, 360);
        const cx = x + w / 2;
        const cy = y + h / 2;
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${normalizeColor(element.fill, "none")}" stroke="${normalizeColor(element.stroke)}" stroke-width="${Math.max(1, clampNumber(element.strokeWidth, 1))}" transform="rotate(${rotation} ${cx} ${cy})" />`;
      }

      if (element.type === "circle") {
        return `<circle cx="${clampNumber(element.x)}" cy="${clampNumber(element.y)}" r="${Math.max(1, clampNumber(element.radius, 50))}" fill="${normalizeColor(element.fill, "none")}" stroke="${normalizeColor(element.stroke)}" stroke-width="${Math.max(1, clampNumber(element.strokeWidth, 1))}" />`;
      }

      if (element.type === "line") {
        return `<line x1="${clampNumber(element.x1)}" y1="${clampNumber(element.y1)}" x2="${clampNumber(element.x2)}" y2="${clampNumber(element.y2)}" stroke="${normalizeColor(element.stroke)}" stroke-width="${Math.max(1, clampNumber(element.strokeWidth, 1))}" />`;
      }

      if (element.type === "dimension") {
        const x1 = clampNumber(element.x1);
        const y1 = clampNumber(element.y1);
        const x2 = clampNumber(element.x2);
        const y2 = clampNumber(element.y2);
        const textX = (x1 + x2) / 2;
        const textY = (y1 + y2) / 2 - 8;
        return `<g><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${normalizeColor(element.stroke, "#fa8c16")}" stroke-width="${Math.max(1, clampNumber(element.strokeWidth, 1))}" /><text x="${textX}" y="${textY}" text-anchor="middle" fill="${normalizeColor(element.stroke, "#fa8c16")}" font-size="${Math.max(10, clampNumber(element.fontSize, 14))}" font-family="'PingFang SC', 'Microsoft YaHei', sans-serif">${escapeXml(dimensionText(element))}</text></g>`;
      }

      if (element.type === "text") {
        const textContent = String(element.text || "").substring(0, 1000);
        return `<text x="${clampNumber(element.x)}" y="${clampNumber(element.y)}" fill="${normalizeColor(element.fill)}" font-size="${Math.max(10, clampNumber(element.fontSize, 20))}" font-family="'PingFang SC', 'Microsoft YaHei', sans-serif">${escapeXml(textContent)}</text>`;
      }

      return "";
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n  <rect width="100%" height="100%" fill="${background}" />\n  ${items}\n</svg>`;
}

function buildDxf(data) {
  const elements = getVisibleElements(data);
  const lines = ["0", "SECTION", "2", "HEADER", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES"];

  for (const element of elements) {
    if (element.type === "line" || element.type === "dimension") {
      lines.push(
        "0",
        "LINE",
        "8",
        "0",
        "62",
        "7",
        "10",
        String(clampNumber(element.x1)),
        "20",
        String(clampNumber(element.y1)),
        "11",
        String(clampNumber(element.x2)),
        "21",
        String(clampNumber(element.y2))
      );

      if (element.type === "dimension") {
        lines.push(
          "0",
          "TEXT",
          "8",
          "0",
          "62",
          "7",
          "10",
          String((clampNumber(element.x1) + clampNumber(element.x2)) / 2),
          "20",
          String((clampNumber(element.y1) + clampNumber(element.y2)) / 2),
          "40",
          String(Math.max(8, clampNumber(element.fontSize, 14))),
          "1",
          dimensionText(element)
        );
      }
      continue;
    }

    if (element.type === "rect") {
      const x = clampNumber(element.x);
      const y = clampNumber(element.y);
      const w = clampNumber(element.width, 100);
      const h = clampNumber(element.height, 80);
      const points = [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
        [x, y]
      ];
      for (let i = 0; i < points.length - 1; i += 1) {
        lines.push(
          "0",
          "LINE",
          "8",
          "0",
          "62",
          "7",
          "10",
          String(points[i][0]),
          "20",
          String(points[i][1]),
          "11",
          String(points[i + 1][0]),
          "21",
          String(points[i + 1][1])
        );
      }
      continue;
    }

    if (element.type === "circle") {
      lines.push(
        "0",
        "CIRCLE",
        "8",
        "0",
        "62",
        "7",
        "10",
        String(clampNumber(element.x)),
        "20",
        String(clampNumber(element.y)),
        "40",
        String(Math.max(1, clampNumber(element.radius, 20)))
      );
      continue;
    }

    if (element.type === "text") {
      const textContent = String(element.text || "").substring(0, 200);
      lines.push(
        "0",
        "TEXT",
        "8",
        "0",
        "62",
        "7",
        "10",
        String(clampNumber(element.x)),
        "20",
        String(clampNumber(element.y)),
        "40",
        String(Math.max(8, clampNumber(element.fontSize, 20))),
        "1",
        textContent
      );
    }
  }

  lines.push("0", "ENDSEC", "0", "EOF");
  return lines.join("\n");
}

function writePdf(filePath, data) {
  const canvas = data?.canvas || {};
  const width = Math.max(200, clampNumber(canvas.width, 1200, 200, MAX_CANVAS_DIMENSION));
  const height = Math.max(200, clampNumber(canvas.height, 780, 200, MAX_CANVAS_DIMENSION));
  const elements = getVisibleElements(data);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new HttpError(504, "PDF 生成超时"));
    }, 30000);

    const doc = new PDFDocument({ size: [width, height], margin: 0 });
    const stream = fs.createWriteStream(filePath);

    stream.on("finish", () => {
      clearTimeout(timeout);
      resolve();
    });

    stream.on("error", (err) => {
      clearTimeout(timeout);
      reject(new HttpError(500, `PDF 写入失败: ${err.message}`));
    });

    doc.pipe(stream);
    doc.rect(0, 0, width, height).fill(normalizeColor(canvas.background, "#ffffff"));

    for (const element of elements) {
      if (element.type === "rect") {
        const x = clampNumber(element.x);
        const y = clampNumber(element.y);
        const w = Math.max(1, clampNumber(element.width, 100));
        const h = Math.max(1, clampNumber(element.height, 80));
        const rotation = clampNumber(element.rotation, 0, -360, 360);
        const cx = x + w / 2;
        const cy = y + h / 2;

        doc.save();
        doc.rotate(rotation, { origin: [cx, cy] });
        doc
          .fillColor(normalizeColor(element.fill, "#ffffff"))
          .strokeColor(normalizeColor(element.stroke))
          .lineWidth(Math.max(1, clampNumber(element.strokeWidth, 1)))
          .rect(x, y, w, h)
          .fillAndStroke();
        doc.restore();
      }

      if (element.type === "circle") {
        doc
          .fillColor(normalizeColor(element.fill, "#ffffff"))
          .strokeColor(normalizeColor(element.stroke))
          .lineWidth(Math.max(1, clampNumber(element.strokeWidth, 1)))
          .circle(clampNumber(element.x), clampNumber(element.y), Math.max(1, clampNumber(element.radius, 30)))
          .fillAndStroke();
      }

      if (element.type === "line" || element.type === "dimension") {
        doc
          .strokeColor(normalizeColor(element.stroke, "#fa8c16"))
          .lineWidth(Math.max(1, clampNumber(element.strokeWidth, 1)))
          .moveTo(clampNumber(element.x1), clampNumber(element.y1))
          .lineTo(clampNumber(element.x2), clampNumber(element.y2))
          .stroke();

        if (element.type === "dimension") {
          doc
            .fillColor(normalizeColor(element.stroke, "#fa8c16"))
            .fontSize(Math.max(8, clampNumber(element.fontSize, 14)))
            .text(
              dimensionText(element),
              (clampNumber(element.x1) + clampNumber(element.x2)) / 2 - 20,
              (clampNumber(element.y1) + clampNumber(element.y2)) / 2 - 14
            );
        }
      }

      if (element.type === "text") {
        const textContent = String(element.text || "").substring(0, 1000);
        doc
          .fillColor(normalizeColor(element.fill))
          .fontSize(Math.max(8, clampNumber(element.fontSize, 20)))
          .text(textContent, clampNumber(element.x), clampNumber(element.y));
      }
    }

    doc.end();
  });
}

async function writePng(filePath, data) {
  const svg = buildSvg(data);
  const buffer = Buffer.from(svg);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new HttpError(504, "PNG 生成超时"));
    }, 30000);

    sharp(buffer)
      .png({ quality: 100, compressionLevel: 6 })
      .toFile(filePath)
      .then(() => {
        clearTimeout(timeout);
        resolve();
      })
      .catch((err) => {
        clearTimeout(timeout);
        reject(new HttpError(500, `PNG 生成失败: ${err.message}`));
      });
  });
}

export function cleanupOldFiles(basePath, maxAgeDays = MAX_FILE_AGE_DAYS) {
  if (!fs.existsSync(basePath)) {
    return { deleted: 0, errors: 0 };
  }

  const now = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  let deleted = 0;
  let errors = 0;

  const files = fs.readdirSync(basePath);

  for (const file of files) {
    const filePath = path.join(basePath, file);
    try {
      const stats = fs.statSync(filePath);
      if (now - stats.mtime.getTime() > maxAgeMs) {
        fs.unlinkSync(filePath);
        deleted += 1;
      }
    } catch {
      errors += 1;
    }
  }

  return { deleted, errors };
}

export function getExportStats() {
  return {
    ...exportMetrics,
    lastCleanup: new Date().toISOString()
  };
}

export function validateExportFormat(format) {
  const normalized = String(format || "").toUpperCase().trim();
  if (!SUPPORTED_FORMATS.includes(normalized)) {
    throw new HttpError(400, `暂不支持该导出格式，支持: ${SUPPORTED_FORMATS.join(", ")}`);
  }
  return normalized;
}

export function validateFilePath(relativePath) {
  if (!relativePath || typeof relativePath !== "string") {
    throw new HttpError(400, "文件路径无效");
  }

  const normalized = relativePath.replace(/\\/g, "/");

  if (normalized.includes("..") || normalized.includes("~")) {
    throw new HttpError(400, "文件路径包含非法字符");
  }

  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    throw new HttpError(400, "文件路径格式错误");
  }

  const ext = path.extname(normalized).toLowerCase();
  const allowedExts = [".pdf", ".svg", ".dxf", ".png"];
  if (!allowedExts.includes(ext)) {
    throw new HttpError(400, "不支持的文件类型");
  }

  return normalized;
}

export async function generateExportFile(projectId, format, designData) {
  const startTime = Date.now();
  const normalizedFormat = validateExportFormat(format);

  validateDesignData(designData);

  ensureDirSync(config.exportBasePath);

  const timePart = dayjs().format("YYYYMMDD_HHmmss_SSS");
  const baseName = `project_${projectId}_${timePart}`;

  let result;

  try {
    if (normalizedFormat === "SVG") {
      const fileName = `${baseName}.svg`;
      const absolutePath = path.join(config.exportBasePath, fileName);
      const svgContent = buildSvg(designData);
      fs.writeFileSync(absolutePath, svgContent, "utf-8");
      result = { fileName, absolutePath, relativePath: fileName };
    } else if (normalizedFormat === "DXF") {
      const fileName = `${baseName}.dxf`;
      const absolutePath = path.join(config.exportBasePath, fileName);
      const dxfContent = buildDxf(designData);
      fs.writeFileSync(absolutePath, dxfContent, "utf-8");
      result = { fileName, absolutePath, relativePath: fileName };
    } else if (normalizedFormat === "PDF") {
      const fileName = `${baseName}.pdf`;
      const absolutePath = path.join(config.exportBasePath, fileName);
      await writePdf(absolutePath, designData);
      result = { fileName, absolutePath, relativePath: fileName };
    } else {
      const fileName = `${baseName}.png`;
      const absolutePath = path.join(config.exportBasePath, fileName);
      await writePng(absolutePath, designData);
      result = { fileName, absolutePath, relativePath: fileName };
    }

    const stats = fs.statSync(result.absolutePath);
    const sizeMB = stats.size / (1024 * 1024);

    if (sizeMB > MAX_FILE_SIZE_MB) {
      fs.unlinkSync(result.absolutePath);
      throw new HttpError(400, `导出文件过大 (${sizeMB.toFixed(2)}MB)，最大支持 ${MAX_FILE_SIZE_MB}MB`);
    }

    exportMetrics.totalExports += 1;
    exportMetrics.byFormat[normalizedFormat] += 1;

    const duration = Date.now() - startTime;
    console.log(`[EXPORT] ${normalizedFormat} generated in ${duration}ms, size: ${(stats.size / 1024).toFixed(2)}KB`);

    return {
      ...result,
      size: stats.size,
      mimeType: MIME_TYPES[normalizedFormat],
      duration
    };
  } catch (error) {
    exportMetrics.errors += 1;
    console.error(`[EXPORT ERROR] ${normalizedFormat}:`, error.message);
    throw error;
  }
}

export function resolveFilePath(relativePath) {
  const validated = validateFilePath(relativePath);
  return path.join(config.exportBasePath, validated);
}

export function toDxfColorCode(color) {
  const hex = toHex24(color);
  return parseInt(hex, 16);
}

export function getMimeType(format) {
  return MIME_TYPES[format.toUpperCase()] || "application/octet-stream";
}

setInterval(() => {
  const result = cleanupOldFiles(config.exportBasePath);
  if (result.deleted > 0 || result.errors > 0) {
    console.log(`[CLEANUP] Deleted ${result.deleted} old files, ${result.errors} errors`);
  }
}, 24 * 60 * 60 * 1000);
