import type {
  SurveyQuestion,
  SurveyQuestionType,
  SurveyRecipientConfig,
} from "../../lib/types";

export type { SurveyQuestion, SurveyQuestionType, SurveyRecipientConfig };

export interface GenerateSurveyInput {
  description: string;
}

export interface GenerateSurveyOutput {
  title: string;
  description: string;
  questions: SurveyQuestion[];
}

export interface QuestionStat {
  questionId: string;
  questionTitle: string;
  type: SurveyQuestionType;
  visibleCount: number;
  answeredCount: number;
  // 单选/多选
  distribution?: Record<string, number>;
  // 评分
  average?: number;
  ratingDistribution?: Record<number, number>;
  // 文本
  textResponses?: string[];
}

export interface SurveyStats {
  totalResponses: number;
  questions: QuestionStat[];
}
