import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const cwd = path.resolve(__dirname, "..", "..");
const evalCode = `
  import { env } from "./src/config/env.ts";
  process.stdout.write(JSON.stringify({
    deepseekApiBaseUrl: env.deepseekApiBaseUrl,
    deepseekApiKey: env.deepseekApiKey,
    deepseekModel: env.deepseekModel
  }));
`;

const readEnv = (overrides: Record<string, string | undefined>) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-env-"));
  const tempFile = path.join(tempDir, "read_env.ts");
  fs.writeFileSync(tempFile, evalCode, "utf-8");
  const result = spawnSync(
    "npm",
    ["exec", "tsx", tempFile],
    {
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
    }
  );
  fs.rmSync(tempDir, { recursive: true, force: true });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "读取 env 失败");
  }
  return JSON.parse(result.stdout) as {
    deepseekApiBaseUrl: string;
    deepseekApiKey: string;
    deepseekModel: string;
  };
};

const run = (): void => {
  let env = readEnv({
    AI_XY_API_URL: "http://legacy.example.com",
    AI_XY_API_KEY: "legacy-key",
    AI_XY_DEFAULT_GPT_TYPE: "legacy-model",
  });
  assert.equal(env.deepseekApiBaseUrl, "http://legacy.example.com");
  assert.equal(env.deepseekApiKey, "legacy-key");
  assert.equal(env.deepseekModel, "legacy-model");

  env = readEnv({
    DEEPSEEK_API_BASE_URL: "https://api.deepseek.com",
    DEEPSEEK_API_KEY: "deepseek-key",
    DEEPSEEK_MODEL: "deepseek-chat",
    AI_XY_API_URL: "http://legacy.example.com",
    AI_XY_API_KEY: "legacy-key",
    AI_XY_DEFAULT_GPT_TYPE: "legacy-model",
  });
  assert.equal(env.deepseekApiBaseUrl, "https://api.deepseek.com");
  assert.equal(env.deepseekApiKey, "deepseek-key");
  assert.equal(env.deepseekModel, "deepseek-chat");

  process.stdout.write("llm env fallback test passed\n");
};

try {
  run();
} catch (error) {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exit(1);
}
