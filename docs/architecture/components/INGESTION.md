# 异步摄取管道 (Async Ingestion Pipeline)

## 概述

异步摄取管道用于批量导入外部知识源（如文档、代码库、API 响应），并将其转换为 TrapMap 中的可检索条目。管道处理候选提交、重复检测、人工解决和最终发布。

## 架构概览

```mermaid
flowchart TB
    subgraph 摄取管道["异步摄取管道架构"]
        subgraph 外部来源["外部来源"]
            Documents["文档"]
            Code["代码"]
            APIs["API"]
        end
        
        subgraph 候选提交["候选提交"]
            PostCandidates["POST /v1/candidates"]
        end
        
        subgraph 后台处理["后台处理器"]
            Queue["队列"]
            Process["处理"]
            Detect["检测"]
        end
        
        subgraph 分析结果["分析结果"]
            DuplicateDetector["重复检测器\n- 指纹\n- 语义"]
            AnalysisComplete["分析完成\n状态: ready_for_review"]
        end
        
        ReviewQueue["审核队列\n重复项：需要人工解决\n唯一内容：自动发布或排队审核"]
    end

    外部来源 --> 候选提交
    候选提交 --> 后台处理
    后台处理 --> DuplicateDetector
    后台处理 --> AnalysisComplete
    DuplicateDetector --> ReviewQueue
    AnalysisComplete --> ReviewQueue
```

### 异步摄取管道流程（Mermaid）

```mermaid
flowchart TB
    subgraph 输入["输入"]
        Ext["外部来源<br/>（文档、代码、API）"]
    end

    subgraph 提交["提交"]
        Submit["POST /v1/candidates"]
        Create["创建 CandidateSubmission<br/>status: received"]
    end

    subgraph 后台处理["后台处理"]
        Queue["加入处理队列<br/>status: queued"]
        Analyze["分析处理<br/>status: analyzing"]
        Fingerprint["生成指纹"]
        Embedding["生成嵌入向量"]
    end

    subgraph 重复检测["重复检测"]
        DupCheck{"重复检测"}
        DupFound["status: duplicate_detected"]
        NoDup["status: ready_for_review"]
    end

    subgraph 人工解决["人工解决"]
        Manual["管理员审核"]
        Merge["合并（merge）"]
        Discard["丢弃（discard）"]
        KeepBoth["保留两者（keep_both）"]
    end

    subgraph 输出["输出"]
        PublishTrap["发布为 Trap"]
        PublishSkill["发布为 Skill"]
    end

    Ext --> Submit
    Submit --> Create
    Create --> Queue
    Queue --> Analyze
    Analyze --> Fingerprint
    Analyze --> Embedding
    Fingerprint --> DupCheck
    Embedding --> DupCheck

    DupCheck -->|相似度 >= 阈值| DupFound
    DupCheck -->|唯一内容| NoDup

    DupFound --> Manual
    NoDup --> PublishTrap
    NoDup --> PublishSkill

    Manual --> Merge
    Manual --> Discard
    Manual --> KeepBoth

    Merge --> PublishTrap
    KeepBoth --> PublishTrap
    KeepBoth --> PublishSkill
```

## 候选状态机

```mermaid
flowchart TB
    subgraph 候选状态机["候选状态机"]
        Received["已接收\n（初始状态）"]
        Queued["已排队\n（在处理队列中）"]
        Analyzing["分析中\n（正在处理）"]
        
        subgraph 分支结果["分支结果"]
            DuplicateDetected["检测到重复\n需要人工解决"]
            ReadyForReview["待审核\n唯一内容\n准备发布"]
        end
        
        Resolved["已解决\n（终态）"]
    end

    Received -->|process()| Queued
    Queued -->|start_processing()| Analyzing
    Analyzing --> DuplicateDetected
    Analyzing --> ReadyForReview
    DuplicateDetected -->|manual_resolution()| Resolved
    ReadyForReview --> Resolved
```

---

## 候选提交 (Candidate Submission)

### API 端点

```typescript
// POST /v1/candidates
interface CandidateSubmissionRequest {
  content: string;
  source: string;
  submittedBy?: ActorRef;
  metadata?: Record<string, unknown>;
}
```

### 字段说明

| 字段 | 类型 | 描述 |
|------|------|------|
| content | string | 要摄取的内容（文本） |
| source | string | 来源标识（如 URL、文件名） |
| submittedBy | ActorRef | 可选，提交者信息 |
| metadata | object | 可选，额外元数据 |

### 提交流程

```mermaid
flowchart TB
    subgraph 外部来源["外部来源"]
        Document["文档（PDF, MD, HTML）"]
        CodeFile["代码文件"]
        APIResp["API 响应"]
        DBDump["数据库转储"]
    end
    
    subgraph 内容提取["内容提取"]
        ExtractText["提取文本（去除格式、元数据）"]
        Normalize["标准化编码"]
        Chunk["如果过大则分块（>32K 字符）"]
    end
    
    subgraph 候选创建["候选创建"]
        GenId["生成 EntityId"]
        SetStatus["设置状态: 'received'"]
        RecordMeta["记录来源和元数据"]
        RecordTime["记录 submittedAt"]
    end
    
    QueueProc["排队等待处理"]

    外部来源 --> 内容提取
    内容提取 --> 候选创建
    候选创建 --> QueueProc
```

---

## 后台处理 (Background Processing)

### 处理器实现

```typescript
interface ProcessingJob {
  candidateId: EntityId;
  priority: 'low' | 'normal' | 'high';
  attempts: number;
  createdAt: string;
}

class CandidateProcessor {
  private queue: ProcessingJob[] = [];
  private processing = new Set<EntityId>();
  private maxConcurrent = 5;
  
  async processLoop(): Promise<void> {
    while (true) {
      // Fill processing slots
      while (this.processing.size < this.maxConcurrent && this.queue.length > 0) {
        const job = this.queue.shift()!;
        this.processCandidate(job.candidateId);
      }
      
      // Wait before next iteration
      await sleep(1000);
    }
  }
  
  private async processCandidate(candidateId: EntityId): Promise<void> {
    this.processing.add(candidateId);
    
    try {
      // Update status to analyzing
      await this.updateStatus(candidateId, 'analyzing');
      
      // Generate fingerprint
      const fingerprint = await this.generateFingerprint(candidateId);
      
      // Generate embedding
      const embedding = await this.generateEmbedding(candidateId);
      
      // Check for duplicates
      const duplicates = await this.findDuplicates(candidateId, fingerprint, embedding);
      
      if (duplicates.length > 0) {
        // Mark as duplicate
        await this.updateStatus(candidateId, 'duplicate_detected', {
          duplicates
        });
      } else {
        // Mark as ready for review
        await this.updateStatus(candidateId, 'ready_for_review');
      }
    } catch (error) {
      // Handle failure
      await this.handleProcessingError(candidateId, error);
    } finally {
      this.processing.delete(candidateId);
    }
  }
}
```

### 指纹生成

```typescript
async function generateFingerprint(candidateId: EntityId): Promise<string> {
  const candidate = await store.getCandidate(candidateId);
  const content = candidate.content;
  
  // Normalize content
  const normalized = content
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Generate hash
  const hash = crypto.createHash('sha256').update(normalized).digest('hex');
  
  // Truncate to 16 bytes for similarity matching
  return hash.substring(0, 32);
}

async function findDuplicates(
  candidateId: EntityId,
  fingerprint: string,
  embedding: number[]
): Promise<DuplicateMatch[]> {
  const duplicates: DuplicateMatch[] = [];
  
  // 1. Exact fingerprint match
  const fingerprintMatches = await store.findByFingerprint(fingerprint);
  for (const match of fingerprintMatches) {
    if (match.candidateId !== candidateId) {
      duplicates.push({
        candidateId,
        candidate2Id: match.candidateId,
        matchType: 'fingerprint',
        similarity: 1.0
      });
    }
  }
  
  // 2. Semantic similarity match
  const semanticMatches = await store.findByEmbedding(embedding, {
    threshold: 0.95,  // High threshold for duplicate detection
    limit: 5
  });
  
  for (const match of semanticMatches) {
    if (match.candidateId !== candidateId) {
      duplicates.push({
        candidateId,
        candidate2Id: match.candidateId,
        matchType: 'semantic',
        similarity: match.similarity
      });
    }
  }
  
  return duplicates;
}
```

---

## 重复检测 (Duplicate Detection)

### 检测策略

| 策略 | 方法 | 阈值 | 用途 |
|------|------|------|------|
| 精确指纹 | SHA-256 哈希 | 100% 匹配 | 精确重复 |
| 语义相似度 | 余弦相似度 | ≥ 0.95 | 近似重复 |

### 检测流程

```mermaid
flowchart TB
    subgraph 重复检测流程["重复检测流程"]
        NewCandidate["新候选"]
        
        subgraph 指纹检查["指纹检查"]
            SHA256["SHA-256 哈希（标准化内容）"]
            ExactMatch["精确匹配 → 立即判定为重复"]
        end
        
        subgraph 语义相似度检查["语义相似度检查"]
            GenEmbed["生成 embedding"]
            Compare["与现有候选 embedding 比较"]
            Threshold["相似度 ≥ 0.95 → 可能重复"]
        end
        
        subgraph 合并决策["合并决策"]
            DupFound["发现重复\n→ 排队等待人工解决"]
            NoDup["未发现重复\n→ 标记为 ready_for_review"]
        end
    end

    NewCandidate --> SHA256
    SHA256 --> ExactMatch
    ExactMatch --> GenEmbed
    GenEmbed --> Compare
    Compare --> Threshold
    Threshold --> DupFound
    Threshold --> NoDup
```

---

## 人工解决 (Manual Resolution)

### API 端点

```typescript
// POST /v1/candidates/:id/manual-result
interface ManualResolutionRequest {
  resolution: 'merge' | 'discard' | 'keep_both';
  mergeIntoId?: EntityId;  // Required if resolution is 'merge'
  notes?: string;
}
```

### 解决选项

| 选项 | 描述 | 结果 |
|------|------|------|
| `merge` | 合并重复内容 | 创建单个条目，链接两个候选 |
| `discard` | 丢弃当前候选 | 当前候选被拒绝 |
| `keep_both` | 保留两者 | 两个候选都转为正式条目 |

### 解决流程

```mermaid
flowchart TB
    subgraph 审核者操作["审核者操作"]
        A["GET /v1/duplicates/:candidateId/bundle\n返回当前候选 + 重复候选\n显示内容对比"]
    end

    subgraph 用户决策["用户决策"]
        B["POST /v1/candidates/:id/manual-result\n{ resolution: 'merge' | 'discard' | 'keep_both' }"]
    end

    subgraph 执行解决["执行解决"]
        subgraph 合并["MERGE"]
            C1["1. 合并内容\n2. 创建新条目\n3. 链接候选"]
        end

        subgraph 丢弃["DISCARD"]
            C2["1. 标记候选为已拒绝\n2. 更新重复项"]
        end

        subgraph 保留两者["KEEP_BOTH"]
            C3["1. 将当前候选转为条目\n2. 将重复候选转为条目"]
        end
    end

    subgraph 状态更新["状态更新"]
        D["所有涉及的候选：状态 → 'resolved'\n在 DuplicateCase 中记录解决结果\n发送审计事件"]
    end

    审核者操作 --> 用户决策 --> 执行解决 --> 状态更新
```

---

## 发布 (Publishing)

### 发布为 Trap

当候选被批准发布时，可以创建 Trap 条目：

```typescript
async function publishAsTrap(
  candidateId: EntityId,
  trapData: { name: string; description: string }
): Promise<EntityId> {
  const candidate = await store.getCandidate(candidateId);
  
  // Create trap entry
  const trap = await store.createTrap({
    id: generateEntityId(),
    name: trapData.name,
    description: trapData.description,
    content: candidate.content,
    requiredLevel: 0,  // Default level
    lifecycleState: 'approved',  // Direct approval for ingested
    createdAt: new Date().toISOString(),
    createdBy: { actorId: candidate.submittedBy?.actorId, actorName: 'System' }
  });
  
  // Link candidate to trap
  await store.updateCandidate(candidateId, {
    status: 'resolved',
    publishedAs: { type: 'trap', entityId: trap.id }
  });
  
  // Record lineage
  await store.createEntityLineage({
    entityId: trap.id,
    candidateIds: [candidateId]
  });
  
  return trap.id;
}
```

---

## 协调 (Reconciliation)

启动时协调未完成的候选：

```typescript
async function reconcileCandidates(): Promise<void> {
  const candidates = await store.listCandidates({
    filter: {
      status: { in: ['received', 'queued', 'analyzing'] }
    }
  });
  
  for (const candidate of candidates) {
    // Re-queue stuck candidates
    const stuckDuration = Date.now() - new Date(candidate.updatedAt).getTime();
    
    if (stuckDuration > 30 * 60 * 1000) {  // 30 minutes
      await processor.requeue(candidate.id);
    }
  }
  
  // Clean up old resolved candidates (optional)
  const oldResolved = await store.listCandidates({
    filter: {
      status: 'resolved',
      resolvedAt: { lt: subtractDays(new Date(), 30) }
    }
  });
  
  // Archive or delete old resolved
  for (const candidate of oldResolved) {
    await store.archiveCandidate(candidate.id);
  }
}
```

---

## 监控

### 指标

```typescript
interface IngestionMetrics {
  // Processing
  queueDepth: number;
  processingCount: number;
  averageProcessingTimeMs: number;
  
  // Outcomes
  pendingCount: number;
  duplicateDetectedCount: number;
  resolvedCount: number;
  
  // Errors
  failedCount: number;
  lastError?: string;
}
```

### 健康检查

```typescript
async function getIngestionHealth(): Promise<HealthStatus> {
  const metrics = await getIngestionMetrics();
  
  if (metrics.failedCount > 10) {
    return { status: 'unhealthy', reason: 'High failure count' };
  }
  
  if (metrics.queueDepth > 1000) {
    return { status: 'degraded', reason: 'Large queue depth' };
  }
  
  return { status: 'healthy' };
}
```
