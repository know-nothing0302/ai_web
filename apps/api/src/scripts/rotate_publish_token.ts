import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import axios from "axios";

type ArgsMap = Record<string, string>;

type TokenResponse = {
  tokenType: string;
  accessToken: string;
  expiresIn: number;
  issuedAt: number;
  expiresAt: number;
  issuer: string;
  audience: string;
  subject: string;
  kid: string;
  algorithm: string;
  issueResult?: {
    acceptedUserId?: string;
    acceptedClientId?: string;
  };
};

type StoredToken = TokenResponse & {
  updatedAt: string;
  source: string;
};

const parseArgs = (argv: string[]): ArgsMap => {
  const result: ArgsMap = {};
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

const getString = (args: ArgsMap, key: string, envKey: string): string =>
  (args[key] ?? process.env[envKey] ?? "").trim();

const getInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.floor(parsed);
};

const getOptionalInt = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.floor(parsed);
};

const toBasicHeader = (clientId: string, clientSecret: string): string => {
  const encoded = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
  return `Basic ${encoded}`;
};

const ensureRequired = (name: string, value: string): void => {
  if (!value) {
    throw new Error(`缺少必填参数 ${name}`);
  }
};

const readExistingToken = async (filePath: string): Promise<StoredToken | undefined> => {
  try {
    await access(filePath);
  } catch {
    return undefined;
  }
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content) as StoredToken;
  } catch {
    return undefined;
  }
};

const shouldRotate = (existing: StoredToken | undefined, minRemainingSeconds: number): boolean => {
  if (!existing) {
    return true;
  }
  const now = Math.floor(Date.now() / 1000);
  const remaining = existing.expiresAt - now;
  return remaining <= minRemainingSeconds;
};

const writeTokenFile = async (filePath: string, token: TokenResponse): Promise<void> => {
  const data: StoredToken = {
    ...token,
    updatedAt: new Date().toISOString(),
    source: "rotate_publish_token.ts",
  };
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, { encoding: "utf8" });
  await chmod(filePath, 0o600);
};

const run = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = getString(args, "base-url", "PUBLISH_TOKEN_BASE_URL");
  const clientId = getString(args, "client-id", "PUBLISH_TOKEN_CLIENT_ID");
  const clientSecret = getString(args, "client-secret", "PUBLISH_TOKEN_CLIENT_SECRET");
  const userId = getString(args, "user-id", "PUBLISH_TOKEN_USER_ID");
  const outputFile = getString(args, "output-file", "PUBLISH_TOKEN_OUTPUT_FILE");
  const ttlSeconds = getOptionalInt(args["ttl-seconds"] ?? process.env.PUBLISH_TOKEN_TTL_SECONDS);
  const minRemainingSeconds = getInt(
    args["min-remaining-seconds"] ?? process.env.PUBLISH_TOKEN_MIN_REMAINING_SECONDS,
    120
  );
  ensureRequired("base-url/PUBLISH_TOKEN_BASE_URL", baseUrl);
  ensureRequired("client-id/PUBLISH_TOKEN_CLIENT_ID", clientId);
  ensureRequired("client-secret/PUBLISH_TOKEN_CLIENT_SECRET", clientSecret);
  ensureRequired("user-id/PUBLISH_TOKEN_USER_ID", userId);
  ensureRequired("output-file/PUBLISH_TOKEN_OUTPUT_FILE", outputFile);
  const existing = await readExistingToken(outputFile);
  if (!shouldRotate(existing, minRemainingSeconds)) {
    const now = Math.floor(Date.now() / 1000);
    const remaining = (existing?.expiresAt ?? now) - now;
    process.stdout.write(
      `token仍有效，剩余 ${remaining} 秒，大于阈值 ${minRemainingSeconds} 秒，无需更换\n`
    );
    return;
  }
  const response = await axios.post<TokenResponse>(
    `${baseUrl.replace(/\/+$/, "")}/api/articles/publish/token`,
    {
      userId,
      ...(ttlSeconds ? { ttlSeconds } : {}),
    },
    {
      headers: {
        Authorization: toBasicHeader(clientId, clientSecret),
        "Content-Type": "application/json",
      },
      timeout: 10000,
    }
  );
  if (response.status !== 201) {
    throw new Error(`签发失败，status=${response.status}`);
  }
  await writeTokenFile(outputFile, response.data);
  process.stdout.write(
    `token已更新，kid=${response.data.kid}，expiresAt=${response.data.expiresAt}，输出=${outputFile}\n`
  );
};

run().catch((error: Error) => {
  process.stderr.write(`token更换失败: ${error.message}\n`);
  process.exit(1);
});
