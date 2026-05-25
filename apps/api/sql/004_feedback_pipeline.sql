-- 1. 扩展 feedback_entries status 约束
ALTER TABLE feedback_entries DROP CONSTRAINT IF EXISTS feedback_entries_status_check;
ALTER TABLE feedback_entries ADD CONSTRAINT feedback_entries_status_check
  CHECK (status IN (
    'pending', 'evaluating', 'snoozed', 'approved',
    'in_progress', 'testing', 'deployed', 'verified',
    'failed_testing', 'reverted', 'wontfix', 'duplicate'
  ));

-- 2. 存量映射：implemented/optimized → verified
UPDATE feedback_entries SET status = 'verified'
  WHERE status IN ('implemented', 'optimized');

-- 3. 新建评估结果表
CREATE TABLE IF NOT EXISTS feedback_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id UUID NOT NULL REFERENCES feedback_entries(id) ON DELETE CASCADE,
  eval_type VARCHAR(32),
  severity VARCHAR(4),
  fix_scope VARCHAR(16),
  alignment VARCHAR(16),
  suggested_action VARCHAR(16),
  suggestion TEXT,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  evaluator VARCHAR(64) NOT NULL DEFAULT 'cc-analysis'
);

CREATE INDEX IF NOT EXISTS idx_feedback_evaluations_feedback_id
  ON feedback_evaluations(feedback_id, evaluated_at DESC);
