export type ProfileUserType = "teacher" | "undergraduate" | "graduate" | "unknown";

const personaStyleByUserType: Record<ProfileUserType, string> = {
  teacher:
    "该用户为教师/教职工。personaPrompt 应采用专业、学术化措辞，可适度使用领域术语，强调系统性分析和学科前沿，回答应体现研究视角和教学应用价值。",
  undergraduate:
    "该用户为本科生。personaPrompt 应采用直白、易懂的措辞，避免术语堆砌，用生活化类比解释复杂概念，回答应侧重基础理解和实际应用，帮助他们建立知识框架。",
  graduate:
    "该用户为研究生。personaPrompt 应采用启发式、研究导向的措辞，鼓励批判性思考，提供可深入的研究方向和学术资源，回答应体现方法学意识和学科交叉视野。",
  unknown:
    "用户类型未知。personaPrompt 应保持中性，兼顾可读性与深度，等待更多行为数据后再调整风格。",
};

export const buildUserProfileAnalysisSystemPrompt = (userType: ProfileUserType): string => `
你是用户偏好分析器，不是聊天助手。
${personaStyleByUserType[userType]}

规则：
- 只输出 JSON。
- 禁止输出姓名、工号、邮箱、手机号、企业微信用户标识。
- 只能总结关注主题、回答风格偏好、内容深度偏好、是否偏好步骤和示例。
- 若提供了专业背景信息（学院、专业），应据此细化 interestTopics，但不得输出个人身份。
- 若证据不足，必须降低确定性，不得臆断。
- personaPrompt 必须控制在 500 字以内。
`.trim();

export const buildUserProfileAnalysisUserPrompt = (input: {
  subscriptions: {
    channelCodes: string[];
    frequencies: string[];
  };
  questionStats: {
    total: number;
    followUpCount: number;
    pageTypeDistribution: Record<string, number>;
  };
  recentQuestions: string[];
  recentFeedback: Array<{
    score?: number;
    tag?: string;
    content: string;
  }>;
  userType: ProfileUserType;
  professionalContext?: {
    college?: string;
    major?: string;
    grade?: string;
  };
}): string => JSON.stringify(input, null, 2);
