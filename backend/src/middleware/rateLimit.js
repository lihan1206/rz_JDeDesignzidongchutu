const DEFAULT_WINDOW_MS = 60 * 1000;
const DEFAULT_MAX_REQUESTS = 100;

const rateLimitStore = new Map();

function cleanupExpiredEntries() {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

setInterval(cleanupExpiredEntries, 60 * 1000);

function getIdentifier(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.connection.remoteAddress || "unknown";
}

export function rateLimit(options = {}) {
  const {
    windowMs = DEFAULT_WINDOW_MS,
    max = DEFAULT_MAX_REQUESTS,
    message = "请求过于频繁，请稍后再试",
    keyGenerator = getIdentifier,
    skip = () => false
  } = options;

  return function rateLimitMiddleware(req, res, next) {
    if (skip(req)) {
      return next();
    }

    const key = keyGenerator(req);
    const now = Date.now();

    let entry = rateLimitStore.get(key);

    if (!entry || now > entry.resetTime) {
      entry = {
        count: 0,
        resetTime: now + windowMs
      };
      rateLimitStore.set(key, entry);
    }

    entry.count += 1;

    const remaining = Math.max(0, max - entry.count);
    const resetTimeSeconds = Math.ceil((entry.resetTime - now) / 1000);

    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", resetTimeSeconds);

    if (entry.count > max) {
      res.setHeader("Retry-After", resetTimeSeconds);
      return res.status(429).json({
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message,
          retryAfter: resetTimeSeconds
        }
      });
    }

    next();
  };
}

export function strictRateLimit(options = {}) {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: "操作过于频繁，请稍后再试",
    ...options
  });
}

export function authRateLimit(options = {}) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: "登录尝试次数过多，请 15 分钟后再试",
    keyGenerator: (req) => `auth_${getIdentifier(req)}_${req.body?.username || ""}`,
    ...options
  });
}

export function exportRateLimit(options = {}) {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: "导出请求过于频繁，请稍后再试",
    keyGenerator: (req) => `export_${req.user?.id || getIdentifier(req)}`,
    ...options
  });
}
