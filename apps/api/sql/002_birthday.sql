-- Birthday push management

CREATE TABLE IF NOT EXISTS birthday_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blessing_template VARCHAR(500) NOT NULL DEFAULT '亲爱的{name}，祝您生日快乐！愿您在新的一岁里，身体健康，工作顺利，阖家幸福！',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS birthday_push_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_xh VARCHAR(64) NOT NULL,
  xm VARCHAR(120) NOT NULL,
  csrq DATE,
  card_path VARCHAR(500),
  blessing_text VARCHAR(500),
  pushed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'success', 'failed')),
  pushed_to VARCHAR[] NOT NULL DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_birthday_push_log_pushed_at ON birthday_push_log(pushed_at DESC);
CREATE INDEX IF NOT EXISTS idx_birthday_push_log_status ON birthday_push_log(status);
CREATE INDEX IF NOT EXISTS idx_birthday_push_log_user_xh ON birthday_push_log(user_xh);

INSERT INTO birthday_config (blessing_template)
VALUES ('亲爱的{name}，祝您生日快乐！愿您在新的一岁里，身体健康，工作顺利，阖家幸福！')
ON CONFLICT DO NOTHING;
