-- Feedback likes for public feedback wall
-- 用户可以对已处理的反馈条目点赞

CREATE TABLE IF NOT EXISTS feedback_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id UUID NOT NULL REFERENCES feedback_entries(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(feedback_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_likes_feedback_id ON feedback_likes(feedback_id);
CREATE INDEX IF NOT EXISTS idx_feedback_likes_user_id ON feedback_likes(user_id);
