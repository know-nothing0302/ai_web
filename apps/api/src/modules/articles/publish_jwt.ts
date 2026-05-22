import jwt, { JwtPayload } from "jsonwebtoken";
import { env } from "../../config/env";

type PublishJwtValidationResult =
  | { ok: true; kid: string; payload: JwtPayload }
  | { ok: false; status: 401 | 500; errorCode: string; message: string };

type PublishJwtIssueResult =
  | {
      ok: true;
      kid: string;
      algorithm: "RS256";
      tokenType: "Bearer";
      accessToken: string;
      expiresIn: number;
      issuedAt: number;
      expiresAt: number;
    }
  | { ok: false; status: 400 | 500; message: string };

type PublishJwtClientAuthResult =
  | { ok: true; clientId: string }
  | { ok: false; status: 401 | 500; errorCode: string; message: string };

type PublishJwtKeyRing = {
  activeKid: string;
  keys: Record<string, string>;
};

const parseBearerToken = (headerValue?: string): string | undefined => {
  if (!headerValue) {
    return undefined;
  }
  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
};

const parseBasicAuthorization = (
  headerValue?: string
): { clientId: string; clientSecret: string } | undefined => {
  if (!headerValue) {
    return undefined;
  }
  const match = headerValue.match(/^Basic\s+(.+)$/i);
  if (!match?.[1]) {
    return undefined;
  }
  try {
    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex < 1) {
      return undefined;
    }
    const clientId = decoded.slice(0, separatorIndex).trim();
    const clientSecret = decoded.slice(separatorIndex + 1).trim();
    if (!clientId || !clientSecret) {
      return undefined;
    }
    return { clientId, clientSecret };
  } catch {
    return undefined;
  }
};

const parseKidValueMap = (rawValue: string): Record<string, string> => {
  const pairs = rawValue
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const result: Record<string, string> = {};
  pairs.forEach((pair) => {
    const separatorIndex = pair.indexOf(":");
    if (separatorIndex < 1) {
      return;
    }
    const kid = pair.slice(0, separatorIndex).trim();
    const value = pair.slice(separatorIndex + 1).trim();
    if (!kid || !value) {
      return;
    }
    result[kid] = value;
  });
  return result;
};

const decodeKeyMaterial = (rawValue: string): string | undefined => {
  const normalized = rawValue.trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.startsWith("base64:")) {
    try {
      return Buffer.from(normalized.slice("base64:".length), "base64").toString("utf8");
    } catch {
      return undefined;
    }
  }
  return normalized.replace(/\\n/g, "\n");
};

const parseKeyRing = (rawValue: string): PublishJwtKeyRing | undefined => {
  const parsed = parseKidValueMap(rawValue);
  const keys: Record<string, string> = {};
  Object.entries(parsed).forEach(([kid, encodedKey]) => {
    const key = decodeKeyMaterial(encodedKey);
    if (key) {
      keys[kid] = key;
    }
  });
  if (Object.keys(keys).length === 0) {
    return undefined;
  }
  const activeKid = env.articlePublishJwtActiveKid.trim();
  if (!activeKid || !keys[activeKid]) {
    return undefined;
  }
  return { activeKid, keys };
};

const parseTokenClients = (): Record<string, string> =>
  parseKidValueMap(env.articlePublishTokenClients);

const verifyWithPublicKey = (
  token: string,
  publicKey: string,
  expectedSub: string
): JwtPayload | undefined => {
  try {
    const decoded = jwt.verify(token, publicKey, {
      algorithms: ["RS256"],
      issuer: env.articlePublishJwtIssuer,
      audience: env.articlePublishJwtAudience,
      subject: expectedSub,
    });
    if (typeof decoded === "string") {
      return undefined;
    }
    if (typeof decoded.iat !== "number" || typeof decoded.exp !== "number") {
      return undefined;
    }
    return decoded;
  } catch {
    return undefined;
  }
};

export const validatePublishTokenClient = (
  authorizationHeader: string | undefined
): PublishJwtClientAuthResult => {
  const clients = parseTokenClients();
  if (Object.keys(clients).length === 0) {
    return {
      ok: false,
      status: 500,
      errorCode: "server_misconfigured",
      message: "服务端未配置签发客户端凭据",
    };
  }
  const credentials = parseBasicAuthorization(authorizationHeader);
  if (!credentials) {
    return {
      ok: false,
      status: 401,
      errorCode: "invalid_client",
      message: "缺少或无效的 Basic 客户端凭据",
    };
  }
  const expectedSecret = clients[credentials.clientId];
  if (!expectedSecret || expectedSecret !== credentials.clientSecret) {
    return {
      ok: false,
      status: 401,
      errorCode: "invalid_client",
      message: "客户端凭据校验失败",
    };
  }
  return { ok: true, clientId: credentials.clientId };
};

export const issuePublishJwt = (
  userId: string,
  ttlSeconds?: number
): PublishJwtIssueResult => {
  const privateKeyRing = parseKeyRing(env.articlePublishJwtPrivateKeys);
  if (!privateKeyRing) {
    return { ok: false, status: 500, message: "服务端未配置可用私钥或 active kid 不匹配" };
  }
  const requestedTtl = ttlSeconds ?? env.articlePublishJwtTtlSeconds;
  if (requestedTtl <= 0) {
    return { ok: false, status: 400, message: "ttlSeconds 必须大于 0" };
  }
  if (requestedTtl > env.articlePublishJwtMaxTtlSeconds) {
    return {
      ok: false,
      status: 400,
      message: `ttlSeconds 超过上限 ${env.articlePublishJwtMaxTtlSeconds}`,
    };
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + requestedTtl;
  const accessToken = jwt.sign({}, privateKeyRing.keys[privateKeyRing.activeKid], {
    algorithm: "RS256",
    keyid: privateKeyRing.activeKid,
    issuer: env.articlePublishJwtIssuer,
    audience: env.articlePublishJwtAudience,
    subject: userId,
    expiresIn: requestedTtl,
  });
  return {
    ok: true,
    kid: privateKeyRing.activeKid,
    algorithm: "RS256",
    tokenType: "Bearer",
    accessToken,
    expiresIn: requestedTtl,
    issuedAt,
    expiresAt,
  };
};

export const validatePublishJwt = (
  authorizationHeader: string | undefined,
  expectedSub: string
): PublishJwtValidationResult => {
  const keyRing = parseKeyRing(env.articlePublishJwtPublicKeys);
  if (!keyRing) {
    return {
      ok: false,
      status: 500,
      errorCode: "server_misconfigured",
      message: "服务端未配置可用公钥或 active kid 不匹配",
    };
  }
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return {
      ok: false,
      status: 401,
      errorCode: "invalid_token",
      message: "缺少 Bearer JWT",
    };
  }
  const decodedHeader = jwt.decode(token, { complete: true });
  const kid = typeof decodedHeader === "object" ? decodedHeader?.header?.kid : undefined;
  if (typeof kid === "string" && keyRing.keys[kid]) {
    const payload = verifyWithPublicKey(token, keyRing.keys[kid], expectedSub);
    if (payload) {
      return { ok: true, kid, payload };
    }
    return {
      ok: false,
      status: 401,
      errorCode: "invalid_token",
      message: "JWT 校验失败",
    };
  }
  const keyIds = Object.keys(keyRing.keys);
  for (const keyId of keyIds) {
    const payload = verifyWithPublicKey(token, keyRing.keys[keyId], expectedSub);
    if (payload) {
      return { ok: true, kid: keyId, payload };
    }
  }
  return {
    ok: false,
    status: 401,
    errorCode: "invalid_token",
    message: "JWT 校验失败",
  };
};

export const getPublishJwtSigningSpec = () => {
  const publicKeyRing = parseKeyRing(env.articlePublishJwtPublicKeys);
  const privateKeyRing = parseKeyRing(env.articlePublishJwtPrivateKeys);
  const tokenClients = parseTokenClients();
  return {
    algorithm: "RS256",
    issuer: env.articlePublishJwtIssuer,
    audience: env.articlePublishJwtAudience,
    ttlSeconds: env.articlePublishJwtTtlSeconds,
    maxTtlSeconds: env.articlePublishJwtMaxTtlSeconds,
    activeKid:
      privateKeyRing?.activeKid ??
      publicKeyRing?.activeKid ??
      env.articlePublishJwtActiveKid,
    publicKeyCount: publicKeyRing ? Object.keys(publicKeyRing.keys).length : 0,
    privateKeyCount: privateKeyRing ? Object.keys(privateKeyRing.keys).length : 0,
    tokenClientCount: Object.keys(tokenClients).length,
    tokenEndpoint: "/api/articles/publish/token",
  };
};
