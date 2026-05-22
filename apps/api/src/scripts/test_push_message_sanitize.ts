import assert from "node:assert/strict";
import { sanitizeWecomMarkdownText } from "../modules/push/message_sanitizer.js";

const cases = [
  {
    input: "这是 **重点** 内容",
    expected: "这是 重点 内容",
  },
  {
    input: "*单条*摘要",
    expected: "单条摘要",
  },
  {
    input: "  无需处理  ",
    expected: "无需处理",
  },
];

for (const item of cases) {
  assert.equal(sanitizeWecomMarkdownText(item.input), item.expected);
}

process.stdout.write("push message sanitize test passed\n");
