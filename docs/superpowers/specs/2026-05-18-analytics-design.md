# `ai_web` 统计能力设计

## 目标

本次设计聚焦为 `ai_web` 增加一套轻量但可扩展的统计能力，满足以下目标：

1. 支持站内页面访问量和文章浏览量统计
2. 支持消息推送量、成功量、失败量和成功率统计
3. 补充文章发布量、订阅变更量、反馈量和 `Page Agent` 使用量统计
4. 在现有管理页中增加可直接使用的统计看板
5. 保持统计功能不影响现有主业务链路
6. 为后续日报、月报和更多事件扩展保留统一事件模型

## 范围

### 本次包含

- 新增统一统计事件表 `analytics_events`
- 统计 `PV`、`UV`、文章浏览量
- 统计消息推送总量、成功量、失败量、成功率
- 统计文章发布量
- 统计订阅变更量和当前启用订阅数
- 统计反馈提交量
- 统计 `Page Agent` 会话量和消息量
- 新增内部 `/api/stats/*` 聚合接口
- 新增外部只读 `/api/stats/external/*` 聚合接口
- 在 `/admin` 中增加统计看板
- 为关键统计字段增加必要索引
- 增加统计写入失败日志，保证可排障
- 提供内部运维和外部调用两版统计接口文档

### 本次不包含

- 匿名访客识别
- 复杂点击埋点体系
- 事件明细查询页面
- 导出 Excel/CSV 报表
- 实时 `websocket` 数据推送
- 多维钻取分析界面
- 预聚合日报表和离线数仓建设
- 向外部开放事件明细原始数据

## 背景

当前 `ai_web` 已具备以下基础：

- `articles`、`subscriptions`、`push_records`、`feedback_entries` 等业务表已存在
- `push_records` 已能记录推送请求、结果、错误信息和发送时间
- `page_agent_conversations`、`page_agent_messages` 已能承载问答会话与消息记录
- 管理页 `/admin` 已存在，适合作为第一版统计看板入口

当前缺失的能力包括：

- 没有统一的访问和浏览事件采集能力
- 没有独立的统计聚合接口
- 管理页没有内容运营和推送效果看板
- 业务事件分散在各模块中，无法用统一口径做趋势和排行统计

因此，本次采用“统一事件表 + 聚合接口 + 管理页看板”的方案，以最小必要改动补齐统计能力。

## 设计原则

- 优先做业务可用的统计，不建设通用埋点平台
- 优先复用现有业务表和已有可信结果，如 `push_records`
- 统计功能不得阻断发文、推送、反馈等主链路
- 统一按 `Asia/Shanghai` 时区聚合
- `UV` 以登录用户为默认口径，不先做匿名设备识别
- 高频查询维度单独建列，不依赖 `JSONB` 全字段扫描
- 第一版只覆盖核心页面访问和关键业务事件

## 指标口径

### 访问与浏览指标

- `PV`
  - 页面被访问一次记 1 次
  - 同一用户重复访问可重复累计

- `UV`
  - 按登录用户去重
  - 在统计时间范围内，同一 `user_id` 只计 1 次

- `页面访问量`
  - 用户进入核心页面时记录
  - 第一版建议覆盖：
    - `/`
    - `/articles/:id`
    - `/push-digests/today`
    - `/subscription`
    - `/admin`

- `文章浏览量`
  - 用户进入文章详情页并完成文章加载后记 1 次
  - 支持按文章、栏目、日期聚合

### 业务量指标

- `消息推送量`
  - 统计推送尝试总量
  - 以 `push_records` 和统计事件共同支持趋势与概览

- `消息推送成功量`
  - 统计实际成功发送的记录数

- `消息推送失败量`
  - 统计失败记录数

- `消息推送成功率`
  - `成功量 / 推送总量`

- `文章发布量`
  - 文章从非 `published` 变为 `published`，或创建时直接为 `published` 时计数

- `订阅变更量`
  - 用户提交订阅更新时计数

- `当前启用订阅数`
  - 直接基于 `subscriptions` 表统计 `enabled = TRUE` 的记录数

- `反馈量`
  - 用户提交反馈成功后计数

- `Page Agent` 会话量
  - 创建会话成功后计数

- `Page Agent` 消息量
  - 用户消息和助手消息写入成功后计数

### 补充指标

- `栏目热度`
  - 按栏目聚合浏览量、发布量、推送量

- `热门文章`
  - 按文章浏览量排序展示 `Top N`

- `推送效果`
  - 按天统计推送成功率和失败量

- `用户参与度`
  - 按天统计访问 `UV`、反馈人数和 `Page Agent` 使用人数

## 总体方案

### 方案选择

本次采用“统一事件表 + 管理页看板”的方案。

理由如下：

- 能同时覆盖页面访问、文章浏览和后端业务事件
- 结构清晰，后续新增事件时只需扩展事件写入和聚合逻辑
- 与现有 `push_records`、`feedback_entries`、`page_agent_messages` 可自然协同
- 开发复杂度低于预聚合报表方案，适合当前项目阶段

### 三层结构

#### 事件采集层

- 前端负责上报只有浏览器知道的事件：
  - `page_view`
  - `article_view`

- 后端负责记录可信业务事件：
  - `article_published`
  - `push_sent`
  - `push_failed`
  - `subscription_updated`
  - `feedback_created`
  - `page_agent_conversation_created`
  - `page_agent_message_created`

#### 事件存储层

- 新增统一事件表 `analytics_events`
- 公共维度使用独立字段
- 业务补充信息放入 `event_payload`

#### 统计查询层

- 管理页只调用 `/api/stats/*` 聚合接口
- 外部系统只调用 `/api/stats/external/*` 只读接口
- 第一版使用实时聚合查询
- 后续若数据量增大，再补日报汇总表

## 数据模型

### `analytics_events`

用途：

- 保存页面访问、文章浏览和业务事件
- 作为趋势、分布和排行的统一数据来源

建议字段：

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `event_type VARCHAR(32) NOT NULL`
- `event_name VARCHAR(64) NOT NULL`
- `user_id VARCHAR(64)`
- `session_id VARCHAR(128)`
- `page_route VARCHAR(500)`
- `page_title VARCHAR(200)`
- `article_id UUID`
- `channel_code VARCHAR(64)`
- `source_module VARCHAR(64) NOT NULL`
- `event_payload JSONB NOT NULL DEFAULT '{}'::jsonb`
- `occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

建议约束：

- `event_type` 允许值：
  - `page`
  - `article`
  - `push`
  - `subscription`
  - `feedback`
  - `agent`

- `event_name` 第一版允许值：
  - `page_view`
  - `article_view`
  - `article_published`
  - `push_sent`
  - `push_failed`
  - `subscription_updated`
  - `feedback_created`
  - `page_agent_conversation_created`
  - `page_agent_message_created`

字段说明：

- `user_id`
  - 用于 `UV` 和参与人数统计

- `session_id`
  - 第一版不作为主统计口径
  - 保留给后续会话分析扩展

- `article_id`
  - 用于热门文章和文章浏览聚合

- `channel_code`
  - 用于栏目分布和栏目排行

- `event_payload`
  - 保存补充业务上下文，例如：
    - 推送频率
    - 推送模式
    - 推送记录 ID
    - 反馈类型
    - `Page Agent` 消息角色

### 索引建议

- `idx_analytics_events_occurred_at`
  - `occurred_at`

- `idx_analytics_events_name_occurred_at`
  - `(event_name, occurred_at DESC)`

- `idx_analytics_events_channel_occurred_at`
  - `(channel_code, occurred_at DESC)`

- `idx_analytics_events_article_occurred_at`
  - `(article_id, occurred_at DESC)`

- `idx_analytics_events_user_occurred_at`
  - `(user_id, occurred_at DESC)`

## 事件来源设计

### 前端上报事件

#### `page_view`

- 触发时机：
  - 路由切换成功后
- 记录字段：
  - `user_id`
  - `session_id`
  - `page_route`
  - `page_title`
  - `source_module = 'web_router'`

#### `article_view`

- 触发时机：
  - 文章详情加载成功后
- 记录字段：
  - `user_id`
  - `session_id`
  - `page_route`
  - `page_title`
  - `article_id`
  - `channel_code`
  - `source_module = 'web_article_detail'`

### 后端记录事件

#### `article_published`

- 触发位置：
  - `articles/routes.ts`
- 触发时机：
  - 发布成功后

#### `subscription_updated`

- 触发位置：
  - `subscriptions/routes.ts`
- 触发时机：
  - 用户保存订阅成功后

#### `feedback_created`

- 触发位置：
  - `feedback/routes.ts`
- 触发时机：
  - 反馈创建成功后

#### `page_agent_conversation_created`

- 触发位置：
  - `page_agent/routes.ts`
- 触发时机：
  - 会话创建成功后

#### `page_agent_message_created`

- 触发位置：
  - `page_agent/service.ts`
- 触发时机：
  - 用户消息或助手消息写入成功后

#### `push_sent` 与 `push_failed`

- 触发位置：
  - `push/service.ts`
- 触发时机：
  - 推送结果落库后

说明：

- 推送的可信业务结果仍以 `push_records` 为主
- `analytics_events` 中的推送事件用于统一趋势和跨域统计视图

## 管理页设计

### 看板入口

- 保留现有 `/admin`
- 在当前管理页中新增统计区域

### 展示区域

#### 核心概览卡片

- 今日 `PV`
- 今日 `UV`
- 今日文章浏览量
- 今日推送总量
- 今日推送成功量
- 今日反馈量

#### 趋势图

- 近 `7` 天 / `30` 天 `PV` 趋势
- 近 `7` 天 / `30` 天 `UV` 趋势
- 近 `7` 天 / `30` 天文章浏览趋势
- 近 `7` 天 / `30` 天推送成功与失败趋势
- 近 `7` 天 / `30` 天文章发布趋势

#### 分布统计

- 按栏目统计浏览量
- 按栏目统计发布量
- 按栏目统计推送量
- 按推送频率统计消息量
- 按反馈类型统计反馈量

#### 排行榜

- 热门文章 `Top N`
- 热门栏目 `Top N`
- 推送量最高栏目 `Top N`
- `Page Agent` 使用量最高页面 `Top N`

#### 运营与质量

- 推送成功率
- 推送失败量
- 推送失败原因分布
- 当前启用订阅数
- `Page Agent` 会话数
- `Page Agent` 消息数
- 反馈提交人数

### 时间范围

- 默认支持：
  - 今天
  - 近 `7` 天
  - 近 `30` 天

## API 设计

### 设计原则

- 只暴露聚合结果，不优先暴露事件明细
- 聚合接口面向管理页直接消费
- 参数结构简单，便于前端接入
- 外部接口只开放收敛后的聚合数据，不开放内部排障视图
- 外部接口必须使用独立可轮换鉴权，不依赖 CAS 会话

### 路由设计

- 新增内部模块：`/api/stats`
- 新增外部模块：`/api/stats/external`

#### `GET /api/stats/overview`

用途：

- 返回概览卡片数据

建议参数：

- `startAt`
- `endAt`
- `channelCode`

建议返回内容：

- `pv`
- `uv`
- `articleViews`
- `articlesPublished`
- `pushTotal`
- `pushSuccess`
- `pushFailed`
- `pushSuccessRate`
- `feedbackCount`
- `pageAgentConversationCount`
- `pageAgentMessageCount`
- `enabledSubscriptionCount`

#### `GET /api/stats/trends`

用途：

- 返回按天聚合的趋势序列

建议参数：

- `startAt`
- `endAt`
- `granularity=day`

建议返回内容：

- 每日 `pv`
- 每日 `uv`
- 每日 `articleViews`
- 每日 `articlesPublished`
- 每日 `pushSent`
- 每日 `pushFailed`
- 每日 `feedbackCount`
- 每日 `pageAgentMessages`

#### `GET /api/stats/distributions`

用途：

- 返回按维度拆分的统计结果

建议参数：

- `startAt`
- `endAt`

建议返回内容：

- 按 `channel_code` 聚合的浏览量、发布量、推送量
- 按推送频率聚合的消息量
- 按反馈类型聚合的反馈量

#### `GET /api/stats/rankings`

用途：

- 返回排行榜数据

建议参数：

- `startAt`
- `endAt`
- `limit`

建议返回内容：

- 热门文章 `Top N`
- 热门栏目 `Top N`
- 推送量最高栏目 `Top N`
- `Page Agent` 热门页面 `Top N`

### 外部接口设计

外部接口定位为：

- 只读
- 聚合结果
- 适合第三方系统或上级平台拉取
- 不依赖管理员登录态
- 不直接暴露内部排障字段和原始事件明细

建议第一版提供以下接口：

#### `GET /api/stats/external/overview`

用途：

- 返回外部系统最常用的核心概览指标

建议参数：

- `startAt`
- `endAt`
- `channelCode`

建议返回内容：

- `pv`
- `uv`
- `articleViews`
- `articlesPublished`
- `pushTotal`
- `pushSuccess`
- `pushFailed`
- `pushSuccessRate`
- `feedbackCount`
- `pageAgentConversationCount`
- `pageAgentMessageCount`
- `generatedAt`

说明：

- 不返回内部使用的错误明细
- 不返回用户维度原始数据

#### `GET /api/stats/external/trends`

用途：

- 返回外部系统可直接展示的趋势数据

建议参数：

- `startAt`
- `endAt`
- `granularity=day`
- `channelCode`

建议返回内容：

- 每日 `pv`
- 每日 `uv`
- 每日 `articleViews`
- 每日 `articlesPublished`
- 每日 `pushSent`
- 每日 `pushFailed`
- 每日 `feedbackCount`
- 每日 `pageAgentMessages`

说明：

- 默认只支持按天聚合
- 第一版不开放更细粒度时间维度

#### `GET /api/stats/external/distributions`

用途：

- 返回外部系统常用的结构性统计结果

建议参数：

- `startAt`
- `endAt`

建议返回内容：

- 按栏目聚合的浏览量
- 按栏目聚合的发布量
- 按栏目聚合的推送量
- 按反馈类型聚合的反馈量

说明：

- 外部接口中不返回推送失败原因明细
- 外部接口中不返回内部页面排行

#### `GET /api/stats/external/rankings`

用途：

- 返回外部系统可使用的排行结果

建议参数：

- `startAt`
- `endAt`
- `limit`

建议返回内容：

- 热门文章 `Top N`
- 热门栏目 `Top N`

说明：

- 第一版不向外部开放 `Page Agent` 热门页面排行
- 避免暴露过多内部页面结构

### 内外接口边界

内部接口可额外提供：

- 推送失败原因分布
- `Page Agent` 热门页面排行
- 当前启用订阅数
- 更适合运维和排障的管理指标

外部接口只提供：

- 概览
- 趋势
- 分布
- 热门文章和热门栏目排行

这样划分的原因：

- 外部系统通常只需要聚合结果
- 内部运维指标不应默认暴露给第三方
- 可以降低接口稳定性风险和敏感信息外泄风险

### 鉴权要求

- 管理页调用继续要求管理员权限
- 不将 CAS 会话视为唯一接口鉴权方案
- 若后续需要给运维或外部系统调用，可在不改动主逻辑的前提下补内部令牌鉴权

### 外部鉴权设计

外部统计接口使用独立接口令牌鉴权，不依赖 CAS 会话。

建议新增环境变量：

- `STATS_EXTERNAL_READ_TOKEN`

建议支持以下请求头：

1. `x-internal-auth-token: <token>`
2. `Authorization: Bearer <token>`

鉴权规则建议：

- 访问 `/api/stats/external/*` 时不要求管理员登录态
- 缺少令牌返回 `401`
- 令牌错误返回 `403`
- 令牌正确时允许访问只读聚合接口

选择理由：

- 对外系统接入成本低
- 令牌可独立轮换
- 符合“跳过 CAS 不等于无鉴权”的项目约束

## 落点设计

### 后端

预计涉及以下区域：

- `apps/api/sql`
- `apps/api/src/lib/types.ts`
- `apps/api/src/lib/store.ts`
- `apps/api/src/config/env.ts`
- `apps/api/src/middleware/auth.ts`
- `apps/api/src/modules/stats/routes.ts`
- `apps/api/src/modules/stats/service.ts`
- `apps/api/src/app.ts`
- `apps/api/src/modules/articles/routes.ts`
- `apps/api/src/modules/subscriptions/routes.ts`
- `apps/api/src/modules/feedback/routes.ts`
- `apps/api/src/modules/page_agent/routes.ts`
- `apps/api/src/modules/page_agent/service.ts`
- `apps/api/src/modules/push/service.ts`

模块职责建议：

#### `types.ts`

- 增加统计事件和聚合返回类型

#### `store.ts`

- 新增 `analyticsEventStore`
- 提供事件写入、聚合查询、排行查询方法

#### `modules/stats/service.ts`

- 聚合多个统计来源
- 组合成管理页需要的响应结构

#### `modules/stats/routes.ts`

- 做参数校验
- 区分内部管理员接口与外部令牌接口
- 调用统计 service 返回结果

#### `config/env.ts`

- 增加 `STATS_EXTERNAL_READ_TOKEN`

#### `middleware/auth.ts`

- 增加外部统计只读接口的专用令牌校验逻辑

### 前端

预计涉及以下区域：

- `apps/web/src/services/api.ts`
- `apps/web/src/router.ts`
- `apps/web/src/views/ArticleDetailPage.vue`
- `apps/web/src/views/AdminPage.vue`

模块职责建议：

#### `router.ts`

- 在路由切换成功后上报 `page_view`

#### `ArticleDetailPage.vue`

- 在文章详情加载成功后上报 `article_view`

#### `AdminPage.vue`

- 新增统计看板区域
- 请求并渲染 `/api/stats/*` 返回结果

## 去重与容错设计

### 去重策略

#### `PV`

- 不去重
- 按访问次数自然累计

#### `UV`

- 查询时按 `user_id` 去重
- 不在事件写入阶段做复杂去重

#### 前端轻量保护

- 同一次路由导航只上报一次 `page_view`
- 文章详情只有在加载成功后才上报 `article_view`
- 不做跨分钟或跨会话去重，避免影响真实 `PV`

### 统计写入失败策略

- 统计事件写入失败时，不回滚主业务
- 记录明确日志，例如：
  - `analytics.event.write.failed`
- 返回主业务成功结果

原因：

- 统计能力属于旁路能力
- 不应阻断文章发布、消息推送、反馈提交等核心链路

### 数据一致性取舍

- 推送效果复盘优先以 `push_records` 为准
- 趋势和统一看板可使用 `analytics_events`
- 当两者出现差异时，以业务记录表作为排障基准

## 性能设计

- 第一版不做日报聚合表
- 高频过滤维度使用独立字段，不放入 `JSONB`
- 所有趋势查询必须基于时间范围
- 排行榜查询默认限制 `Top N`
- 管理页默认只查 `今天`、`近7天`、`近30天`

## 错误处理

### 统计上报接口

- 参数错误返回 `400`
- 未登录返回 `401`
- 服务端异常返回 `500`

### 管理统计接口

- 未授权返回 `403`
- 时间范围或参数错误返回 `400`
- 聚合失败返回 `500`

### 外部统计接口

- 缺少令牌返回 `401`
- 令牌错误返回 `403`
- 参数错误返回 `400`
- 聚合失败返回 `500`

### 空数据处理

- 空时间区间返回结构化空结果
- 不因为无数据直接报错
- 管理页展示空态而不是 `NaN` 或空白异常组件

## 验证设计

### 迁移验证

- 可成功执行统计表迁移
- 可成功创建索引
- 现有业务表和既有功能不受影响

### 事件写入验证

- 打开首页后产生 `page_view`
- 打开文章详情后产生 `article_view`
- 发布文章后产生 `article_published`
- 修改订阅后产生 `subscription_updated`
- 提交反馈后产生 `feedback_created`
- 创建 `Page Agent` 会话后产生 `page_agent_conversation_created`
- 发送 `Page Agent` 消息后产生 `page_agent_message_created`
- 触发推送后产生 `push_sent` 或 `push_failed`

### 聚合接口验证

- `overview` 可返回概览卡片数据
- `trends` 可返回按天趋势序列
- `distributions` 可返回栏目、频率和反馈类型拆分
- `rankings` 可返回 `Top N` 数据
- 空数据时间范围可返回结构化结果
- 外部接口使用正确令牌可访问
- 外部接口缺少或携带错误令牌时返回正确状态码
- 外部接口只返回约定的聚合结果，不暴露内部排障字段

### 管理页验证

- `/admin` 可正常加载统计看板
- 时间范围切换后卡片和图表同步刷新
- 空数据时展示空态
- 不出现异常数值和组件报错

## 验收标准

1. 可记录页面访问、文章浏览、文章发布、订阅变更、反馈提交、`Page Agent` 使用和消息推送事件
2. 管理页可查看今日和近 `7/30` 天核心统计
3. 可查看栏目分布、热门文章和推送效果
4. 统计写入失败不会影响主业务链路
5. 统计接口具备管理员权限控制
6. 关键查询具备必要索引和基础性能保障
7. 外部只读统计接口具备独立可轮换令牌鉴权
8. 外部接口返回结构稳定，适合第三方系统直接消费

## 风险与后续扩展

### 当前风险

- 事件量增长后，实时聚合查询可能逐渐变慢
- 若后续引入匿名访问场景，当前 `UV` 口径需要补访客维度
- 若前端重复触发路由钩子，可能造成 `PV` 异常膨胀

### 后续扩展方向

- 增加日报或小时级预聚合表
- 增加导出报表
- 增加事件明细检索页
- 增加按用户分层的参与度分析
- 增加匿名会话维度统计

## API 文档要求

后续实现完成后，统计接口文档应拆分为两个版本：

- 内部运维统计接口文档
- 外部调用统计接口文档

外部文档至少包含：

- 接口地址
- 鉴权方式
- 环境变量名
- 查询参数说明
- 返回结构示例
- 错误码示例
- `curl` 调用示例

## 结论

本次采用“统一事件表 + 内外两组聚合接口 + 管理页看板”的方案。

该方案能在当前 `ai_web` 基础上，以较小改动补齐页面访问、文章浏览、推送效果、内容供给和用户参与度统计，同时补充对外只读统计接口，并保持主业务链路稳定、边界清晰，适合作为第一版统计能力落地方案。
