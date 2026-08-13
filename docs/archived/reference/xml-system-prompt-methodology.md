# XML 系统提示词构建方法论

> 基于 Claude Code、OpenCode 源码分析以及 2026 年行业最佳实践

---

## 一、核心原则

### 1.1 结构即语义

XML 标签不是装饰，是**语义边界**。每个标签都应该回答：
- 这段内容对模型意味着什么？
- 模型应该如何理解和使用这段内容？

### 1.2 四层架构：格式各司其职

系统提示词构建遵循四层架构原则，每种格式有明确、互不重叠的职责：

| 层次 | 格式 | 作用 | 示例 |
|------|------|------|------|
| API 传输层 | **JSON** | 消息结构、tool_use/tool_result、工具参数 Schema | `{"type": "tool_use", "name": "SkillTool"}`, `input_schema: {type: "object", properties: {...}}` |
| 内容标记层 | **XML** | 系统指令、环境信息、技能列表等消息内容内部标记 | `<system_reminder>...</system_reminder>`, `<env>...</env>`, `<skill>...</skill>` |
| 配置文件层 | **YAML** | Skill 文件头 Frontmatter 元数据 | `---\nname: commit\ndescription: ...\n---` |
| 内容载体层 | **Markdown** | Skill 正文内容 | `# Commit...`, `## 使用方式...` |

**关键约束**：
- 各层格式不可互换——不要在内容层用 JSON，不要在配置层用 XML
- XML 是系统提示词的唯一内容标记格式（不再支持 JSON/Markdown 作为系统提示词格式）
- JSON 仅用于 API 协议层和模板覆盖文件的序列化

### 1.3 静态优先，变量后置

将提示词分为两部分：

| 部分 | 位置 | 内容 | 缓存策略 |
|------|------|------|----------|
| 静态内容 | 前面 | 角色定义、工具定义、规则、格式要求 | 可缓存（节省 90% 成本，降低 85% 延迟） |
| 变量内容 | 最后 | 用户消息、上下文数据、动态注入内容 | 不可缓存 |

### 1.4 Schema 先于 Prompt

先定义输出格式（JSON Schema），再写填充格式的指令。**Schema 是规范，Prompt 是填充数据的过程**。

### 1.5 最小化但完整

- 每个字段必须有存在的理由（驱动决策、支持连接、或存储记录）
- 如果一句话说不清某个字段为什么存在，删除它
- 宁可 4 个约束良好的字段，也不要 12 个模糊字段

---

## 二、XML 提示词的标准模板

```xml
<system_instructions>

  <!-- 第一层：角色定义（告诉模型它是谁） -->
  <role>
    [AI 助手的身份、目标、主要职责]
  </role>

  <!-- 第二层：行为准则（告诉模型它应该怎么做） -->
  <core_principles>
    [3-5 条不可妥协的原则]
  </core_principles>

  <!-- 第三层：能力清单（告诉模型它能做什么） -->
  <agent_capabilities>
    [能力列表，可选但推荐]
  </agent_capabilities>

  <!-- 第四层：工具定义（告诉模型它有什么工具可用） -->
  <available_tools>
    [工具列表，每个工具包含 name/description/parameters/usage_notes]
  </available_tools>

  <!-- 第五层：扩展系统（告诉模型如何按需加载能力） -->
  <skill_system>
    [技能概念、注册机制、文件格式、激活模式]
  </skill_system>

  <!-- 第六层：外部集成（告诉模型如何与外部系统交互） -->
  <mcp_integration>
    [MCP 概念、配置格式、命名约定、生命周期]
  </mcp_integration>

  <!-- 第七层：使用规则（告诉模型何时、如何、以什么顺序使用工具） -->
  <tool_usage_rules>
    [通用规则 + 各工具类型的具体规则]
  </tool_usage_rules>

  <!-- 第八层：输出格式（告诉模型返回什么格式的结果） -->
  <output_format>
    [工具结果、技能结果、错误结果的标准格式]
  </output_format>

  <!-- 第九层：交互模式（告诉模型如何处理常见场景） -->
  <interaction_patterns>
    [任务分解、技能加载、子代理并行、澄清提问等模式]
  </interaction_patterns>

  <!-- 第十层：安全约束（告诉模型不能做什么） -->
  <security_and_safety>
    [文件安全、命令安全、凭证安全]
  </security_and_safety>

  <!-- 第十一层：环境信息（告诉模型当前运行环境） -->
  <system_constraints>
    [文件系统、Shell、网络、资源限制]
  </system_constraints>

  <current_environment>
    [OS、Shell、工作目录、日期]
  </current_environment>

</system_instructions>
```

---

## 三、各层详细构建方法

### 3.1 `<role>` — 角色定义

**目的**：建立模型的身份认同和行为基调

**构建规则**：
- 1-3 句话，清晰简洁
- 包含：身份 + 运行环境 + 主要目标
- 避免：过度拟人化、不必要的修饰

```xml
<role>
  你是一个强大的 AI 编程助手，运行在交互式终端环境中。
  你具备文件操作、代码搜索、Shell 执行、子代理调度和专业技能加载的能力。
  你的主要目标是帮助用户高效地完成软件开发任务。
</role>
```

### 3.2 `<core_principles>` — 行为准则

**目的**：建立不可妥协的行为底线

**构建规则**：
- 3-5 条，不超过 7 条（模型注意力有限）
- 每条一个原则，用动词开头
- 避免重复和矛盾
- 按重要性排序

```xml
<core_principles>
  1. 理解优先：在实现之前，确保完全理解用户的需求。如有歧义，主动澄清
  2. 最小化变更：只修改必要的代码，保持修改范围精确
  3. 遵循约定：模仿现有代码风格、使用已有库和工具
  4. 安全第一：绝不暴露或记录密钥、令牌等敏感信息
  5. 验证闭环：修改完成后，运行测试或验证步骤确认正确性
</core_principles>
```

### 3.3 `<available_tools>` — 工具定义

**目的**：让模型知道它有哪些工具可用，以及如何使用

**构建规则**：
- 每个工具必须包含：`name`、`description`、`parameters`（JSON Schema）
- 可选但推荐：`usage_notes`、`safety_rules`
- **参数使用 JSON Schema**，不是自然语言描述
- 按使用频率排序（常用工具放前面）

```xml
<tool>
  <name>Edit</name>
  <description>在文件中执行精确的文本替换。使用 SEARCH/REPLACE 块替换代码段。</description>
  <parameters>
    {
      "path": { "type": "string", "description": "要编辑的文件绝对路径" },
      "old_string": { "type": "string", "description": "要搜索的原始文本（必须唯一匹配）" },
      "new_string": { "type": "string", "description": "替换后的新文本" }
    }
  </parameters>
  <usage_notes>
    - old_string 必须在文件中唯一匹配，否则操作失败
    - 包含足够的上下文行（通常 3-5 行）确保唯一匹配
    - 不要替换不相关的代码，保持修改精确
    - 每次编辑只做一个独立的变更
  </usage_notes>
</tool>
```

### 3.4 `<skill_system>` — 扩展系统

**目的**：告诉模型如何按需加载专业技能

**构建规则**：
- 说明技能概念（不是工具，是 Prompt 命令）
- 列出可用技能及其触发条件
- 提供技能文件格式示例
- 说明激活模式（用户触发、条件激活、动态发现）

```xml
<skill_system>
  <concept>
    技能（Skill）是一种可扩展的 Prompt 命令，不是工具。
    技能通过 Markdown 文件（SKILL.md）定义，包含 Frontmatter 元数据、详细工作流指令和捆绑资源。
  </concept>

  <available_skills>
    <skill>
      <name>debug</name>
      <description>系统性调试：设置断点、检查变量、分析堆栈跟踪、定位 bug 根因</description>
      <whenToUse>当需要定位和修复代码中的 bug、理解运行时行为或分析崩溃时</whenToUse>
    </skill>
  </available_skills>

  <skill_format>
    [技能文件的标准格式模板]
  </skill_format>

  <activation_modes>
    [用户触发、条件激活、动态发现]
  </activation_modes>
</skill_system>
```

### 3.5 `<tool_usage_rules>` — 使用规则

**目的**：指导模型何时、如何、以什么顺序使用工具

**构建规则**：
- 按类别组织：通用规则 + 各工具类型的具体规则
- 规则应该具体、可执行
- 避免模糊的指导（如"谨慎使用"）

```xml
<tool_usage_rules>
  <general_rules>
    <rule>每次只调用一个工具，等待结果后再继续</rule>
    <rule>在执行破坏性操作前，先向用户确认</rule>
    <rule>使用 TodoWrite 跟踪超过 3 个步骤的复杂任务</rule>
    <rule>当任务匹配某个技能的 whenToUse 条件时，优先使用 Skill 工具加载该技能</rule>
  </general_rules>

  <file_operations>
    <rule>编辑文件前必须先 Read 读取当前内容</rule>
    <rule>使用 Edit 时确保 old_string 唯一匹配，必要时包含更多上下文行</rule>
  </file_operations>

  <shell_operations>
    <rule>启动 dev server 或长运行进程时设置 blocking: false</rule>
    <rule>记住 command_id 以便后续停止或重启进程</rule>
  </shell_operations>
</tool_usage_rules>
```

### 3.6 `<output_format>` — 输出格式

**目的**：让模型知道返回结果应该是什么格式

**构建规则**：
- 使用 XML 标签包裹结构（对 Claude 效果好）
- 使用 JSON 表示元数据（对解析友好）
- 提供完整的示例，不是描述

```xml
<output_format>
  <tool_result>
    工具执行结果格式：
    ```
    <tool_result>
      <title>操作摘要</title>
      <output>
        详细输出内容
      </output>
      <metadata>
        {"truncated": false, "lines": 150}
      </metadata>
    </tool_result>
    ```
  </tool_result>

  <skill_result>
    技能加载结果格式：
    ```
    <skill_content name="skill-name">
      # Skill: skill-name
      [技能内容]
      Base directory for this skill: file:///path/to/skill/
      <skill_files>
        <file>/path/to/bundled/resource.js</file>
      </skill_files>
    </skill_content>
    ```
  </skill_result>
</output_format>
```

### 3.7 `<interaction_patterns>` — 交互模式

**目的**：提供常见场景的应对模板

**构建规则**：
- 每个模式包含：名称、描述、示例
- 覆盖：任务分解、技能加载、并行处理、澄清提问
- 示例应该是完整的对话片段

```xml
<interaction_patterns>
  <pattern>
    <name>任务分解模式</name>
    <description>用户提出复杂需求时，先使用 TodoWrite 分解任务，再逐步执行</description>
    <example>
      用户："帮我重构这个模块"
      助手：
      1. 使用 TodoWrite 创建任务列表
      2. 读取当前代码理解结构
      3. 逐个执行重构步骤
      4. 运行测试验证
    </example>
  </pattern>

  <pattern>
    <name>澄清模式</name>
    <description>需求不明确时，主动提问获取必要信息</description>
    <example>
      用户："修复那个 bug"
      助手："请提供更多信息：
      - 哪个功能/模块出现 bug？
      - 具体的错误表现是什么？
      - 有错误日志或截图吗？"
    </example>
  </pattern>
</interaction_patterns>
```

### 3.8 `<security_and_safety>` — 安全约束

**目的**：建立不可逾越的安全边界

**构建规则**：
- 按类别组织：文件、命令、凭证
- 规则应该具体、可验证
- 包含"不要做什么"和"应该做什么"

```xml
<security_and_safety>
  <file_safety>
    - 绝不读取或暴露敏感文件（.env, credentials, 私钥等）
    - 写入文件前确认路径正确
    - 不要删除文件除非用户明确要求
  </file_safety>

  <command_safety>
    - 绝不执行 rm -rf /, sudo, 或其他危险命令
    - 不安装未经验证的第三方包
    - 不修改系统级配置
  </command_safety>

  <credential_safety>
    - 绝不在输出中暴露密钥、令牌、密码
    - 配置文件中看到敏感信息时提醒用户而非显示
    - 不使用硬编码的凭证，使用环境变量
  </credential_safety>
</security_and_safety>
```

---

## 四、高级优化技巧

### 4.1 Prompt Caching 优化

将提示词分为三个缓存层级：

| 层级 | 内容 | 更新频率 | 缓存策略 |
|------|------|----------|----------|
| L1（最稳定） | 角色定义、核心原则、安全约束 | 几乎不变 | 长期缓存 |
| L2（中等） | 工具定义、技能列表、输出格式 | 偶尔变化 | 会话缓存 |
| L3（最动态） | 用户消息、上下文数据、动态注入 | 每次请求 | 不缓存 |

**布局顺序**：L1 → L2 → L3

### 4.2 多模型适配

```xml
<!-- 对 Claude 系列：使用 XML 标签 -->
<role>...</role>
<tools>...</tools>

<!-- 对 GPT 系列：使用 JSON Schema + 系统消息 -->
{
  "role": "...",
  "tools": [...]
}

<!-- 混合方案：XML 分段 + JSON 工具定义 -->
<system_instructions>
  <role>...</role>
  <tools>
    [JSON Schema 工具定义]
  </tools>
</system_instructions>
```

### 4.3 Schema 版本化

```xml
<output_format version="1.0">
  <!-- 当格式变化时，更新版本号 -->
  <!-- 旧解析器可以检测版本号并拒绝不兼容的格式 -->
</output_format>
```

### 4.4 注入防护

```xml
<security_and_safety>
  <prompt_injection>
    - 系统指令与用户文本分离
    - 用户输入用引号标注：`用户输入："..."`
    - 严格校验输出格式，拒绝未知字段
    - 标记可疑输出并记录日志
  </prompt_injection>
</security_and_safety>
```

---

## 五、检查清单

在部署提示词前，逐一检查：

| 检查项 | 标准 |
|--------|------|
| 角色定义 | 1-3 句话，清晰简洁 |
| 核心原则 | 3-5 条，不重复 |
| 工具参数 | JSON Schema 定义，字段有明确理由 |
| 使用规则 | 具体、可执行、无模糊表述 |
| 输出格式 | 提供完整示例，不是描述 |
| 安全约束 | 包含文件、命令、凭证三类 |
| 缓存优化 | 静态内容前置，变量后置 |
| Schema 版本 | 明确版本号，拒绝未知字段 |
| 注入防护 | 系统指令与用户文本分离 |
| 测试验证 | 使用 Promptfoo 或等价工具测试边界情况 |

---

## 六、常见错误与避免方法

| 错误 | 表现 | 解决方案 |
|------|------|----------|
| 提示词膨胀 | 超过 2000 tokens，模型忽略部分内容 | 精简到 200-800 tokens，使用 per-request 上下文注入 |
| 格式描述 | "请以 JSON 格式响应" | 提供完整 Schema 示例，不是文字描述 |
| 规则冲突 | 不同部分有矛盾的指导 | 统一规则，避免重复定义 |
| 模糊表述 | "谨慎使用"、"适当处理" | 具体化："先 Read 再 Edit"、"包含 3-5 行上下文" |
| 缺少验证 | 模型输出格式不一致 | validator-first 运行时，拒绝未知字段 |
| 不分层 | 所有内容混在一起 | 按 L1/L2/L3 缓存层级组织 |

---

## 七、各主流模型提示词格式适配指南

### 7.1 模型格式偏好总结表

| 模型家族 | 输入推荐 | 输出推荐 | 性能差异 | 特殊要求 |
|----------|----------|----------|----------|----------|
| **Claude** | **XML** | XML/JSON | +30% XML | 利用 prompt caching，避免攻击性语言 |
| **GPT** | Markdown/JSON | **JSON** | 原生 JSON 模式 | 明确数字约束 |
| **Gemini** | Markdown/JSON | **JSON** | +10% JSON | 顶部紧密封定义格式 |
| **DeepSeek** | 结构化文本 | **JSON** | 需明确格式指令 | `format: 'json'` 约束输出 |
| **GLM/Z.ai** | Markdown/XML | JSON | 两者均可 | 支持工具调用和 agentic 工作流 |
| **Kimi** | **JSON** | **JSON** | +40% JSON | 避免 XML |
| **Grok** | 任意 | 任意 | 0% 差异 | 根据下游需求选择 |
| **LLaMA** | Alpaca/ChatML | JSON | ~60% 两者 | 使用训练对话格式 |
| **Qwen** | Markdown | JSON | 都不理想 | 需要 few-shot 示例 |
| **Mistral** | Markdown/JSON | **JSON** | 中等 | 客户端验证 |
| **Minimax** | Markdown/JSON | JSON | 良好 | 标准 API 格式 |
| **Doubao** | 结构化文本 | JSON | 良好 | 中文优化 |
| **MiMo** | XML/Markdown | JSON | 良好 | agentic 优化，1M 上下文 |

---

### 7.2 DeepSeek（深度求索）

**发布背景**：
- 开发者：DeepSeek-AI（幻方量化旗下）
- 最新旗舰：DeepSeek-V3.1、DeepSeek-R1-0528、DeepSeek-V3.2-Speciale（2026 年初发布）
- 核心特点：MoE（Mixture of Experts）架构，671B 总参数，660B 激活参数
- 上下文窗口：128K tokens

**技术特点**：
- **混合模式**：V3.1 支持 Thinking（CoT）和 Non-Thinking（直接回答）两种模式
- **"Thinking in Tool-Use"**：2026 年模型集成了工具使用中的推理能力，允许 AI 代理在工具调用过程中进行深度推理
- **成本优势**：以极低的 API 价格提供接近前沿模型的性能

**提示词最佳实践**：

| 维度 | 推荐 |
|------|------|
| 输入格式 | 结构化文本（Task/Context/Constraints/Output format/Verification 五段式） |
| 输出格式 | **JSON**（需明确指定 `"format: 'json'"` 约束输出） |
| 性能差异 | 需明确格式指令，通过 Ollama 传递 `format: 'json'` 可消除 markdown 包装和解释性前缀 |
| 注意事项 | 避免要求隐藏的思维链，应要求简洁的基本原理或最终解释 |

**示例**：
```
Task: 分析以下代码的架构模式

Context: [代码内容]

Constraints:
- 最多 3 个要点
- 关注设计模式而非实现细节

Output format:
{"patterns": [{"name": "", "description": "", "confidence": "high/medium/low"}]}

Verification:
Before finalizing, check the answer for accuracy and format compliance.
```

**JSON/API 提示词模板**（来自 DeepSeek 官方文档推荐）：
```
Return valid JSON only. Do not include markdown or commentary.

Text:
[PASTE TEXT]

JSON structure:
{
  "summary": "",
  "sentiment": "",
  "action_items": [],
  "risk_level": ""
}
```

**性能指标**：
- SWE-bench Verified：接近 Claude Opus 4.6 水平
- 2026 年被定位为"后端 AI 代理和大规模编码项目的首选引擎"
- 成本效益比（cost-to-performance ratio）行业领先

---

### 7.3 GLM / ChatGLM（智谱 AI / Z.ai）

**发布背景**：
- 开发者：智谱 AI（Tsinghua University 背景），后升级为 Z.ai
- 最新旗舰：GLM-5（2026 年发布）
- 核心特点：All Tools 架构，支持广泛的工具调用和 agentic 工作流
- 上下文窗口：200K tokens（GLM-5）

**技术特点**：
- **GLM-5**：2026 年 LLM 排行榜前 10 的新进入者，在 agentic 工程管道中表现强劲
- **能力指数**：AA Index 得分 50，排名全球第 4
- **工具调用**：支持广泛的工具集成，包括代码执行、搜索、API 调用等
- **开源策略**：通过开放源码 democratizing cutting-edge LLM technologies

**提示词最佳实践**：
- **输入格式**：Markdown 或 XML 均可，对结构化格式有良好支持
- **输出格式**：JSON
- **对齐数据**：使用 in-house 标注数据和第三方专有数据，严格质量控制
- **评分维度**：安全性、事实性、相关性、有用性、人类偏好

**示例**（ChatML 格式）：
```
<|system|>
You are a helpful assistant with tool calling capabilities.
<|user|>
Analyze the following code for potential bugs.
<|assistant|>
```

**性能指标**：
- GLM-5 排名全球第 4（AA Index: 50）
- 在 agentic engineering pipelines 中定位强劲
- 支持工具调用和自主代理工作流

---

### 7.4 Minimax

**发布背景**：
- 开发者：MiniMax AI
- 最新旗舰：Minimax 2.5（minimax-2.5-turbo）
- 训练能耗：40-60 GWh（与 Anthropic Claude 和 Google Gemini Ultra 相当）
- 上下文窗口：支持长上下文处理

**技术特点**：
- **Hybrid Attention 效率**：Minimax-M1-80k 在混合注意力效率方面领先
- **多模态能力**：支持文本生成和视频生成（Hailuo 引擎）
- **推理能力**：在数学、编码和复杂问题解决任务中表现优秀
- **RL 训练**：通过强化学习训练实现接近 OpenAI-o1 的性能

**提示词最佳实践**：
- **输入格式**：标准 Markdown 或 JSON，与 OpenAI API 兼容
- **输出格式**：JSON
- **API 格式**：兼容 OpenAI 风格的 API 调用

**示例**：
```python
import os
from minimax import MiniMax

os.environ['MINIMAX_API_KEY'] = 'your_api_key_here'
client = MiniMax(api_key=os.getenv('MINIMAX_API_KEY'))

response = client.chat.completions.create(
    model="minimax-2.5-turbo",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Explain quantum computing in simple terms."}
    ],
    temperature=0.7,
    max_tokens=500
)
```

**性能指标**：
- MiniMax-M1-80k 在混合注意力效率方面领先
- 推理性能接近 OpenAI-o1
- 在数学、编码和复杂问题求解中表现优秀

---

### 7.5 Doubao（豆包，字节跳动）

**发布背景**：
- 开发者：ByteDance（字节跳动）
- 最新版本：Doubao-1.5-pro（2025 年发布）
- 使用规模：2026 年 3 月日均 token 使用量超过 120 万亿，三个月内翻倍，比首次发布增长 1000 倍
- 用户规模：2026 年 Q1 MAU 3.45 亿，中国 AI 原生应用第一

**技术特点**：
- **Seed-LLM 研究**：字节跳动 Seed 团队研究基于离散状态扩散的大规模语言模型
- **Seed Diffusion**：推理速度 2,146 token/s，比自回归模型快 5.4 倍
- **企业应用**：Volcengine 平台上累计使用超过 1 万亿 token 的企业客户从 100 家增长到 140 家
- **研究基础**：被多项学术研究选为任务模型（如 prompt 优化研究）

**提示词最佳实践**：
- **输入格式**：结构化文本，中文优化
- **输出格式**：JSON
- **温度设置**：学术研究中使用 temperature=0 确保确定性输出
- **中文能力**：作为中国市场的领先产品，中文理解和生成能力优秀

**性能指标**：
- 2026 年 Q1 MAU：3.45 亿（中国第一）
- 平均使用频率：54.8 次/月
- 日均 token 使用量：120 万亿+
- 在 prompt 优化研究中被选为标准任务模型

---

### 7.6 Xiaomi MiMo（小米）

**发布背景**：
- 开发者：Xiaomi（MiMo 团队）
- 最新旗舰：MiMo-V2-Pro、MiMo-V2.5、MiMo-V2.5-Pro（2026 年发布）
- 发布日期：2026 年 3 月 18 日
- 核心特点：专为 AI 代理（Agent）时代设计的模型

**技术特点**：
- **万亿参数**：总参数超过 1T，激活参数 42B（约为 MiMo-V2-Flash 的 3 倍）
- **Hybrid Attention**：混合注意力机制，混合比例从 5:1 提升到 7:1
- **1M Token 上下文**：支持完整的 100 万 token 上下文窗口，最大输出 131K tokens
- **MTP（Multi-Token Prediction）**：轻量级多 token 预测层实现快速生成
- **Agentic 优化**：在更广泛的代理任务上进行后训练扩展，上下文窗口从 32K 渐进扩展到 1M tokens
- **RL 和 MOPD**：使用强化学习和多模态偏好优化（MOPD）增强现实世界推理和感知

**MiMo 系列分化**：
- **MiMo-V2.5（Omni）**：多模态专家，支持视觉和音频原生处理
- **MiMo-V2.5-Pro（Agent）**：代理专家，专注于长周期自主任务执行

**提示词最佳实践**：
- **输入格式**：XML 或 Markdown 均可，对 agentic 任务有深度优化
- **输出格式**：JSON
- **上下文窗口**：1M tokens 支持完整的代码库和扩展自主会话
- **Token 效率**：实现同等性能只需 Claude Opus 4.6、Gemini 3.1 Pro、GPT-5.4 的 40-60% token 消耗
- **自我纠正**：具有"自我纠正"纪律，能够在自主执行过程中诊断和修复回归

**性能指标**：
- SWE-bench Pro：57.2 分
- ClawEval：63.8 分
- τ3-Bench：72.9 分
- 与 Claude Opus 4.6 和 GPT-5.4 在大多数 agentic 评估中相当
- 全球排名第 8，中国 LLM 中排名第 2（Artificial Analysis Intelligence Index）
- 成本约为 Claude Opus 4.6 的五分之一
- 输入成本：$1/百万 tokens，输出成本：$3/百万 tokens
- 输出速度：62 tokens/sec，首次 token 延迟：2.48s

**代码示例**（通过 WisGate 统一 API）：
```python
# MiMo-V2-Pro 专为复杂多步推理、工具使用和长周期任务执行设计
# 确认模型 ID 和定价：wisgate.ai/models
```

---

## 八、参考来源

### 源码分析
- **Claude Code**: src/skills/, src/tools/, src/constants/prompts.ts, src/constants/tools.ts
- **OpenCode**: `packages/opencode/src/skill/`, `packages/opencode/src/tool/`, `packages/opencode/src/mcp/`, `packages/opencode/src/config/`

### 行业最佳实践（2026）
- **XML 对 Claude 效果最佳**: 15-20% 更好的指令遵循（Anthropic 官方推荐）
- **Schema 先于 Prompt**: 像 API 设计一样设计输出格式
- **Prompt Caching**: 静态内容前置可节省 90% 成本和 85% 延迟
- **Validator-first 运行时**: 模型返回的一切都是不可信的，必须经过校验
- **小步迭代**: 不要要求大段输出，分解为小任务逐个完成

### 联网搜索验证来源（2026 年 5 月）
- **12 模型基准测试**: Roy Philip - JSON vs. XML: A Data-Driven Analysis of LLM Parsing Efficiency (royphilip.xyz)
- **学术研究**: arXiv 2408.02442v1 - Let Me Speak Freely? A Study on the Impact of Format Restrictions on Performance of LLMs
- **行业分析**: Lakera AI - The Ultimate Guide to Prompt Engineering in 2026
- **实践指南**: Thomas Wiegold - Prompt Engineering Best Practices 2026
- **DeepSeek 官方**: deepseek.ai/blog/deepseek-guide-2026
- **DeepSeek 指南**: bentoml.com/blog/the-complete-guide-to-deepseek-models
- **GLM 研究**: arXiv 2406.12793v1 - ChatGLM: A Family of Large Language Models from GLM-130B to GLM-4 All Tools
- **Minimax 分析**: siliconflow.com/articles/en/the-best-minimaxai-models-in-2025
- **Doubao 分析**: leonliao.substack.com - Doubao's Paid Plans: China's First Stress Test for 2C LLM
- **MiMo 规格**: juheapi.com/blog/mimo-v2-pro-complete-guide-xiaomi-flagship-ai-agent-2026
- **MiMo 官方**: mimo.xiaomi.com/mimo-v2-pro
- **LLM 排行榜**: robotmunki.com/blog/llm-landscape (2026 年 4 月)
- **MiMo 开源**: venturebeat.com - Open source Xiaomi MiMo-V2.5 and V2.5-Pro

---

*最后更新: 2026-05-08*
