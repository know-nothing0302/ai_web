import { createHmac } from "node:crypto";
import { env } from "../../config/env";

/**
 * 将真实学工号伪匿名化为 DeepSeek user_id。
 *
 * HMAC-SHA256(userId, secret) → hex digest (64 chars, [a-f0-9])。
 * - 确定性：同一 userId 永远得到相同 hash，保证 KVCache/调度隔离持续生效
 * - 不可逆：不知道 secret 无法从 hash 反推原始学工号
 * - 格式兼容：hex 输出是 [a-zA-Z0-9\-_]+ 的子集，符合 DeepSeek user_id 规范
 *
 * @see https://api-docs.deepseek.com/zh-cn/quick_start/rate_limit
 */
export const hashUserIdForDeepSeek = (userId: string): string =>
  createHmac("sha256", env.deepseekUserIdSecret)
    .update(userId)
    .digest("hex");
