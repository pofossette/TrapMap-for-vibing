-- A7 迁移窗口批处理：冗余索引退役（部分唯一索引 task_queue_dedupe_pending_idx 已覆盖同列组查询）
DROP INDEX IF EXISTS task_queue_type_dedupe_idx;
