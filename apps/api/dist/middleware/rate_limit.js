"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pageAgentQaRateLimiter = exports.createRateLimiter = void 0;
const env_1 = require("../config/env");
const DEFAULT_MAX_REQUESTS = 20;
const DEFAULT_WINDOW_MS = 60_000;
const CLEANUP_INTERVAL_MS = 300_000; // 每 5 分钟清理过期条目
const store = new Map();
// 清理上一次模块加载遗留的定时器（tsx watch 热重载场景）
const PREV_TIMER_KEY = Symbol.for("rate_limit_cleanup_timer");
const prevTimer = globalThis[PREV_TIMER_KEY];
if (prevTimer)
    clearInterval(prevTimer);
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
// 存储到 globalThis 以便下次热重载时清理
globalThis[PREV_TIMER_KEY] = cleanupTimer;
/**
 * 创建基于用户 ID 的速率限制中间件
 *
 * @param maxRequests 窗口内最大请求数，默认 20
 * @param windowMs   滑动窗口时长（毫秒），默认 60000（1分钟）
 */
const createRateLimiter = (maxRequests = DEFAULT_MAX_REQUESTS, windowMs = DEFAULT_WINDOW_MS) => {
    return (request, response, next) => {
        const userId = request.session?.user?.id
            ?? (env_1.env.devAuthBypass ? "dev-mock-id" : "anonymous");
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
exports.createRateLimiter = createRateLimiter;
/** Page Agent Q&A 专用限流：20 次/分钟/用户 */
exports.pageAgentQaRateLimiter = (0, exports.createRateLimiter)(20, 60_000);
