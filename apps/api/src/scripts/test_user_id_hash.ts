import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { env } from "../config/env.js";
import { hashUserIdForDeepSeek } from "../modules/page_agent/user_id_hash.js";

const run = (): void => {
  // ── 1: 确定性 — 同一输入多次调用返回相同 hash ──
  const hash1 = hashUserIdForDeepSeek("100002013029");
  const hash2 = hashUserIdForDeepSeek("100002013029");
  assert.equal(hash1, hash2, "同一 userId 的两次 hash 应相等");

  // ── 2: 格式 — 输出必须匹配 [a-zA-Z0-9\-_]+（hex 满足此正则）──
  const formatRe = /^[a-zA-Z0-9\-_]+$/;
  assert.ok(formatRe.test(hash1), `hash "${hash1}" 应匹配 ${formatRe}`);

  // ── 3: 长度 — hex(SHA256) = 64 字符，远小于 512 限制
  assert.equal(hash1.length, 64, `SHA256 hex 长度应为 64，实际 ${hash1.length}`);

  // ── 4: 不同用户产生不同 hash ──
  const hash3 = hashUserIdForDeepSeek("200001001001");
  assert.notEqual(hash1, hash3, "不同 userId 的 hash 应不同");

  // ── 5: 不可逆 — HMAC 是单向函数，此处验证 secret 不同则 hash 不同
  const altHmac = createHmac("sha256", "wrong-secret")
    .update("100002013029")
    .digest("hex");
  assert.notEqual(hash1, altHmac, "不同 secret 产生不同 hash（不可逆性）");

  // ── 6: dev-mock-id 也能正常 hash ──
  const mockHash = hashUserIdForDeepSeek("dev-mock-id");
  assert.ok(formatRe.test(mockHash), `dev-mock-id hash 应匹配格式`);
  assert.equal(mockHash.length, 64, `dev-mock-id hash 长度应为 64`);

  console.log("[AIWEB] test_user_id_hash PASS");
};

void run();
