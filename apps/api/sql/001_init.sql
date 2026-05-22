CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS article_channels (
  code VARCHAR(64) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(400),
  sort_order INT NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by_user_id VARCHAR(64),
  title VARCHAR(180) NOT NULL,
  summary VARCHAR(400) NOT NULL,
  content TEXT NOT NULL,
  source_content TEXT,
  original_url VARCHAR(1000),
  channel_code VARCHAR(64),
  category VARCHAR(120) NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL CHECK (status IN ('draft', 'published')),
  author VARCHAR(80) NOT NULL,
  published_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(64) NOT NULL UNIQUE,
  channel_codes TEXT[] NOT NULL DEFAULT '{}',
  categories TEXT[] NOT NULL DEFAULT '{}',
  frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('daily', 'weekly', 'instant')),
  qywx_user_id VARCHAR(128) NOT NULL,
  qywx_user_name VARCHAR(80),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wecom_app_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_code VARCHAR(64) NOT NULL UNIQUE,
  corp_id VARCHAR(128) NOT NULL,
  agent_id INT NOT NULL,
  secret VARCHAR(255) NOT NULL,
  callback_token VARCHAR(128),
  callback_aes_key VARCHAR(128),
  internal_auth_token VARCHAR(255),
  base_url VARCHAR(255) NOT NULL DEFAULT 'https://qyapi.weixin.qq.com/cgi-bin',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wecom_tag_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_code VARCHAR(64) NOT NULL,
  frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('daily', 'weekly', 'instant')),
  tag_id INT NOT NULL,
  tag_name VARCHAR(128) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_sync_status VARCHAR(16) NOT NULL DEFAULT 'idle'
    CHECK (last_sync_status IN ('idle', 'success', 'partial', 'failed')),
  last_sync_error TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (channel_code, frequency),
  UNIQUE (tag_id)
);

CREATE TABLE IF NOT EXISTS push_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID,
  channel_code VARCHAR(64) NOT NULL,
  subscription_user_id VARCHAR(64),
  qywx_user_id VARCHAR(128) NOT NULL,
  delivery_mode VARCHAR(16) NOT NULL DEFAULT 'user'
    CHECK (delivery_mode IN ('user', 'tag', 'fallback_user')),
  wecom_tag_id INT,
  wecom_tag_name VARCHAR(128),
  message_type VARCHAR(32) NOT NULL,
  title VARCHAR(180) NOT NULL,
  summary VARCHAR(400) NOT NULL,
  url VARCHAR(500) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'success', 'failed')),
  retry_count INT NOT NULL DEFAULT 0,
  wecom_errcode INT,
  wecom_errmsg VARCHAR(255),
  wecom_msgid VARCHAR(128),
  response_code VARCHAR(256),
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_detail TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS page_agent_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(64) NOT NULL,
  title VARCHAR(200),
  page_type VARCHAR(32),
  route VARCHAR(500),
  page_title VARCHAR(200),
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS page_agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES page_agent_conversations(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'feedback')),
  message_type VARCHAR(20) NOT NULL
    CHECK (message_type IN ('question', 'answer', 'feedback')),
  content TEXT NOT NULL,
  sanitized_content TEXT,
  page_type VARCHAR(32),
  route VARCHAR(500),
  page_title VARCHAR(200),
  context_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  sources_payload JSONB NOT NULL DEFAULT '[]'::jsonb,
  model VARCHAR(100),
  tokens_input INT,
  tokens_output INT,
  parent_message_id UUID,
  feedback_score SMALLINT,
  feedback_tag VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(64) NOT NULL UNIQUE,
  profile_version INT NOT NULL DEFAULT 1,
  preference_summary TEXT NOT NULL DEFAULT '',
  persona_prompt VARCHAR(500) NOT NULL DEFAULT '',
  interest_topics TEXT[] NOT NULL DEFAULT '{}',
  response_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_analyzed_at TIMESTAMPTZ,
  last_source_window_start TIMESTAMPTZ,
  last_source_window_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_profile_analysis_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_mode VARCHAR(20) NOT NULL CHECK (trigger_mode IN ('manual', 'scheduled')),
  target_user_id VARCHAR(64),
  status VARCHAR(20) NOT NULL
    CHECK (status IN ('pending', 'running', 'success', 'failed')),
  processed_count INT NOT NULL DEFAULT 0,
  success_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feedback_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(64) NOT NULL,
  type VARCHAR(32) NOT NULL CHECK (type IN ('bug', 'ux', 'content', 'other')),
  content TEXT NOT NULL,
  contact VARCHAR(255),
  page_route VARCHAR(500) NOT NULL,
  page_title VARCHAR(200) NOT NULL,
  source VARCHAR(64) NOT NULL DEFAULT 'web_feedback',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(32) NOT NULL
    CHECK (event_type IN ('page', 'article', 'push', 'subscription', 'feedback', 'agent')),
  event_name VARCHAR(64) NOT NULL
    CHECK (
      event_name IN (
        'page_view',
        'article_view',
        'article_published',
        'push_sent',
        'push_failed',
        'subscription_updated',
        'feedback_created',
        'page_agent_conversation_created',
        'page_agent_message_created'
      )
    ),
  user_id VARCHAR(64),
  session_id VARCHAR(128),
  page_route VARCHAR(500),
  page_title VARCHAR(200),
  article_id UUID,
  channel_code VARCHAR(64),
  source_module VARCHAR(64) NOT NULL,
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS channel_code VARCHAR(64);
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS original_url VARCHAR(1000);
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS source_content TEXT;
ALTER TABLE articles
  ALTER COLUMN category TYPE VARCHAR(120);
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS channel_codes TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS qywx_user_name VARCHAR(80);
ALTER TABLE push_records
  ADD COLUMN IF NOT EXISTS delivery_mode VARCHAR(16) NOT NULL DEFAULT 'user';
ALTER TABLE push_records
  ADD COLUMN IF NOT EXISTS wecom_tag_id INT;
ALTER TABLE push_records
  ADD COLUMN IF NOT EXISTS wecom_tag_name VARCHAR(128);

CREATE INDEX IF NOT EXISTS idx_articles_created_by_user_id ON articles(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_channel_code ON articles(channel_code);
CREATE INDEX IF NOT EXISTS idx_wecom_app_configs_enabled ON wecom_app_configs(enabled);
CREATE INDEX IF NOT EXISTS idx_wecom_tag_mappings_channel_frequency
  ON wecom_tag_mappings(channel_code, frequency);
CREATE INDEX IF NOT EXISTS idx_push_records_channel_code ON push_records(channel_code);
CREATE INDEX IF NOT EXISTS idx_push_records_qywx_user_id ON push_records(qywx_user_id);
CREATE INDEX IF NOT EXISTS idx_push_records_delivery_mode ON push_records(delivery_mode);
CREATE INDEX IF NOT EXISTS idx_push_records_status_created_at ON push_records(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_agent_conversations_user_id
  ON page_agent_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_page_agent_conversations_last_message_at
  ON page_agent_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_agent_messages_conversation_created_at
  ON page_agent_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_agent_messages_user_created_at
  ON page_agent_messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_profile_analysis_jobs_status_created_at
  ON user_profile_analysis_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_entries_user_created_at
  ON feedback_entries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_occurred_at
  ON analytics_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_name_occurred_at
  ON analytics_events(event_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_channel_occurred_at
  ON analytics_events(channel_code, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_article_occurred_at
  ON analytics_events(article_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_occurred_at
  ON analytics_events(user_id, occurred_at DESC);

INSERT INTO article_channels (code, name, description, sort_order, enabled)
VALUES
  ('daily-ai-summary', '每日AI摘要', '每日核心进展与摘要整理', 10, TRUE),
  ('policy-ethics', 'AI政策与伦理', '政策法规、治理框架与伦理边界', 20, TRUE),
  ('medical-frontier', '医学AI前沿', '医疗模型、临床辅助与科研创新', 30, TRUE),
  ('campus-news', '校内AI动态', '校内项目、通知公告与实践活动', 40, TRUE),
  ('edu-plus-ai', 'AI+医学教育', '课程改革、教学场景与学习路径', 50, TRUE),
  ('tools-recommend', '工具与应用推荐', '高价值工具清单与落地案例', 60, TRUE),
  ('student-zone', '学生专栏', '竞赛信息、学习资源与经验复盘', 70, TRUE)
ON CONFLICT (code) DO NOTHING;

INSERT INTO articles (
  created_by_user_id,
  title,
  summary,
  content,
  channel_code,
  category,
  tags,
  status,
  author,
  published_at
)
SELECT
  'system-admin',
  '教育部发布高校人工智能课程建设新指引',
  '围绕课程体系建设、师资能力提升和资源共享提出新的指导意见。',
  '该指引强调课程标准化建设、产学研协同和区域资源共建共享。',
  'policy-ethics',
  'AI政策',
  ARRAY['高校', '政策', '课程建设'],
  'published',
  '系统管理员',
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM articles);
