import { PageAgentMessage, UserProfile } from "../../lib/types";
import { PageAgentRequestBody, PageAgentSource } from "./types";

const buildArticleDetailPromptContext = (input: PageAgentRequestBody) => ({
  title: typeof input.context.title === "string" ? input.context.title : "",
  summary: typeof input.context.summary === "string" ? input.context.summary : "",
  sourceContent:
    typeof input.context.sourceContent === "string" ? input.context.sourceContent : "",
  contentPreview:
    typeof input.context.contentPreview === "string" ? input.context.contentPreview : "",
  author: typeof input.context.author === "string" ? input.context.author : "",
  publishedAt:
    typeof input.context.publishedAt === "string" ? input.context.publishedAt : "",
  channelCode:
    typeof input.context.channelCode === "string" ? input.context.channelCode : "",
  channelName:
    typeof input.context.channelName === "string" ? input.context.channelName : "",
  originalUrl:
    typeof input.context.originalUrl === "string" ? input.context.originalUrl : "",
});

export const buildPageAgentSystemPrompt = (): string => `
你是 AI徐医 站内页面问答助手。
规则：
- 优先根据当前页面信息回答。
- 若当前页面是文章详情页且提供 sourceContent，应优先依据 sourceContent 回答细节问题。
- summary 仅作概览，不得只复述 summary 作为完整回答。
- 若 sourceContent 为空，再退回 contentPreview 或 summary。
- 当前页面不足时，才可参考站内检索结果。
- 不得编造文章标题、站内链接、原文链接、页面状态、用户配置。
- 若无法确认，请明确说当前页面和站内结果无法确认。
- 回答简洁清楚，适合教师、学生和管理人员理解。

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

export const buildPageAgentUserPrompt = (
  input: PageAgentRequestBody,
  searchSources: PageAgentSource[]
): string =>
  JSON.stringify(
    input.pageType === "article_detail"
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
          context: input.context,
          searchSources,
        },
    null,
    2
  );

export const buildPageAgentMessages = (input: {
  request: PageAgentRequestBody;
  historyMessages: PageAgentMessage[];
  userProfile?: UserProfile;
  searchSources: PageAgentSource[];
}): Array<{ role: "system" | "user" | "assistant"; content: string }> => {
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    {
      role: "system",
      content: buildPageAgentSystemPrompt(),
    },
  ];

  if (input.userProfile?.personaPrompt.trim()) {
    messages.push({
      role: "system",
      content: `用户专属回答偏好：${input.userProfile.personaPrompt.trim()}`,
    });
  }

  if (
    input.userProfile?.preferenceSummary.trim() ||
    (input.userProfile?.interestTopics.length ?? 0) > 0
  ) {
    messages.push({
      role: "system",
      content: JSON.stringify(
        {
          preferenceSummary: input.userProfile?.preferenceSummary ?? "",
          interestTopics: input.userProfile?.interestTopics ?? [],
          responsePreferences: input.userProfile?.responsePreferences ?? {},
        },
        null,
        2
      ),
    });
  }

  input.historyMessages.forEach((message) => {
    if (message.role === "user" || message.role === "assistant") {
      messages.push({
        role: message.role,
        content: message.sanitizedContent || message.content,
      });
    }
  });

  messages.push({
    role: "user",
    content: buildPageAgentUserPrompt(input.request, input.searchSources),
  });

  return messages;
};
