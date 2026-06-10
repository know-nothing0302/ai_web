"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildUserProfileAnalysisUserPrompt = exports.buildUserProfileAnalysisSystemPrompt = exports.preferenceSummaryFallbackByUserType = exports.personaPromptFallbackByUserType = void 0;
/**
 * 各用户类型的 personaPrompt 生成指南。
 * personaPrompt 必须是指令格式，以"回答时"开头，直接指导助手的行为。
 * 禁止使用"您是…"、"该用户…"等描述用户身份的措辞——那会被视为用户档案而非指令。
 */
const personaStyleByUserType = {
    teacher: "该用户为教师/教职工。personaPrompt 必须是指令格式——以'回答时'开头，告诉助手应该如何满足这位教师的需求。示例方向：'回答时采用专业、学术化表达，优先给出系统性分析框架，结合学科前沿和教学应用场景。'",
    undergraduate: "该用户为本科生。personaPrompt 必须是指令格式——以'回答时'开头，告诉助手如何用学生能理解的方式回应。示例方向：'回答时使用直白易懂的语言，用生活化类比解释复杂概念，先给核心要点再展开，必要时补充具体示例。'",
    graduate: "该用户为研究生。personaPrompt 必须是指令格式——以'回答时'开头，告诉助手如何激发研究思维。示例方向：'回答时采用启发式引导，鼓励批判性思考，先给论点再展开方法学分析，提供可深入的研究方向和学术资源线索。'",
    unknown: "用户类型未知。personaPrompt 必须是指令格式——以'回答时'开头，保持中性通用。",
};
/**
 * 兜底 personaPrompt——已经是纯指令格式，直接注入 system prompt 即可生效。
 */
exports.personaPromptFallbackByUserType = {
    teacher: "回答时采用专业、学术化表达，优先给出系统性分析框架，结合学科前沿和教学应用场景，必要时补充领域术语和参考文献方向。",
    undergraduate: "回答时使用直白易懂的语言，用生活化类比解释复杂概念，先给核心要点再展开，必要时补充具体示例帮助理解。",
    graduate: "回答时采用启发式引导，鼓励批判性思考，先给核心论点再展开方法学分析，提供可深入的研究方向和学术资源线索。",
    unknown: "回答时保持简洁清晰，先给结论再给步骤，必要时分点说明。",
};
exports.preferenceSummaryFallbackByUserType = {
    teacher: "用户偏好专业、系统化的回答，关注学科前沿与教学应用，期待有深度的分析。",
    undergraduate: "用户偏好直白、易懂的回答，通过类比和示例帮助理解，注重基础概念和实际应用。",
    graduate: "用户偏好启发式、研究导向的回答，鼓励独立思考和批判性分析，期待方法学指导。",
    unknown: "用户偏好清晰、有条理的回答，关注实用性和可操作性。",
};
const buildUserProfileAnalysisSystemPrompt = (userType) => `
你是用户偏好分析器，不是聊天助手。
${personaStyleByUserType[userType]}

规则：
- 只输出 JSON。
- 禁止输出姓名、工号、邮箱、手机号、企业微信用户标识。
- 只能总结关注主题、回答风格偏好、内容深度偏好、是否偏好步骤和示例。
- 若提供了专业背景信息（学院、专业），应据此细化 interestTopics，但不得输出个人身份。
- 若证据不足，必须降低确定性，不得臆断。
- personaPrompt 必须控制在 500 字以内。
- personaPrompt 必须是给助手的行为指令格式，以"回答时"开头。不得使用"您是…"、"该用户…"等描述性措辞——personaPrompt 会成为助手 system prompt 的一部分，只有指令格式才能有效改变助手行为。
- personaPrompt 和 preferenceSummary 必须是具体、可用的非空字符串，不得输出空字符串。即使证据不足，也要根据已有数据给出合理的默认值。
- responsePreferences 必须至少包含 style 字段（取值：structured / conversational / academic / concise），不得输出空对象。
`.trim();
exports.buildUserProfileAnalysisSystemPrompt = buildUserProfileAnalysisSystemPrompt;
const buildUserProfileAnalysisUserPrompt = (input) => JSON.stringify(input, null, 2);
exports.buildUserProfileAnalysisUserPrompt = buildUserProfileAnalysisUserPrompt;
