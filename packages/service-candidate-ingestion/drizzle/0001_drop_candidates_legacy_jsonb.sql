-- A7 迁移窗口批处理：candidates 表 3 个 legacy JSONB 列退役
ALTER TABLE candidates
  DROP COLUMN IF EXISTS analysis_snapshot,
  DROP COLUMN IF EXISTS duplicate_case,
  DROP COLUMN IF EXISTS manual_result;
