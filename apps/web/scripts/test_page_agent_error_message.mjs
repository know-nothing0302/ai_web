import assert from "node:assert/strict";

const appendAssistantErrorMessage = async () => {
  const module = await import("../src/page_agent/error_message.ts");
  return module.appendAssistantErrorMessage;
};

const buildPageAgentClientErrorMessage = async () => {
  const module = await import("../src/page_agent/error_message.ts");
  return module.buildPageAgentClientErrorMessage;
};

const run = async () => {
  const append = await appendAssistantErrorMessage();
  const buildError = await buildPageAgentClientErrorMessage();

  const next = append(
    [
      {
        id: "u-1",
        role: "user",
        text: "测试问题",
      },
    ],
    "当前会话请求失败：未获取到有效会话。请重试。"
  );

  assert.equal(next.length, 2);
  assert.equal(next[1]?.role, "assistant");
  assert.equal(next[1]?.text.includes("失败"), true);
  assert.equal(next[1]?.meta?.model, "system-fallback");

  const apiErrorMessage = buildError("answer", {
    response: {
      status: 401,
      data: {
        message: "未登录",
      },
    },
    isAxiosError: true,
  });
  assert.equal(apiErrorMessage, "当前问题提交失败：未登录。请重试。");
};

await run();
