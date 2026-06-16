-- 6. feedback_evaluations 增加详细分析字段
-- 用于存储 Phase 1 LLM 评估的完整推理链
ALTER TABLE feedback_evaluations ADD COLUMN IF NOT EXISTS detailed_analysis TEXT;
