const CONTENT_SECURITY_POLICY = {
  "default-src": ["'self'"],
  "script-src": ["'self'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:", "blob:"],
  "font-src": ["'self'"],
  "connect-src": ["'self'"],
  "frame-ancestors": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"]
};

const XSS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /data:\s*text\/html/gi,
  /vbscript:/gi,
  /expression\s*\(/gi
];

const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)\b)/gi,
  /(--|\#|\/\*|\*\/)/g,
  /(\bOR\b|\bAND\b)\s*['"]?\d+['"]?\s*=\s*['"]?\d+/gi,
  /UNION\s+SELECT/gi,
  /'\s*(OR|AND)\s*'/gi
];

export function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");

  const cspDirectives = Object.entries(CONTENT_SECURITY_POLICY)
    .map(([key, values]) => `${key} ${values.join(" ")}`)
    .join("; ");
  res.setHeader("Content-Security-Policy", cspDirectives);

  res.removeHeader("X-Powered-By");
  res.removeHeader("Server");

  next();
}

export function sanitizeString(value) {
  if (typeof value !== "string") {
    return value;
  }

  let sanitized = value;

  for (const pattern of XSS_PATTERNS) {
    sanitized = sanitized.replace(pattern, "");
  }

  return sanitized.trim();
}

export function sanitizeObject(obj, depth = 0) {
  if (depth > 10) {
    return obj;
  }

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "string") {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, depth + 1));
  }

  if (typeof obj === "object" && obj.constructor === Object) {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      const sanitizedKey = sanitizeString(key);
      sanitized[sanitizedKey] = sanitizeObject(value, depth + 1);
    }
    return sanitized;
  }

  return obj;
}

export function sanitizeInput(req, res, next) {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeObject(req.body);
  }

  if (req.query && typeof req.query === "object") {
    req.query = sanitizeObject(req.query);
  }

  if (req.params && typeof req.params === "object") {
    req.params = sanitizeObject(req.params);
  }

  next();
}

export function detectSuspiciousInput(value) {
  if (typeof value !== "string") {
    return { isSuspicious: false, type: null };
  }

  for (const pattern of XSS_PATTERNS) {
    if (pattern.test(value)) {
      return { isSuspicious: true, type: "XSS" };
    }
  }

  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.test(value)) {
      return { isSuspicious: true, type: "SQL_INJECTION" };
    }
  }

  return { isSuspicious: false, type: null };
}

export function validateFilePath(relativePath, basePath) {
  if (!relativePath || typeof relativePath !== "string") {
    return { valid: false, reason: "路径无效" };
  }

  const normalized = relativePath.replace(/\\/g, "/");

  if (normalized.includes("..") || normalized.includes("~")) {
    return { valid: false, reason: "路径包含非法字符" };
  }

  if (normalized.startsWith("/") || normalized.startsWith("\\")) {
    return { valid: false, reason: "路径不能以斜杠开头" };
  }

  const allowedExtensions = [".pdf", ".svg", ".dxf", ".png"];
  const ext = normalized.toLowerCase().substring(normalized.lastIndexOf("."));
  if (!allowedExtensions.includes(ext)) {
    return { valid: false, reason: "不支持的文件类型" };
  }

  return { valid: true, normalized };
}

export function requestLogger(req, res, next) {
  const start = Date.now();
  const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  res.on("finish", () => {
    const duration = Date.now() - start;
    const logData = {
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.connection.remoteAddress
    };

    if (res.statusCode >= 400) {
      console.error("[REQUEST ERROR]", logData);
    }
  });

  next();
}

export function corsOptions(origin, callback) {
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",")
    : ["http://localhost:3217", "http://127.0.0.1:3217"];

  if (!origin || allowedOrigins.includes(origin)) {
    callback(null, true);
  } else {
    callback(new Error("不允许的来源"));
  }
}
