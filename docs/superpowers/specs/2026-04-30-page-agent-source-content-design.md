# Page Agent Source Content 设计

## 目标

为文章增加一个仅供 `page agent` 分析使用的字段 `sourceContent`，用于保存抓取后的完整正文文本。

本次改造目标如下：

1. 保留现有页面展示逻辑不变
2. 不展示 `sourceContent`
3. 仅在文章详情页的 `page agent` 问答中优先使用 `sourceContent`
4. 当 `sourceContent` 为空时，自动降级到现有 `content` / `summary`
5. 不扩大到列表页、订阅页、内容中枢页
6. 不在本次改造中处理历史数据回填

## 背景

当前 `page agent` 在文章详情页的回答过于简要，容易缺失大量正文细节。

原因在于当前用于分析的上下文主要依赖以下信息：

- 摘要 `summary`
- 截断后的正文预览 `contentPreview`

这会导致模型在回答时偏向概括，而不是基于完整正文细节展开解释。

当前系统中尚不存在“抓取后的完整正文文本”持久化字段：

- 文章模型只有 `content` 和 `originalUrl`
- 抓取服务会读取网页 HTML 并清洗正文，但不会将完整原始正文单独持久化

因此需要新增一个 AI 专用字段，用于保留抓取阶段得到的完整正文文本。

## 范围

### 本次包含

- 新增文章字段 `sourceContent`
- 抓取链路写入 `sourceContent`
- 文章详情接口返回 `sourceContent`
- 前端文章详情页将 `sourceContent` 放入 `page agent` 上下文
- 后端 `page agent` 在文章详情页优先使用 `sourceContent`

### 本次不包含

- 页面展示 `sourceContent`
- 历史文章回填
- 列表页或其他页面使用 `sourceContent`
- 存储 HTML 原文
- 新增第二个 `sourceHtml` 字段

## 字段定义

### 字段名

- `sourceContent`

### 字段含义

- 抓取后的完整正文文本
- 面向 AI 分析使用
- 不是摘要
- 不是最终发布稿
- 不是原始 HTML

### 设计约束

- `sourceContent` 应尽可能保留抓取正文的完整细节
- 不要求与发布后的 `content` 完全一致
- 不要求完全保留网页结构样式
- 字段允许为空，以兼容历史数据

## 数据层设计

### 存储位置

- 在文章主表增加字段 `source_content`

### 类型

- 文本类型
- 允许为空

### 读写映射

后端 `Article` 类型新增：

```ts
sourceContent?: string;
```

数据库行映射补充：

- 读取 `source_content -> sourceContent`
- 写入 `sourceContent -> source_content`

## 内容来源设计

### 来源

`sourceContent` 的内容来自抓取服务对网页正文的提取结果。

### 内容口径

保存“抓取后的完整正文文本”，不保存 HTML 原文。

换言之：

- 先从网页中提取正文
- 去掉脚本、样式、导航、页脚等非正文噪声
- 保留尽量完整的正文文字
- 将该结果保存为 `sourceContent`

### 与现有字段关系

- `summary`：摘要，短内容，面向展示和概览
- `content`：当前发布/展示使用的正文内容
- `sourceContent`：AI 分析使用的完整抓取正文文本

三者职责不同，不互相替代。

## 抓取链路设计

### 写入时机

在 URL 抽取并生成文章数据时写入 `sourceContent`。

### 最小实现要求

- 新抓取文章时自动生成并保存 `sourceContent`
- 发布或保存草稿时，将 `sourceContent` 一并写入文章记录
- 若抓取结果为空，则允许 `sourceContent` 为空

### 不做的事

- 不要求对旧文章自动补抓
- 不要求在本次改造中批量回填历史数据

## 接口设计

### 后端文章接口

文章详情返回结构中增加：

```json
{
  "sourceContent": "..."
}
```

### 前端使用方式

- 前端详情页拿到 `sourceContent`
- 不渲染到页面
- 仅在构建 `page agent` 上下文时传递给后端

## Page Agent 设计

### 前端上下文

文章详情页构建 `page agent context` 时，新增：

```json
{
  "sourceContent": "..."
}
```

### 后端回答优先级

在 `article_detail` 场景下，模型上下文优先级为：

1. `sourceContent`
2. `content`
3. `summary`

### 回答原则

- 优先依据 `sourceContent` 回答细节问题
- 不仅复述摘要
- 若 `sourceContent` 为空，则自动退回现有逻辑

## 降级策略

### 历史文章

历史文章可能没有 `sourceContent`，这是允许的。

### 降级规则

若 `sourceContent` 不存在或为空：

- 继续使用现有 `contentPreview`
- 再不足时使用 `summary`

### 要求

- 不因为缺少 `sourceContent` 导致详情页问答失败
- 不影响当前页面浏览与问答入口

## 安全与边界

- `sourceContent` 不在页面上展示
- `sourceContent` 仅用于站内文章详情的 AI 分析
- 不额外对外开放专门接口
- 本次不处理 HTML 原文存储

## 影响文件

预计涉及以下区域：

- `apps/api/src/lib/types.ts`
- `apps/api/src/lib/store.ts`
- 数据库 schema / migration
- `apps/api/src/modules/articles/url_extract_service.ts`
- `apps/api/src/modules/articles/routes.ts`
- `apps/api/src/modules/page_agent/types.ts`
- `apps/api/src/modules/page_agent/prompts.ts`
- `apps/web/src/services/api.ts`
- `apps/web/src/page_agent/context.ts`
- `apps/web/src/views/ArticleDetailPage.vue`

## 验收标准

### 数据层

- 新抓取文章可保存 `sourceContent`
- 旧文章允许 `sourceContent` 为空

### 接口层

- 文章详情接口可返回 `sourceContent`
- 前端不在页面上显示该字段

### Page Agent

- 文章详情页提问时，回答明显比摘要更细
- 针对文章中段落细节的问题，优先基于 `sourceContent` 回答
- 当文章没有 `sourceContent` 时，问答仍可正常工作

### 边界

- 本次改造不影响列表页和其他页面
- 本次改造不新增 `sourceHtml`
- 本次改造不做历史数据回填

## 结论

本次采用“文章新增 `sourceContent` 字段”的方案。

该字段保存抓取后的完整正文文本，不参与页面展示，仅供文章详情页的 `page agent` 分析使用。

这是在当前需求下最小且可长期维护的实现路径。
