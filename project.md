基于你的需求，我帮你系统性地完善了整体架构设计。以下是完整的方案，涵盖项目定位、架构蓝图、技术选型、AI能力集成以及Trae开发环境配置。

---

## 一、项目定位与产品画像

**项目类型**：教育行业AI前沿资讯内网平台

**目标用户**：教师、职工、学生（大多对AI了解有限，需要低门槛的AI体验）

**核心定位**：不只是内容展示网站，而是集“智能采集→自动编发→AI交互→消息推送→公文辅助”于一体的教育AI工作台。

**访问规模**：日活100-200人，轻量级部署即可。


## 二、总体架构蓝图

结合你的需求，我设计了以下五层架构：

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户层（浏览器端）                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ 资讯浏览前台 │  │ 内容管理后台 │  │ PageAgent AI 交互面板   │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│                              ↓ CAS 统一认证拦截                    │
├─────────────────────────────────────────────────────────────────┤
│                        接入层（Nginx）                            │
│        反向代理 / 静态资源 / HTTPS / 负载均衡（预留）               │
├─────────────────────────────────────────────────────────────────┤
│                        应用层（Node.js / Python 后端）             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐│
│  │文章管理API│ │订阅推送API│ │CAS认证API│ │Agent调度 │ │企微推送 ││
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └────────┘│
│                      ↑ 预留：本地公文写作Agent接口                  │
├─────────────────────────────────────────────────────────────────┤
│                        智能体层（内容生产引擎）                       │
│  ┌──────────────────────┐      ┌──────────────────────────────┐  │
│  │ WorkBuddy / Hermes   │ ───→ │ 草稿审核队列 → 编辑 → 发布    │  │
│  │（信息采集→解读→草稿）  │      └──────────────────────────────┘  │
│  └──────────────────────┘                                        │
├─────────────────────────────────────────────────────────────────┤
│                        数据层                                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │PostgreSQL │ │  Redis   │ │  MinIO   │ │ 向量数据库（预留）│   │
│  │  主数据   │ │ 缓存/会话 │ │ 文件存储  │ │ RAG知识库/公文   │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**架构特点**：
- **安全优先**：所有请求经CAS认证 + Nginx SSL终结 + 数据库加密存储
- **可扩展**：微服务化API设计，预留向量数据库和本地Agent接口
- **灵活**：前后端分离，AI能力即插即用
- **美观**：现代简约设计风格，符合教育场景审美


## 三、核心模块详细设计

### 3.1 PageAgent集成方案

PageAgent是阿里巴巴开源的纯前端GUI Agent库，它的核心原理是“DOM文本化 + LLM推理 + DOM操作执行”，不依赖后端、不需要截图、不需要无头浏览器。用户用自然语言描述任务，Agent自动解析并执行点击、输入、选择、滚动等DOM操作。

对于你的教育资讯平台，PageAgent可以为**非技术背景的教师和学生**提供以下价值：

| 场景 | 自然语言指令示例 | PageAgent执行效果 |
|------|----------------|------------------|
| 智能导航 | “帮我找到上周发布的所有AI政策文件” | 自动设置筛选条件并搜索 |
| 表单填写 | “我要订阅‘高等教育’分类的每日推送” | 自动定位订阅表单并填写提交 |
| 文章查找 | “找一下关于中小学AI教育的通知” | 自动搜索并跳转到结果页 |
| 无障碍辅助 | 结合语音识别，视障用户说出指令即可操作 | 直接操作DOM完成页面交互 |

**集成方式**：
```javascript
import { PageAgent } from 'page-agent'

const agent = new PageAgent({
  model: 'qwen-plus',              // 或 deepseek-chat
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: 'YOUR_API_KEY',
  language: 'zh-CN',
  instructions: {                   // 注入教育领域的业务规则
    system: `你是教育AI资讯平台的智能助手。
规则：
- 优先帮助用户查找AI教育政策、通知、公告类内容
- 遇到分类筛选时，优先使用“高等教育”“基础教育”“AI政策”等标签
- 操作前先确认用户意图，避免误操作`
  }
})

// 弹出交互面板让用户自行输入
agent.panel.show()
```

PageAgent提供了Human-in-the-Loop机制，会在遇到歧义时主动询问用户确认，非常适合对AI不熟悉的教师和学生使用。同时它兼容OpenAI、Claude、DeepSeek、Qwen、Gemini等多种模型，也支持Ollama本地离线运行，数据不离开用户端，安全性有保障。

### 3.2 CAS统一身份认证

你提到需要与现有CAS做统一身份认证。CAS（Central Authentication Service）是耶鲁大学发起的开源单点登录协议，核心组件包括CAS Server（认证中心）和CAS Client（集成于各Web应用）。

如果你的学校/机构已有CAS Server，集成流程如下：
1. 在现有CAS Server中注册你的网站为合法Client
2. 网站后端作为CAS Client，实现票据验证逻辑
3. 前端通过路由守卫拦截未认证请求，重定向到CAS登录页
4. 登录成功后，CAS Server返回Service Ticket（ST），后端验证后建立本地会话

如果还没有CAS Server，可以考虑使用**Casdoor**——一个开源的身份和访问管理（IAM）平台，Web UI完善，支持OAuth 2.0、OIDC、SAML、CAS、LDAP等多种协议，也支持WebAuthn、TOTP多因素认证。它可以作为独立的CAS Server部署，提供完整的用户管理界面。

### 3.3 智能体内容采集与发布流水线

你提到希望由WorkBuddy、Hermes等个人智能体从互联网采集、解读、编辑然后发布。这一块我建议设计为“**半自动内容生产流水线**”：

**Step 1：定时采集**（WorkBuddy / Hermes执行）
- WorkBuddy支持将关键词分析流程固化为定时任务，每日自动执行数据采集、清洗、归因，并推送报告
- 配置监控的关键词：“AI教育政策”“教育部人工智能”“中小学AI”“高校AI通知”等
- 采集源：教育部官网、科技部官网、各省教育厅、主流AI资讯站

**Step 2：AI解读与草稿生成**
- 智能体对采集到的内容进行解读：提取关键信息、生成摘要、标注政策要点
- 自动生成文章草稿，存入网站的“待审核队列”
- WorkBuddy支持配置私有知识库语义增强，可以导入教育领域的术语和业务语境，让解读更贴合教育场景

**Step 3：人工审核与发布**
- 编辑人员（你或团队成员）在后台审核草稿，修改润色后正式发布
- 这样既保证了内容的专业性，又大幅降低了人工采集筛选的工作量

### 3.4 订阅推送与企业微信集成

企业微信推送的核心步骤如下：
1. **获取access_token**：通过企业ID（corpid）和应用Secret（corpsecret）获取
2. **配置应用**：在企业微信管理后台创建自建应用，配置可见范围
3. **发送消息**：调用 `https://qyapi.weixin.qq.com/cgi-bin/message/send` 接口

推送时机建议：
- 每日定时推送（如早上9:00），汇总前24小时的新发布文章
- 重要政策/通知即时推送
- 推送内容格式：图文消息，包含标题、摘要、原文链接

**订阅管理功能**：
- 用户可在网站上选择订阅的分类（AI政策、通知公告、行业动态等）
- 选择推送频率（每日/每周/即时）
- 后端记录用户订阅偏好，推送时精准匹配


## 四、技术选型建议

| 层级 | 推荐方案 | 备选方案 | 选择理由 |
|------|---------|---------|---------|
| **前端框架** | Vue 3 + Vite + TypeScript | React + Next.js | Vue上手快，适合Trae AI辅助开发，生态完善 |
| **UI组件库** | Element Plus / Ant Design Vue | Naive UI | 成熟稳定，适合后台管理类应用 |
| **后端框架** | Node.js + Express/Fastify | Python + FastAPI | 与Trae协作顺畅，全栈JavaScript降低上下文切换 |
| **数据库** | PostgreSQL | MySQL | 功能更丰富，对JSON字段支持好（适合存储文章元数据） |
| **缓存/会话** | Redis | - | 存储CAS会话、API限流、推送队列 |
| **文件存储** | MinIO | 阿里云OSS | 开源、S3兼容，适合内网部署 |
| **CAS集成** | 现有CAS + Node.js Client | Casdoor自建 | 优先对接现有CAS，若无则Casdoor自建 |
| **容器化** | Docker + Docker Compose | - | 简化部署，便于Trae理解和生成配置 |
| **反向代理** | Nginx | Caddy | 经典方案，SSL终结、静态资源服务 |


## 五、Trae开发环境配置建议

既然主要由Trae进行开发，以下配置能让Trae更好地理解项目并产出高质量代码：

### 5.1 推荐启用的Trae技能

| 技能名称 | 用途 |
|---------|------|
| **项目架构初始化** | 帮Trae生成完整的项目脚手架（前端Vue3 + 后端Express） |
| **数据库设计与迁移** | 生成PostgreSQL表结构和Prisma/TypeORM模型 |
| **API接口设计** | 生成RESTful API路由和Controller代码 |
| **CAS认证集成** | 生成CAS Client配置和认证中间件 |
| **企业微信推送** | 生成企微access_token管理和消息发送模块 |
| **前端页面生成** | 根据需求描述生成Vue组件页面 |
| **Docker部署配置** | 生成docker-compose.yml和Dockerfile |

### 5.2 推荐使用的插件/工具

**开发期**：
- **Prisma**：Node.js的ORM，类型安全，Trae生成数据库操作代码非常顺手
- **Zod**：TypeScript数据校验，API入参验证
- **Vite**：前端构建工具，热更新快
- **pnpm**：高效的包管理器

**部署期**：
- **Docker Compose**：一键启动所有服务
- **Nginx**：配置SSL和静态资源缓存
- **PM2**：Node.js进程守护

### 5.3 给Trae的Prompt建议

为了让Trae产出更符合你需求的代码，建议在每次对话中明确以下信息：
- “这是一个教育行业的内部AI资讯平台”
- “需要集成阿里PageAgent，让用户可以用自然语言操作页面”
- “需要与现有CAS做统一身份认证，用户必须先登录才能访问”
- “前端要美观、简洁，适合教育场景，面向非技术用户”
- “后端要支持订阅推送，推送渠道是企业微信”


## 六、分阶段落地建议

考虑到你是逐步构建，建议分三个阶段推进：

**第一阶段（MVP，约1-2周）**：
- 搭建基础网站框架（Vue3 + Express）
- 实现文章展示、分类、搜索功能
- 集成CAS认证（最简版本）
- 管理员后台：文章手动发布

**第二阶段（AI能力集成，约2周）**：
- 前端集成PageAgent，提供AI交互面板
- 配置WorkBuddy/Hermes定时采集任务
- 搭建“采集→草稿→审核→发布”半自动流水线
- 实现企业微信订阅推送

**第三阶段（扩展能力，按需推进）**：
- 集成向量数据库，支持RAG语义搜索
- 开发本地公文写作Agent（可基于Ollama本地部署DeepSeek等模型）
- 个性化推荐（基于用户阅读历史）
- 数据统计看板


## 七、安全注意事项

1. **CAS票据安全**：所有CAS通信必须走HTTPS，票据验证使用SSL加密
2. **API密钥管理**：LLM API Key、企业微信Secret等敏感信息通过环境变量注入，不入库
3. **数据库加密**：用户敏感信息（如有）加密存储
4. **SQL注入防护**：使用ORM的参数化查询
5. **XSS防护**：前端文章内容渲染时做HTML转义
6. **访问控制**：前后端双重校验，CAS认证 + RBAC权限模型
7. **日志审计**：记录关键操作日志（登录、发布、推送等）


## 八、扩展预留接口

为后续集成本地公文写作Agent等能力，建议预留以下接口：

```typescript
// Agent调度接口（预留）
interface AgentTask {
  type: 'document_writing' | 'data_analysis' | 'content_summary'
  input: Record<string, any>
  callback?: string  // 结果回调URL
}

// 向量数据库接口（预留）
interface VectorStore {
  embed(text: string): Promise<number[]>
  search(query: string, topK: number): Promise<Document[]>
  addDocument(doc: Document): Promise<void>
}
```


## 总结

以上是一个完整的技术架构方案，覆盖了你提出的所有核心需求：PageAgent AI交互、CAS统一认证、智能体内容采集、企业微信订阅推送，并预留了公文写作等扩展能力。整体设计遵循安全、可扩展、灵活、美观的原则，同时考虑了Trae作为主力开发工具的实际场景。

---

## 九、项目开发计划

### 9.1 计划目标与边界

**计划目标**：
- 将当前架构方案转化为可执行的项目计划，指导后续研发、测试、上线与运维协同
- 明确阶段目标、里程碑、交付物、验收标准、风险与资源配置
- 保障“先治理后建设”：先完成规范、流程、权限与安全基线，再进入规模化开发

**任务边界**：
- 本计划仅覆盖“项目设计与管理”工作，不包含代码实现、不包含环境部署执行
- 本计划默认在内网环境运行，统一身份由CAS接管，消息通道为企业微信
- 知识库相关功能在ai_xy项目中实现，本项目仅负责与ai_xy的交互

### 9.2 工作分解结构（WBS）

| WBS编码 | 工作包 | 关键输出 | 责任角色 |
|--------|--------|----------|----------|
| WBS-01 | 立项与需求冻结 | 需求清单、范围说明、优先级矩阵 | 产品负责人、业务代表 |
| WBS-02 | 总体架构与技术基线确认 | 架构基线、技术栈基线、安全基线 | 架构师、后端负责人 |
| WBS-03 | 数据模型与接口设计 | ER模型、API契约、鉴权流程图 | 后端负责人、DBA |
| WBS-04 | 业务流程设计 | 采集→草稿→审核→发布流程、订阅推送流程 | 产品负责人、运营编辑 |
| WBS-05 | 集成方案设计 | CAS集成设计、PageAgent接入设计、企微推送设计 | 架构师、后端负责人 |
| WBS-06 | 测试与验收设计 | 测试策略、验收标准、回归清单 | 测试负责人、产品负责人 |
| WBS-07 | 运维与上线方案设计 | 发布策略、监控方案、应急预案、回滚方案 | 运维负责人、后端负责人 |
| WBS-08 | 项目治理机制设计 | 迭代节奏、评审机制、变更管理、风险台账 | 项目经理 |

### 9.3 阶段计划与里程碑

| 阶段 | 阶段目标 | 里程碑（M） | 入场条件 | 退出条件 |
|------|----------|-------------|----------|----------|
| P0 启动阶段 | 完成需求收敛与范围冻结 | M1：需求基线评审通过 | 业务目标明确 | 需求冻结文档签署 |
| P1 方案阶段 | 完成架构、数据、接口、安全设计 | M2：总体方案评审通过 | M1达成 | 架构包与设计包签署 |
| P2 计划阶段 | 完成迭代计划与资源排期 | M3：迭代计划发布 | M2达成 | 迭代排期、RACI、风险台账就绪 |
| P3 准备阶段 | 完成开发前门禁设计（Definition of Ready） | M4：开发准入评审通过 | M3达成 | 所有Epic满足DoR，进入开发队列 |
| P4 验收阶段 | 完成上线前验收方案与运行手册 | M5：上线准入评审通过 | M4达成 | 验收标准、回滚预案、值守机制确认 |

### 9.4 迭代规划（用于后续开发执行）

| 迭代 | 业务主题 | 覆盖模块 | 计划产出（设计件） |
|------|----------|----------|--------------------|
| Sprint 1 | 平台基础能力 | 登录认证、资讯展示、后台管理基础 | 用例清单、页面流程图、接口清单、权限矩阵 |
| Sprint 2 | 智能内容生产 | 采集任务、草稿队列、审核发布 | 任务编排图、状态机定义、审校规则 |
| Sprint 3 | AI交互与消息触达 | PageAgent面板、订阅中心、企微推送 | 指令意图集、推送策略、失败补偿策略 |
| Sprint 4 | 稳定性与可运营 | 监控告警、审计日志、统计看板预留 | 监控指标字典、告警分级、运营看板指标定义 |

### 9.5 交付物清单（落地件）

| 类别 | 交付物 | 验收要点 |
|------|--------|----------|
| 管理类 | 项目章程、范围说明、RACI矩阵、风险台账 | 角色清晰、边界清晰、风险可追踪 |
| 架构类 | 系统上下文图、部署拓扑图、安全域划分图 | 分层清晰、链路闭环、安全边界明确 |
| 数据类 | 数据字典、ER图、索引策略草案 | 主实体完整、关系可追踪、查询可优化 |
| 接口类 | API清单、字段契约、错误码规范 | REST语义统一、字段命名统一、错误码可治理 |
| 流程类 | 审核发布流程、推送编排流程、异常处理流程 | 节点可执行、责任可定位、异常可恢复 |
| 运维类 | 上线检查单、回滚预案、监控告警方案 | 可观测、可回滚、可值守 |

### 9.6 验收标准（设计阶段）

1. 需求一致性：所有核心需求均映射到对应模块与接口，不存在“需求孤岛”
2. 架构可实施性：关键链路（CAS、采集发布、订阅推送、PageAgent）具备端到端设计闭环
3. 安全合规性：鉴权、密钥管理、日志审计、输入校验、最小权限模型均有明确设计
4. 运维可用性：具备监控指标、告警阈值、故障分级与回滚路径
5. 交付完整性：交付物清单项全部归档，且通过评审签署

### 9.7 风险与应对策略

| 风险项 | 风险描述 | 触发信号 | 应对策略 |
|--------|----------|----------|----------|
| CAS联调风险 | 现网CAS策略不一致导致登录链路中断 | 登录成功率异常下降 | 提前做协议对齐，保留联调窗口与回退策略 |
| 智能体内容质量风险 | 自动采集结果噪声高、误报高 | 草稿驳回率持续升高 | 增加来源白名单、关键词治理、人工抽检阈值 |
| 推送稳定性风险 | 企业微信接口限流或偶发失败 | 推送失败率升高 | 增加重试、幂等、失败队列与补发机制 |
| 需求蔓延风险 | 迭代中持续新增需求导致失控 | 变更单激增 | 启用变更委员会，执行范围基线与冻结机制 |
| 安全合规风险 | 密钥管理不当、权限边界不清晰 | 审计发现高危项 | 强制环境变量托管、分级授权、审计追踪 |

### 9.8 项目治理与协作机制

- 评审机制：需求评审、架构评审、安全评审、上线评审四级门禁
- 变更机制：所有范围变更必须走变更单，评估影响后进入下一迭代
- 质量机制：以“契约先行”为原则，接口先评审后开发
- 会议机制：周计划会、周风险会、里程碑复盘会
- 度量机制：需求交付率、缺陷逃逸率、关键链路可用性、推送成功率

### 9.9 下一步执行清单（承接开发前）

1. 输出《需求基线与优先级矩阵》并完成签署
2. 输出《接口契约总表》并完成跨团队评审
3. 输出《安全基线检查表》并完成合规确认
4. 输出《里程碑排期与责任分工表》并完成资源锁定
5. 输出《开发准入清单（DoR）》并完成门禁检查

## 十、数据库建设指南（全局版）

### 10.1 建设目标

- 保持现有 API 协议稳定，仅替换存储实现层
- 先满足 MVP 的文章发布与订阅推送，再逐步扩展智能体与审计能力
- 采用 PostgreSQL 作为唯一主库，Redis 仅做缓存与队列，不承载业务主数据

### 10.2 建模原则

- 主键统一使用 `uuid`，减少跨系统合并冲突
- 所有业务表统一包含 `created_at`、`updated_at`，时间类型使用 `timestamptz`
- 枚举状态优先使用 `varchar + check`，降低迁移成本
- 明细关系优先使用外键约束，跨服务弱关联使用业务键
- 读写热点字段必须前置索引设计，避免上线后补救式加索引

### 10.3 分阶段落地范围

**P1（当前落地）**
- `articles`
- `subscriptions`

**P2（内容生产闭环）**
- `article_sources`（采集源）
- `article_drafts`（草稿池）
- `review_tasks`（审核任务）

**P3（运营与合规）**
- `push_jobs`、`push_records`（推送编排与回执）
- `audit_logs`（关键操作审计）
- `api_idempotency_keys`（幂等防重）

### 10.4 当前核心表设计（已实现）

#### articles

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | uuid | PK | 文章主键 |
| created_by_user_id | varchar(64) | index | 创建人用户ID |
| title | varchar(180) | not null | 标题 |
| summary | varchar(400) | not null | 摘要 |
| content | text | not null | 正文 |
| category | varchar(40) | not null | 分类 |
| tags | text[] | not null default '{}' | 标签数组 |
| status | varchar(20) | not null check | draft/published |
| author | varchar(80) | not null | 展示作者 |
| published_at | timestamptz | index | 发布时间 |
| created_at | timestamptz | not null | 创建时间 |
| updated_at | timestamptz | not null | 更新时间 |

索引：
- `idx_articles_created_by_user_id(created_by_user_id)`
- `idx_articles_status(status)`
- `idx_articles_published_at(published_at desc)`

#### subscriptions

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | uuid | PK | 订阅主键 |
| user_id | varchar(64) | unique | 用户ID（当前每用户一条） |
| categories | text[] | not null default '{}' | 订阅分类 |
| frequency | varchar(20) | not null check | daily/weekly/instant |
| qywx_user_id | varchar(128) | not null | 企微接收人 |
| enabled | boolean | not null default true | 是否启用 |
| created_at | timestamptz | not null | 创建时间 |
| updated_at | timestamptz | not null | 更新时间 |

### 10.5 推荐扩展表（与全局架构对齐）

#### 用户与权限域

`users`
- `id uuid pk`
- `cas_user_id varchar(128) unique not null`
- `username varchar(64) not null`
- `display_name varchar(80) not null`
- `status varchar(20) not null`
- `last_login_at timestamptz null`
- `created_at/updated_at timestamptz not null`

`roles`
- `id uuid pk`
- `code varchar(40) unique not null`
- `name varchar(80) not null`

`user_roles`
- `user_id uuid fk(users.id)`
- `role_id uuid fk(roles.id)`
- 复合主键 `(user_id, role_id)`

#### 内容生产域

`article_drafts`
- `id uuid pk`
- `source_type varchar(40) not null`
- `source_url text null`
- `title varchar(180) not null`
- `summary text not null`
- `content text not null`
- `status varchar(20) not null`
- `reviewer_user_id uuid null`
- `reviewed_at timestamptz null`
- `published_article_id uuid null fk(articles.id)`
- `created_at/updated_at timestamptz not null`

`review_tasks`
- `id uuid pk`
- `draft_id uuid not null fk(article_drafts.id)`
- `assignee_user_id uuid not null`
- `task_status varchar(20) not null`
- `due_at timestamptz null`
- `created_at/updated_at timestamptz not null`

#### 推送与通知域

`push_jobs`
- `id uuid pk`
- `trigger_type varchar(20) not null`
- `trigger_ref varchar(64) null`
- `status varchar(20) not null`
- `scheduled_at timestamptz null`
- `started_at timestamptz null`
- `finished_at timestamptz null`
- `created_at/updated_at timestamptz not null`

`push_records`
- `id uuid pk`
- `job_id uuid not null fk(push_jobs.id)`
- `subscription_id uuid not null fk(subscriptions.id)`
- `channel varchar(20) not null`
- `target_id varchar(128) not null`
- `send_status varchar(20) not null`
- `provider_msg_id varchar(128) null`
- `error_message text null`
- `created_at timestamptz not null`

#### 审计与平台治理域

`audit_logs`
- `id uuid pk`
- `operator_user_id varchar(64) not null`
- `action varchar(80) not null`
- `resource_type varchar(40) not null`
- `resource_id varchar(64) not null`
- `request_id varchar(64) null`
- `ip inet null`
- `user_agent text null`
- `before_data jsonb null`
- `after_data jsonb null`
- `created_at timestamptz not null`

`api_idempotency_keys`
- `id uuid pk`
- `idempotency_key varchar(128) unique not null`
- `api_path varchar(120) not null`
- `request_hash varchar(128) not null`
- `response_code int not null`
- `response_body jsonb not null`
- `expired_at timestamptz not null`
- `created_at timestamptz not null`

### 10.6 索引与约束策略

- 高频过滤字段必须单列索引：`status`、`published_at`、`created_by_user_id`
- 组合索引按查询路径建设：`(status, published_at desc)` 用于文章列表
- 所有外键字段都需要索引，避免关联查询退化
- 字段上限长度与 API 校验保持一致，防止应用层/库层约束错位
- 幂等、业务唯一约束使用唯一索引保障最终一致性

### 10.7 迁移与发布流程

1. 迁移脚本采用增量命名：`sql/001_init.sql`、`sql/002_xxx.sql`
2. 每次发布先执行迁移，再滚动重启 API
3. 变更禁止直接改线上表结构，统一走脚本与评审
4. 破坏性变更采用“双写 + 回填 + 切读 + 清理”四步策略

### 10.8 运行与安全基线

- 数据库账号按环境分离，最小权限原则（应用账号不授予建库权限）
- 连接参数通过环境变量注入，不入库、不入代码
- 开启慢查询日志与审计日志，定位性能瓶颈与关键操作
- 生产环境每日逻辑备份、每周全量备份，并执行恢复演练
