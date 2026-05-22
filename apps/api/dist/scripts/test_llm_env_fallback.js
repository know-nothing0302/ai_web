"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_child_process_1 = require("node:child_process");
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const cwd = node_path_1.default.resolve(__dirname, "..", "..");
const evalCode = `
  import { env } from "./src/config/env.ts";
  process.stdout.write(JSON.stringify({
    deepseekApiBaseUrl: env.deepseekApiBaseUrl,
    deepseekApiKey: env.deepseekApiKey,
    deepseekModel: env.deepseekModel
  }));
`;
const readEnv = (overrides) => {
    const tempDir = node_fs_1.default.mkdtempSync(node_path_1.default.join(node_os_1.default.tmpdir(), "llm-env-"));
    const tempFile = node_path_1.default.join(tempDir, "read_env.ts");
    node_fs_1.default.writeFileSync(tempFile, evalCode, "utf-8");
    const result = (0, node_child_process_1.spawnSync)("npm", ["exec", "tsx", tempFile], {
        cwd,
        env: {
            ...process.env,
            DEEPSEEK_API_BASE_URL: undefined,
            DEEPSEEK_API_KEY: undefined,
            DEEPSEEK_MODEL: undefined,
            AI_XY_API_URL: undefined,
            AI_XY_API_KEY: undefined,
            AI_XY_DEFAULT_GPT_TYPE: undefined,
            ...overrides,
        },
        encoding: "utf-8",
    });
    node_fs_1.default.rmSync(tempDir, { recursive: true, force: true });
    if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout || "读取 env 失败");
    }
    return JSON.parse(result.stdout);
};
const run = () => {
    let env = readEnv({
        AI_XY_API_URL: "http://legacy.example.com",
        AI_XY_API_KEY: "legacy-key",
        AI_XY_DEFAULT_GPT_TYPE: "legacy-model",
    });
    strict_1.default.equal(env.deepseekApiBaseUrl, "http://legacy.example.com");
    strict_1.default.equal(env.deepseekApiKey, "legacy-key");
    strict_1.default.equal(env.deepseekModel, "legacy-model");
    env = readEnv({
        DEEPSEEK_API_BASE_URL: "https://api.deepseek.com",
        DEEPSEEK_API_KEY: "deepseek-key",
        DEEPSEEK_MODEL: "deepseek-chat",
        AI_XY_API_URL: "http://legacy.example.com",
        AI_XY_API_KEY: "legacy-key",
        AI_XY_DEFAULT_GPT_TYPE: "legacy-model",
    });
    strict_1.default.equal(env.deepseekApiBaseUrl, "https://api.deepseek.com");
    strict_1.default.equal(env.deepseekApiKey, "deepseek-key");
    strict_1.default.equal(env.deepseekModel, "deepseek-chat");
    process.stdout.write("llm env fallback test passed\n");
};
try {
    run();
}
catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
}
