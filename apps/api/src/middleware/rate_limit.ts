import { Request, Response, NextFunction } from "express";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const DEFAULT_MAX_REQUESTS = 20;
const DEFAULT_WINDOW_MS = 60_000;
const CLEANUP_INTERVAL_MS = 300_000; // 每 5 分钟清理过期条目

const store = new Map<string, RateLimitEntry>();

// 定期清理过期条目，防止内存泄漏
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS);

// 允许 timer 不阻塞进程退出
if (cleanupTimer.unref) {
  cleanupTimer.unref();
}

/**
 * 创建基于用户 ID 的速率限制中间件
 *
 * @param maxRequests 窗口内最大请求数，默认 20
 * @param windowMs   滑动窗口时长（毫秒），默认 60000（1分钟）
 */
export const createRateLimiter = (
  maxRequests: number = DEFAULT_MAX_REQUESTS,
  windowMs: number = DEFAULT_WINDOW_MS
) => {
  return (request: Request, response: Response, next: NextFunction): void => {
    const userId = (request.session as any)?.user?.id ?? "anonymous";
    const now = Date.now();
    const record = store.get(userId);

    if (!record || now > record.resetAt) {
      store.set(userId, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (record.count >= maxRequests) {
      response.status(429).json({
        message: "请求过于频繁，请稍后再试",
        retryAfter: Math.ceil((record.resetAt - now) / 1000),
      });
      return;
    }

    record.count += 1;
    next();
  };
};

/** Page Agent Q&A 专用限流：20 次/分钟/用户 */
export const pageAgentQaRateLimiter = createRateLimiter(20, 60_000);
