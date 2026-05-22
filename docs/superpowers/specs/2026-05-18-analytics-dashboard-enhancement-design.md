# `ai_web` 统计看板增强设计

## 目标

本次设计聚焦在现有统计能力基础上，继续增强 `/admin` 管理页的统计看板，使其从“有统计数字”提升为“可直接用于运营判断”的轻量看板。

目标如下：

1. 为管理页增加统一的时间范围切换能力
2. 展示核心概览、每日趋势、栏目分布和热门排行
3. 补充内部统计接口 `distributions` 与 `rankings`
4. 保持展示轻量，不引入新的图表库
5. 不影响现有发文、推送、反馈和 `Page Agent` 主链路

## 范围

### 本次包含

- 管理页增加时间范围切换
- 管理页增加趋势区
- 管理页增加分布区
- 管理页增加排行区
- 新增内部 `/api/stats/distributions`
- 新增内部 `/api/stats/rankings`
- 扩展前端统计 API 封装
- 为新增接口补最小验证

### 本次不包含

- 外部 `/api/stats/external/*` 的 `distributions` 和 `rankings`
- 图表库接入
- 统计明细列表
- 数据导出
- 多维钻取分析
- 新的埋点事件类型

## 背景

当前项目已经具备以下能力：

- 已有统一统计事件表 `analytics_events`
- 已有内部 `overview`、`trends` 接口
- 已有外部只读 `overview`、`trends` 接口
- `/admin` 已展示第一版统计概览卡片

当前仍存在以下不足：

- 管理页不支持按时间范围切换统计口径
- 趋势数据虽有接口，但尚未在管理页中展示
- 缺少栏目分布和热门排行，无法支持内容运营判断
- 现有概览卡片信息有限，无法形成完整看板

因此本次采用“内部统计接口补齐 + 管理页轻量看板增强”的方案，在不扩展采集范围的前提下提升管理页可用性。

## 设计原则

- 复用现有统计模型，不新增采集链路
- 只做内部管理看板，不同步扩外部接口
- 不引入图表库，使用轻量卡片、表格和简化条形展示
- 时间范围统一驱动所有统计区块，保证口径一致
- 统计加载失败不得影响内容管理功能
- 空数据区间必须返回结构化空结果

## 总体方案

### 方案选择

本次采用“轻量完整看板”方案。

选择理由：

- 比仅补前端展示更完整，能真正提升运营使用价值
- 比引入图表库更轻，符合当前项目的简洁原则
- 在现有 `overview` 与 `trends` 基础上补 `distributions`、`rankings` 成本较低

### 组成部分

本次增强由两部分组成：

1. 后端补内部统计接口
2. 管理页补完整统计看板

## 时间范围设计

管理页统一支持以下时间范围：

- `today`
- `last7days`
- `last30days`

实现约束：

- 前端维护当前选中的范围
- 所有统计接口请求都带统一的 `startAt` 和 `endAt`
- 时间范围切换后，概览、趋势、分布、排行同时刷新
- 时间范围切换只刷新统计区，不刷新文章列表和栏目列表

时间换算规则：

- 统一使用 `Asia/Shanghai`
- `today` 表示当天 `00:00:00` 到当前时刻
- `last7days` 表示近 7 天窗口
- `last30days` 表示近 30 天窗口

## 后端接口设计

### 保留现有接口

- `GET /api/stats/overview`
- `GET /api/stats/trends`

### 新增接口

#### `GET /api/stats/distributions`

用途：

- 为管理页分布区提供结构化统计结果

查询参数：

- `startAt`
- `endAt`

返回结构：

```json
{
  "channelViews": {
    "items": [
      { "label": "每日AI摘要", "key": "daily-ai-summary", "value": 12 }
    ]
  },
  "channelPublishes": {
    "items": [
      { "label": "AI政策与伦理", "key": "policy-ethics", "value": 4 }
    ]
  },
  "channelPushes": {
    "items": [
      { "label": "医学AI前沿", "key": "medical-frontier", "value": 6 }
    ]
  },
  "feedbackTypes": {
    "items": [
      { "label": "bug", "key": "bug", "value": 2 }
    ]
  }
}
```

聚合口径：

- `channelViews`
  - 基于 `analytics_events` 中 `article_view` 按 `channel_code` 聚合
- `channelPublishes`
  - 基于 `article_published` 按 `channel_code` 聚合
- `channelPushes`
  - 基于 `push_sent` 按 `channel_code` 聚合
- `feedbackTypes`
  - 基于 `feedback_created`，从 `event_payload.type` 聚合

#### `GET /api/stats/rankings`

用途：

- 为管理页排行区提供热门内容与栏目排行

查询参数：

- `startAt`
- `endAt`
- `limit`

默认值：

- `limit = 5`

返回结构：

```json
{
  "topArticles": {
    "items": [
      {
        "articleId": "uuid",
        "title": "教育部发布高校人工智能课程建设新指引",
        "channelCode": "policy-ethics",
        "channelName": "AI政策与伦理",
        "viewCount": 8
      }
    ]
  },
  "topChannels": {
    "items": [
      {
        "channelCode": "daily-ai-summary",
        "channelName": "每日AI摘要",
        "viewCount": 13
      }
    ]
  }
}
```

聚合口径：

- `topArticles`
  - 基于 `article_view` 按 `article_id` 聚合
  - 再关联 `articles` 表补文章标题和栏目
- `topChannels`
  - 基于 `article_view` 按 `channel_code` 聚合
  - 第一版仅按浏览量排序，不引入复杂热度公式

### 现有接口补充要求

- `overview`
  - 按统一时间范围继续返回现有概览口径
- `trends`
  - 继续返回每日序列：
    - `date`
    - `pv`
    - `uv`
    - `articleViews`

## 管理页设计

### 页面结构

继续复用现有 `/admin` 页面，不拆分新页面。

从上到下分为 4 个区块：

1. 时间范围栏
2. 概览区
3. 趋势区
4. 分布与排行区

### 时间范围栏

展示 3 个切换项：

- `今天`
- `近7天`
- `近30天`

交互要求：

- 当前选中项高亮
- 切换后并行刷新统计数据
- 加载时显示轻量 loading 状态

### 概览区

保留当前已有卡片，并补齐更有价值的统计项。

建议最终展示：

- 页面浏览量
- 访问用户数
- 文章浏览量
- 文章发布量
- 推送总量
- 推送成功率
- 反馈提交量
- 启用订阅数

### 趋势区

展示每日趋势，不引入图表库。

建议采用轻量表格式展示，字段包括：

- 日期
- PV
- UV
- 文章浏览量

展示要求：

- 支持空态
- 支持轻量加载态
- 不要求复杂交互

### 分布区

展示以下分布：

- 栏目浏览量分布
- 栏目发布量分布
- 栏目推送量分布
- 反馈类型分布

展示要求：

- 使用卡片 + 表格
- 每块只展示 Top 项
- 同时保留 `label` 和 `value`

### 排行区

展示两个排行卡片：

- 热门文章 Top N
- 热门栏目 Top N

热门文章展示字段：

- 标题
- 栏目
- 浏览量

热门栏目展示字段：

- 栏目名称
- 浏览量

## 状态与错误处理

### 加载状态

- 首次进入 `/admin` 时，统计数据和原有内容管理数据并行加载
- 时间范围切换时，只刷新统计相关数据
- 各统计区块允许展示统一加载态

### 错误处理

- 统计接口失败时，不影响文章管理、发文、删除等原有能力
- 统计区域展示“加载失败，请重试”
- 不把统计错误升级为整个页面错误

### 空数据处理

- 空时间范围返回结构化空数据
- 前端显示“暂无统计数据”
- 不出现 `NaN`、空白表格异常或布局错乱

## 实施落点

### 后端

- `apps/api/src/lib/store.ts`
  - 增加分布和排行聚合查询
- `apps/api/src/modules/stats/service.ts`
  - 增加 `getDistributions()`
  - 增加 `getRankings()`
- `apps/api/src/modules/stats/routes.ts`
  - 增加：
    - `/api/stats/distributions`
    - `/api/stats/rankings`

### 前端

- `apps/web/src/services/api.ts`
  - 增加：
    - `getStatsTrends`
    - `getStatsDistributions`
    - `getStatsRankings`
- `apps/web/src/views/AdminPage.vue`
  - 增加时间范围状态
  - 增加统计数据并行加载
  - 增加趋势区、分布区、排行区

## 验证方式

### 后端验证

- `overview` 在不同时间范围可返回结果
- `trends` 在不同时间范围返回按天序列
- `distributions` 返回 4 组分布数据
- `rankings` 返回热门文章和热门栏目
- 空时间范围返回空结构，不报错

### 前端验证

- `/admin` 首次进入可加载概览、趋势、分布、排行
- 切换 `今天`、`近7天`、`近30天` 时统计区同步刷新
- 统计失败只影响统计区，不影响内容管理区
- 无数据时显示稳定空态

### 工程验证

- `apps/api` 执行：
  - `npm run build`
  - `npm run typecheck`
- `apps/web` 执行：
  - `npm run build`
- 增加与新增接口直接相关的最小 smoke 验证

## 完成标准

- `/admin` 支持时间范围切换
- 管理页可查看：
  - 核心概览
  - 每日趋势
  - 栏目分布
  - 热门文章排行
  - 热门栏目排行
- 新增接口仅限内部管理员访问
- 前后端构建通过
- 不影响现有内容中枢功能

## 结论

本次看板增强采用“内部统计接口补齐 + 轻量卡片与表格展示”的方案。

该方案能在不增加采集复杂度、不引入图表库、不扩展外部接口的前提下，把现有统计能力升级为一套可直接服务内容运营与管理判断的管理看板，适合作为下一阶段统计能力建设的最小可用增强方案。
