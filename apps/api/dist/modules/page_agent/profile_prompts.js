"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildUserProfileAnalysisUserPrompt = exports.buildUserProfileAnalysisSystemPrompt = void 0;
const buildUserProfileAnalysisSystemPrompt = () => `
你是用户偏好分析器，不是聊天助手。
规则：
- 只输出 JSON。
- 禁止输出姓名、工号、邮箱、手机号、企业微信用户标识。
- 只能总结关注主题、回答风格偏好、内容深度偏好、是否偏好步骤和示例。
- 若证据不足，必须降低确定性，不得臆断。
- personaPrompt 必须控制在 500 字以内。
`.trim();
exports.buildUserProfileAnalysisSystemPrompt = buildUserProfileAnalysisSystemPrompt;
const buildUserProfileAnalysisUserPrompt = (input) => JSON.stringify(input, null, 2);
exports.buildUserProfileAnalysisUserPrompt = buildUserProfileAnalysisUserPrompt;
