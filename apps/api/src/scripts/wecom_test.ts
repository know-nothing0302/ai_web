/**
 * 企业微信消息发送测试脚本
 *
 * 用法:
 *   # 发送所有类型（文本 + 两张模板卡片）
 *   WECOM_CORP_ID=wx... WECOM_AGENT_ID=1000172 WECOM_SECRET=... \
 *     TEST_USER_IDS=100002013029,100002020047 \
 *     npx tsx src/scripts/wecom_test.ts
 *
 *   # 仅文本消息
 *   ... npx tsx src/scripts/wecom_test.ts text
 *
 *   # 仅模板卡片
 *   ... npx tsx src/scripts/wecom_test.ts card
 *
 * 必填环境变量:
 *   WECOM_CORP_ID   — 企业 ID
 *   WECOM_AGENT_ID  — 应用 AgentId
 *   WECOM_SECRET    — 应用 Secret
 *
 * 可选环境变量:
 *   TEST_USER_IDS   — 逗号分隔的测试用户
 *   DEBUG           — 设为 1 时打印完整请求/响应体
 */

// ============================================================
// 配置
// ============================================================
const CORP_ID = process.env.WECOM_CORP_ID || "";
const AGENT_ID = Number(process.env.WECOM_AGENT_ID) || 0;
const SECRET = process.env.WECOM_SECRET || "";
const BASE_URL = "https://qyapi.weixin.qq.com/cgi-bin";
const TEST_USER_IDS = (process.env.TEST_USER_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const DEBUG = process.env.DEBUG === "1";

// ============================================================
// 日志工具
// ============================================================
const timestamp = () => new Date().toISOString();

const log = {
  info: (...args: unknown[]) => console.log(`[${timestamp()}]`, ...args),
  ok: (msg: string) => console.log(`  ✅  ${msg}`),
  fail: (msg: string) => console.log(`  ❌  ${msg}`),
  warn: (msg: string) => console.log(`  ⚠️  ${msg}`),
  detail: (label: string, data: unknown) => {
    if (DEBUG) console.log(`  📋 ${label}:`, JSON.stringify(data, null, 2));
  },
  hr: () => console.log("─".repeat(60)),
};

// ============================================================
// API 调用（含日志）
// ============================================================
interface TokenResponse {
  errcode: number;
  errmsg: string;
  access_token?: string;
  expires_in?: number;
}

interface SendResult {
  errcode: number;
  errmsg: string;
  invaliduser?: string;
  invalidparty?: string;
  invalidtag?: string;
  msgid?: string;
  response_code?: string;
}

interface CallRecord {
  type: string;
  target: string;
  payload: Record<string, unknown>;
  result: SendResult;
  elapsedMs: number;
  ok: boolean;
  error?: string;
}

const records: CallRecord[] = [];

async function apiGet<T>(path: string, params: Record<string, string>): Promise<{ data: T; elapsedMs: number }> {
  const url = new URL(`${BASE_URL}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const maskedUrl = url.toString().replace(/corpsecret=[^&]+/, "corpsecret=***");
  log.info(`  GET ${maskedUrl}`);

  const t0 = performance.now();
  const res = await fetch(url.toString());
  const data = (await res.json()) as T;
  const elapsedMs = Math.round(performance.now() - t0);

  log.detail(`响应 (${res.status}, ${elapsedMs}ms)`, data);
  return { data, elapsedMs };
}

async function apiPost<T>(
  path: string,
  token: string,
  body: Record<string, unknown>,
): Promise<{ data: T; elapsedMs: number }> {
  const url = `${BASE_URL}${path}?access_token=${token.slice(0, 8)}...${token.slice(-4)}`;

  log.info(`  POST ${path}`);
  log.detail("请求体", body);

  const t0 = performance.now();
  const res = await fetch(`${BASE_URL}${path}?access_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T;
  const elapsedMs = Math.round(performance.now() - t0);

  log.info(`  ← HTTP ${res.status}, ${elapsedMs}ms`);
  log.detail("响应体", data);
  return { data, elapsedMs };
}

// ============================================================
// 获取 access_token
// ============================================================
async function getToken(): Promise<{ token: string; expiresIn: number }> {
  log.info("========== Step 1: 获取 access_token ==========");
  const { data, elapsedMs } = await apiGet<TokenResponse>("/gettoken", {
    corpid: CORP_ID,
    corpsecret: SECRET,
  });

  if (data.errcode !== 0 || !data.access_token) {
    log.fail(`获取 token 失败 [${data.errcode}] ${data.errmsg} (耗时 ${elapsedMs}ms)`);
    throw new Error(`TokenError: errcode=${data.errcode} errmsg="${data.errmsg}"`);
  }

  log.ok(`token 获取成功 (expires_in=${data.expires_in}s, 耗时 ${elapsedMs}ms)`);
  log.info(`  token: ${data.access_token.slice(0, 8)}...${data.access_token.slice(-4)}`);
  return { token: data.access_token, expiresIn: data.expires_in ?? 7200 };
}

// ============================================================
// 1. 普通文本消息
// ============================================================
async function sendTextMessage(token: string, touser: string): Promise<CallRecord> {
  const payload = {
    touser,
    msgtype: "text",
    agentid: AGENT_ID,
    text: {
      content: [
        "🧪 企业微信消息测试",
        "",
        `发送时间: ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
        `接收用户: ${touser}`,
        "消息类型: 文本消息 (text)",
        "",
        "✅ 如果你收到这条消息，说明文本消息通道正常。",
      ].join("\n"),
    },
    safe: 0,
  };

  log.info(`  → 文本消息 → ${touser}`);
  const { data, elapsedMs } = await apiPost<SendResult>("/message/send", token, payload);

  const ok = data.errcode === 0;
  const record: CallRecord = {
    type: "文本消息 (text)",
    target: touser,
    payload,
    result: data,
    elapsedMs,
    ok,
    error: ok ? undefined : `[${data.errcode}] ${data.errmsg}`,
  };

  if (ok) {
    log.ok(`发送成功 — msgid: ${data.msgid ?? "N/A"} (${elapsedMs}ms)`);
  } else {
    log.fail(`发送失败 — [${data.errcode}] ${data.errmsg}`);
    if (data.invaliduser) log.fail(`  invaliduser: ${data.invaliduser}`);
    if (data.invalidparty) log.fail(`  invalidparty: ${data.invalidparty}`);
    if (data.invalidtag) log.fail(`  invalidtag: ${data.invalidtag}`);
    log.info(`  常见 errcode: 40003=无效userid, 40014=token无效, 41006=用户未关注, 48002=应用未上线, 82001=不在应用可见范围`);
  }

  return record;
}

// ============================================================
// 2. text_notice 模板卡片
// ============================================================
async function sendTextNoticeCard(token: string, touser: string): Promise<CallRecord> {
  const sendTime = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

  const payload = {
    touser,
    msgtype: "template_card",
    agentid: AGENT_ID,
    enable_duplicate_check: 1,
    duplicate_check_interval: 60,
    template_card: {
      card_type: "text_notice",
      source: {
        desc: "AI 徐医 · 测试",
        desc_color: 3,
      },
      main_title: {
        title: "🧪 text_notice 模板卡片测试",
        desc: `接收用户: ${touser}`,
      },
      sub_title_text:
        "这是一条通过企业微信 API 发送的 text_notice 类型模板卡片消息，用于验证模板卡片通道是否正常。",
      horizontal_content_list: [
        { keyname: "发送时间", value: sendTime },
        { keyname: "消息类型", value: "text_notice 模板卡片" },
        { keyname: "详情", value: "点击查看", type: 1, url: "https://idapps.xzhmu.edu.cn" },
      ],
      card_action: {
        type: 1,
        url: "https://idapps.xzhmu.edu.cn",
      },
    },
  };

  log.info(`  → text_notice 卡片 → ${touser}`);
  const { data, elapsedMs } = await apiPost<SendResult>("/message/send", token, payload);

  const ok = data.errcode === 0;
  const record: CallRecord = {
    type: "text_notice 模板卡片",
    target: touser,
    payload,
    result: data,
    elapsedMs,
    ok,
    error: ok ? undefined : `[${data.errcode}] ${data.errmsg}`,
  };

  if (ok) {
    log.ok(`发送成功 — msgid: ${data.msgid ?? "N/A"} (${elapsedMs}ms)`);
  } else {
    log.fail(`发送失败 — [${data.errcode}] ${data.errmsg}`);
    if (data.invaliduser) log.fail(`  invaliduser: ${data.invaliduser}`);
    if (data.response_code) log.info(`  response_code: ${data.response_code}`);
  }

  return record;
}

// ============================================================
// 3. news_notice 模板卡片（图文公告）
// ============================================================
async function sendNewsNoticeCard(token: string, touser: string): Promise<CallRecord> {
  const sendTime = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

  const payload = {
    touser,
    msgtype: "template_card",
    agentid: AGENT_ID,
    enable_duplicate_check: 1,
    duplicate_check_interval: 60,
    template_card: {
      card_type: "news_notice",
      source: {
        desc: "AI 在徐医",
        desc_color: 0,
      },
      main_title: {
        title: "🧪 news_notice 图文卡片测试",
        desc: `接收用户: ${touser}`,
      },
      card_image: {
        url: "https://idapps.xzhmu.edu.cn/images/logo.png",
        aspect_ratio: 1.77,
      },
      vertical_content_list: [
        { title: "功能验证项 1", desc: "图文卡片消息通道连通性测试" },
        { title: "功能验证项 2", desc: "跳转链接与卡片布局渲染验证" },
        { title: "功能验证项 3", desc: `发送时间: ${sendTime}` },
      ],
      jump_list: [
        { type: 1, title: "点击查看详情", url: "https://idapps.xzhmu.edu.cn" },
      ],
      card_action: {
        type: 1,
        url: "https://idapps.xzhmu.edu.cn",
      },
    },
  };

  log.info(`  → news_notice 卡片 → ${touser}`);
  const { data, elapsedMs } = await apiPost<SendResult>("/message/send", token, payload);

  const ok = data.errcode === 0;
  const record: CallRecord = {
    type: "news_notice 模板卡片",
    target: touser,
    payload,
    result: data,
    elapsedMs,
    ok,
    error: ok ? undefined : `[${data.errcode}] ${data.errmsg}`,
  };

  if (ok) {
    log.ok(`发送成功 — msgid: ${data.msgid ?? "N/A"} (${elapsedMs}ms)`);
  } else {
    log.fail(`发送失败 — [${data.errcode}] ${data.errmsg}`);
    if (data.invaliduser) log.fail(`  invaliduser: ${data.invaliduser}`);
    if (data.response_code) log.info(`  response_code: ${data.response_code}`);
  }

  return record;
}

// ============================================================
// 主流程
// ============================================================
async function main() {
  const mode = process.argv[2] ?? "all";

  // ===== 校验 =====
  if (!CORP_ID || !AGENT_ID || !SECRET) {
    console.error("❌ 缺少必填环境变量:");
    if (!CORP_ID) console.error("   WECOM_CORP_ID  — 企业 ID");
    if (!AGENT_ID) console.error("   WECOM_AGENT_ID — 应用 AgentId");
    if (!SECRET) console.error("   WECOM_SECRET   — 应用 Secret");
    process.exit(1);
  }
  if (TEST_USER_IDS.length === 0) {
    console.error("❌ TEST_USER_IDS 为空");
    process.exit(1);
  }

  // ===== 头部信息 =====
  console.log("╔══════════════════════════════════════════╗");
  console.log("║     企业微信消息发送测试                  ║");
  console.log("╠══════════════════════════════════════════╣");
  console.log(`║  Corp ID : ${CORP_ID.padEnd(30)} ║`);
  console.log(`║  Agent ID: ${String(AGENT_ID).padEnd(30)} ║`);
  console.log(`║  Secret  : ${(SECRET.slice(0, 4) + "****" + SECRET.slice(-4)).padEnd(30)} ║`);
  console.log(`║  Users   : ${TEST_USER_IDS.join(", ").padEnd(30)} ║`);
  console.log(`║  Mode    : ${mode.padEnd(30)} ║`);
  console.log(`║  Debug   : ${(DEBUG ? "ON" : "OFF").padEnd(30)} ║`);
  console.log("╚══════════════════════════════════════════╝");
  console.log();

  // ===== Step 1: 获取 token =====
  let token: string;
  try {
    const result = await getToken();
    token = result.token;
  } catch (e: any) {
    log.fail(`获取 token 失败: ${e.message}`);
    log.info("排查建议:");
    log.info("  1. 检查 WECOM_CORP_ID 是否正确");
    log.info("  2. 检查 WECOM_SECRET 是否与该 AgentId 匹配");
    log.info("  3. 确认服务器 IP 在企业微信白名单中");
    process.exit(1);
  }

  // ===== Step 2: 选定测试用例 =====
  interface TestCase {
    name: string;
    fn: (token: string, touser: string) => Promise<CallRecord>;
  }

  const textTests: TestCase[] = [{ name: "文本消息", fn: sendTextMessage }];

  const cardTests: TestCase[] = [
    { name: "text_notice 卡片", fn: sendTextNoticeCard },
    { name: "news_notice 卡片", fn: sendNewsNoticeCard },
  ];

  let allTests: TestCase[];
  if (mode === "text") allTests = textTests;
  else if (mode === "card") allTests = cardTests;
  else allTests = [...textTests, ...cardTests];

  // ===== Step 3: 逐用户逐类型发送 =====
  console.log();
  log.info(`========== Step 2: 发送测试 (${allTests.length} 类型 × ${TEST_USER_IDS.length} 用户) ==========`);

  for (const userId of TEST_USER_IDS) {
    console.log();
    log.hr();
    log.info(`📤 目标用户: ${userId}`);

    for (const test of allTests) {
      try {
        const record = await test.fn(token, userId);
        records.push(record);
      } catch (e: any) {
        log.fail(`${test.name} — 网络异常: ${e.message}`);
        log.info("  排查: 检查服务器是否能访问 qyapi.weixin.qq.com");
        records.push({
          type: test.name,
          target: userId,
          payload: {},
          result: { errcode: -1, errmsg: e.message },
          elapsedMs: 0,
          ok: false,
          error: `网络异常: ${e.message}`,
        });
      }
    }
  }

  // ===== Step 4: 汇总 =====
  const okCount = records.filter((r) => r.ok).length;
  const failCount = records.filter((r) => !r.ok).length;

  console.log("\n");
  log.hr();
  console.log("╔══════════════════════════════════════════╗");
  console.log("║           测试结果汇总                    ║");
  console.log("╠══════════════════════════════════════════╣");

  for (const r of records) {
    const icon = r.ok ? "✅" : "❌";
    const line = `${icon} ${r.type} → ${r.target}`;
    console.log(`║  ${line.padEnd(38)} ║`);
    if (!r.ok) {
      console.log(`║     ↳ ${(r.error ?? "未知错误").slice(0, 34).padEnd(34)} ║`);
    }
  }

  console.log("╠══════════════════════════════════════════╣");
  const summary = `成功: ${okCount}  失败: ${failCount}  总计: ${records.length}`;
  console.log(`║  ${summary.padEnd(38)} ║`);

  // 统计各类型耗时
  const avgMs = records.length > 0
    ? Math.round(records.reduce((s, r) => s + r.elapsedMs, 0) / records.length)
    : 0;
  console.log(`║  平均耗时: ${avgMs}ms`.padEnd(43) + "║");
  console.log("╚══════════════════════════════════════════╝");

  // ===== 失败时的排查提示 =====
  if (failCount > 0) {
    console.log("\n🔍 失败排查指南:");
    console.log("  errcode=40003  → 无效的 userid，检查用户是否在通讯录中");
    console.log("  errcode=40014  → access_token 无效或过期");
    console.log("  errcode=41006  → 用户未关注该应用（需用户在企微中打开过应用）");
    console.log("  errcode=48002  → 应用未上线 / 仅对可见范围内的用户有效");
    console.log("  errcode=60011  → 无权限操作该应用（AgentId/Secret 与 CorpId 不匹配）");
    console.log("  errcode=82001  → 用户不在应用的可见范围内");
    console.log("  errcode=82002  → 用户不在应用的可见范围内（部门过滤）");
    console.log("  errcode=86201  → 模板卡片参数错误");
    console.log("\n  💡 开启 DEBUG=1 可打印完整请求/响应体");
  }

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
