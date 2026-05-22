"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const message_sanitizer_js_1 = require("../modules/push/message_sanitizer.js");
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
    strict_1.default.equal((0, message_sanitizer_js_1.sanitizeWecomMarkdownText)(item.input), item.expected);
}
process.stdout.write("push message sanitize test passed\n");
