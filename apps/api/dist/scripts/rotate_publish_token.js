"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const axios_1 = __importDefault(require("axios"));
const parseArgs = (argv) => {
    const result = {};
    for (let index = 0; index < argv.length; index += 1) {
        const current = argv[index];
        if (!current.startsWith("--")) {
            continue;
        }
        const inline = current.split("=", 2);
        if (inline.length === 2) {
            result[inline[0].slice(2)] = inline[1];
            continue;
        }
        const next = argv[index + 1];
        if (!next || next.startsWith("--")) {
            result[current.slice(2)] = "true";
            continue;
        }
        result[current.slice(2)] = next;
        index += 1;
    }
    return result;
};
const getString = (args, key, envKey) => (args[key] ?? process.env[envKey] ?? "").trim();
const getInt = (value, fallback) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.floor(parsed);
};
const getOptionalInt = (value) => {
    if (!value) {
        return undefined;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return undefined;
    }
    return Math.floor(parsed);
};
const toBasicHeader = (clientId, clientSecret) => {
    const encoded = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
    return `Basic ${encoded}`;
};
const ensureRequired = (name, value) => {
    if (!value) {
        throw new Error(`缺少必填参数 ${name}`);
    }
};
const readExistingToken = async (filePath) => {
    try {
        await (0, promises_1.access)(filePath);
    }
    catch {
        return undefined;
    }
    try {
        const content = await (0, promises_1.readFile)(filePath, "utf8");
        return JSON.parse(content);
    }
    catch {
        return undefined;
    }
};
const shouldRotate = (existing, minRemainingSeconds) => {
    if (!existing) {
        return true;
    }
    const now = Math.floor(Date.now() / 1000);
    const remaining = existing.expiresAt - now;
    return remaining <= minRemainingSeconds;
};
const writeTokenFile = async (filePath, token) => {
    const data = {
        ...token,
        updatedAt: new Date().toISOString(),
        source: "rotate_publish_token.ts",
    };
    await (0, promises_1.mkdir)(node_path_1.default.dirname(filePath), { recursive: true });
    await (0, promises_1.writeFile)(filePath, `${JSON.stringify(data, null, 2)}\n`, { encoding: "utf8" });
    await (0, promises_1.chmod)(filePath, 0o600);
};
const run = async () => {
    const args = parseArgs(process.argv.slice(2));
    const baseUrl = getString(args, "base-url", "PUBLISH_TOKEN_BASE_URL");
    const clientId = getString(args, "client-id", "PUBLISH_TOKEN_CLIENT_ID");
    const clientSecret = getString(args, "client-secret", "PUBLISH_TOKEN_CLIENT_SECRET");
    const userId = getString(args, "user-id", "PUBLISH_TOKEN_USER_ID");
    const outputFile = getString(args, "output-file", "PUBLISH_TOKEN_OUTPUT_FILE");
    const ttlSeconds = getOptionalInt(args["ttl-seconds"] ?? process.env.PUBLISH_TOKEN_TTL_SECONDS);
    const minRemainingSeconds = getInt(args["min-remaining-seconds"] ?? process.env.PUBLISH_TOKEN_MIN_REMAINING_SECONDS, 120);
    ensureRequired("base-url/PUBLISH_TOKEN_BASE_URL", baseUrl);
    ensureRequired("client-id/PUBLISH_TOKEN_CLIENT_ID", clientId);
    ensureRequired("client-secret/PUBLISH_TOKEN_CLIENT_SECRET", clientSecret);
    ensureRequired("user-id/PUBLISH_TOKEN_USER_ID", userId);
    ensureRequired("output-file/PUBLISH_TOKEN_OUTPUT_FILE", outputFile);
    const existing = await readExistingToken(outputFile);
    if (!shouldRotate(existing, minRemainingSeconds)) {
        const now = Math.floor(Date.now() / 1000);
        const remaining = (existing?.expiresAt ?? now) - now;
        process.stdout.write(`token仍有效，剩余 ${remaining} 秒，大于阈值 ${minRemainingSeconds} 秒，无需更换\n`);
        return;
    }
    const response = await axios_1.default.post(`${baseUrl.replace(/\/+$/, "")}/api/articles/publish/token`, {
        userId,
        ...(ttlSeconds ? { ttlSeconds } : {}),
    }, {
        headers: {
            Authorization: toBasicHeader(clientId, clientSecret),
            "Content-Type": "application/json",
        },
        timeout: 10000,
    });
    if (response.status !== 201) {
        throw new Error(`签发失败，status=${response.status}`);
    }
    await writeTokenFile(outputFile, response.data);
    process.stdout.write(`token已更新，kid=${response.data.kid}，expiresAt=${response.data.expiresAt}，输出=${outputFile}\n`);
};
run().catch((error) => {
    process.stderr.write(`token更换失败: ${error.message}\n`);
    process.exit(1);
});
