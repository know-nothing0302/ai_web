"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPageAgentMessages = exports.buildPageAgentUserPrompt = exports.buildPageAgentSystemPrompt = void 0;
const sanitize_1 = require("./sanitize");
const buildArticleDetailPromptContext = (input) => ({
    title: typeof input.context.title === "string"
        ? (0, sanitize_1.sanitizeForModel)(input.context.title) : "",
    summary: typeof input.context.summary === "string"
        ? (0, sanitize_1.sanitizeForModel)(input.context.summary) : "",
    sourceContent: typeof input.context.sourceContent === "string"
        ? (0, sanitize_1.sanitizeForModel)(input.context.sourceContent) : "",
    contentPreview: typeof input.context.contentPreview === "string"
        ? (0, sanitize_1.sanitizeForModel)(input.context.contentPreview) : "",
    author: typeof input.context.author === "string"
        ? (0, sanitize_1.sanitizeForModel)(input.context.author) : "",
    publishedAt: typeof input.context.publishedAt === "string" ? input.context.publishedAt : "",
    channelCode: typeof input.context.channelCode === "string" ? input.context.channelCode : "",
    channelName: typeof input.context.channelName === "string" ? input.context.channelName : "",
    originalUrl: typeof input.context.originalUrl === "string" ? input.context.originalUrl : "",
});
const buildPageAgentSystemPrompt = (input) => {
    const verbosity = input?.verbosity ?? "concise";
    const verbosityDirective = verbosity === "concise"
        ? `- **精简模式**：回答控制在 200 字以内，用要点列表，只给最核心结论。`
        : `- **详细模式**：深度展开。回答必须包含：背景分析、核心论点、支撑证据、相关案例、结论。不得少于 300 字。禁止在回答末尾说"需要更具体的问题"之类推脱话术，应基于页面已有信息尽力给出完整分析。`;
    const citationStyle = input?.citationStyle ?? "none";
    // NOTE: 引文格式依赖 LLM 从文章上下文中提取元数据（作者、刊名、卷期等）。
    // 当文章元数据不完整时，模型可能编造引用信息。prompt 内包含"注明信息不全"
    // 的指令作为缓解，但无法完全消除幻觉风险。若幻觉率过高，可通过前端关闭此功能。
    const citationDirective = citationStyle === "gbt7714"
        ? `- **引文格式**：引用文章时需提供 GB/T 7714 格式的参考文献条目。格式：[序号] 主要责任者. 文献题名[J]. 刊名, 出版年份, 卷号(期号): 起止页码. 若信息不完整，请根据已有信息尽力格式化，并注明"信息不全"。`
        : citationStyle === "apa"
            ? `- **引文格式**：引用文章时需提供 APA 格式的参考文献条目。格式：Author, A. A. (Year). Title of article. Title of Periodical, Volume(Issue), pages. 若信息不完整，请根据已有信息尽力格式化，并注明"信息不全"。`
            : "";
    return `
你是 AI在徐医 站内页面问答助手。
规则：
- 优先根据当前页面信息回答。
- 若当前页面是文章详情页且提供 sourceContent，应优先依据 sourceContent 回答细节问题。
- summary 仅作概览，不得只复述 summary 作为完整回答。
- 若 sourceContent 为空，再退回 contentPreview 或 summary。
- 当前页面不足时，才可参考站内检索结果。
- 不得编造文章标题、站内链接、原文链接、页面状态、用户配置。
- 若无法确认，请明确说当前页面和站内结果无法确认。
- 回答适合教师、学生和管理人员理解。
${verbosityDirective}
${citationDirective}
当用户提交反馈时，根据以下规则简短回应（1-2句）：

1. 反馈具体、可定位 → 肯定 + 鼓励
   "这个建议很具体，我们已经记录，会认真评估。感谢！"

2. 反馈模糊、无法定位 → 引导用户补充细节
   "感谢反馈！如果能补充一下具体是哪个页面、操作到哪一步时遇到的问题，会帮助我们更快定位。"

3. 反馈超出了平台定位范围 → 温和说明平台边界
   "[功能名]目前不在平台规划范围内，但我们会记录这个需求。"

关键约束：
- 不承诺"会修"、"下个版本上线"
- 不替管理员做任何拒绝或接受的决定
- 只做确认收到和引导补充细节
`.trim();
};
exports.buildPageAgentSystemPrompt = buildPageAgentSystemPrompt;
const sanitizeContextValues = (value) => {
    if (typeof value === "string")
        return (0, sanitize_1.sanitizeForModel)(value);
    if (Array.isArray(value))
        return value.map(sanitizeContextValues);
    if (value && typeof value === "object" && !Array.isArray(value)) {
        const result = {};
        for (const [k, v] of Object.entries(value)) {
            result[k] = sanitizeContextValues(v);
        }
        return result;
    }
    return value;
};
const buildPageAgentUserPrompt = (input, searchSources) => JSON.stringify(input.pageType === "article_detail"
    ? {
        question: input.question,
        pageType: input.pageType,
        route: input.route,
        pageTitle: input.pageTitle,
        selectionText: input.selectionText ?? "",
        articleContext: buildArticleDetailPromptContext(input),
        searchSources,
    }
    : {
        question: input.question,
        pageType: input.pageType,
        route: input.route,
        pageTitle: input.pageTitle,
        selectionText: input.selectionText ?? "",
        context: sanitizeContextValues(input.context),
        searchSources,
    }, null, 2);
exports.buildPageAgentUserPrompt = buildPageAgentUserPrompt;
const buildPageAgentMessages = (input) => {
    const messages = [
        {
            role: "system",
            content: (0, exports.buildPageAgentSystemPrompt)({
                verbosity: input.request.verbosity,
                citationStyle: input.request.citationStyle,
            }),
        },
    ];
    if (input.userProfile?.personaPrompt.trim()) {
        messages.push({
            role: "system",
            content: `用户专属回答偏好：${input.userProfile.personaPrompt.trim()}`,
        });
    }
    if (input.userProfile?.preferenceSummary.trim() ||
        (input.userProfile?.interestTopics.length ?? 0) > 0) {
        messages.push({
            role: "system",
            content: JSON.stringify({
                preferenceSummary: input.userProfile?.preferenceSummary ?? "",
                interestTopics: input.userProfile?.interestTopics ?? [],
                responsePreferences: input.userProfile?.responsePreferences ?? {},
            }, null, 2),
        });
    }
    input.historyMessages.forEach((message) => {
        if (message.role === "user" || message.role === "assistant") {
            messages.push({
                role: message.role,
                content: message.sanitizedContent || (0, sanitize_1.sanitizeForModel)(message.content),
            });
        }
    });
    messages.push({
        role: "user",
        content: (0, exports.buildPageAgentUserPrompt)(input.request, input.searchSources),
    });
    return messages;
};
exports.buildPageAgentMessages = buildPageAgentMessages;
