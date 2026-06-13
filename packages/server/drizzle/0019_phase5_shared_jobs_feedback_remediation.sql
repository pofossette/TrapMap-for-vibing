ALTER TABLE feedback_records
  ADD COLUMN IF NOT EXISTS remediation_status text,
  ADD COLUMN IF NOT EXISTS remediation_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS remediation_opened_by_user_id text,
  ADD COLUMN IF NOT EXISTS remediation_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS remediation_resolved_by_user_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_feedback_records_remediation_status'
  ) THEN
    ALTER TABLE feedback_records
      ADD CONSTRAINT ck_feedback_records_remediation_status
      CHECK (
        remediation_status IS NULL
        OR remediation_status IN ('pending-human-review', 'in-remediation', 'ready-to-reindex')
      );
  END IF;
END $$;
