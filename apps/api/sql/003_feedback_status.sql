-- Feedback status tracking

ALTER TABLE feedback_entries
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'evaluating', 'snoozed', 'approved',
      'in_progress', 'testing', 'deployed', 'verified',
      'failed_testing', 'reverted', 'wontfix', 'duplicate'
    ));

ALTER TABLE feedback_entries
  ADD COLUMN IF NOT EXISTS admin_note TEXT;

CREATE INDEX IF NOT EXISTS idx_feedback_entries_status
  ON feedback_entries(status);
