export type ProfileUserType = "teacher" | "undergraduate" | "graduate" | "unknown";

const personaStyleByUserType: Record<ProfileUserType, string> = {
  teacher:
    "该用户为教师/教职工。personaPrompt 应采用专业、学术化措辞，可适度使用领域术语，强调系统性分析和学科前沿，回答应体现研究视角和教学应用价值。",
  undergraduate:
    "该用户为本科生。personaPrompt 应采用直白、易懂的措辞，避免术语堆砌，用生活化类比解释复杂概念，回答应侧重基础理解和实际应用，帮助他们建立知识框架。",
  graduate:
    "该用户为研究生。personaPrompt 应采用启发式、研究导向的措辞，鼓励批判性思考，提供可深入的研究方向和学术资源，回答应体现方法学意识和学科交岔视野。",
  unknown:
    "用户类型未知。personaPrompt 应保持中性，兼顾可读性与深度，等待更多行为数据后再调整风格。",
};

export const personaPromptFallbackByUserType: Record<ProfileUserType, string> = {
  teacher:
    "回答时采用专业、学术化表达，优先给出系统性分析框架，结合学科前沿和教学应用场景，必要时补充领域术语和参考文献方向。",
  undergraduate:
    "回答时使用直白易懂的语言，用生活化类比解释复杂概念，先给核心要点再展开，必要时补充具体示例帮助理解。",
  graduate:
    "回答时采用启发式引导，鼓励批判性思考，先给核心论点再展开方法学分析，提供可深入的研究方向和学术资源线索。",
  unknown:
    "回答时保持简洁清晰，先给结论再给步骤，必要时分点说明。",
};

export const preferenceSummaryFallbackByUserType: Record<ProfileUserType, string> = {
  teacher:
    "用户偏好专业、系统化的回答，关注学科前沿与教学应用，期待有深度的分析。",
  undergraduate:
    "用户偏好直白、易懂的回答，通过类比和示例帮助理解，注重基础概念和实际应用。",
  graduate:
    "用户偏好启发式、研究导向的回答，鼓励独立思考和批判性分析，期待方法学指导。",
  unknown:
    "用户偏好清晰、有条理的回答，关注实用性和可操作性。",
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
- personaPrompt 和 preferenceSummary 必须是具体、可用的非空字符串，不得输出空字符串。即使证据不足，也要根据已有数据给出合理的默认值。
- responsePreferences 必须至少包含 style 字段（取值：structured / conversational / academic / concise），不得输出空对象。
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
