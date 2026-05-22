# 用户反馈外部读取接口设计

## 目标

在现有反馈提交能力基础上，新增一个简单实用的外部读取接口，供外部系统按基础筛选条件拉取用户反馈数据。

本次目标包括：

1. 提供独立的只读接口读取反馈列表
2. 支持基础筛选与分页
3. 使用独立可轮换的接口令牌鉴权
4. 返回适合外部系统直接消费的 JSON 结构
5. 提供可直接交付的接口使用文档

## 范围

### 本次包含

- 新增 `GET /api/feedback/external`
- 支持 `type`、`startAt`、`endAt`、`page`、`pageSize` 查询参数
- 默认按 `createdAt DESC` 返回
- 返回反馈列表与分页信息
- 返回 `contact` 原始内容
- 新增专用环境变量 `FEEDBACK_EXTERNAL_READ_TOKEN`
- 提供一份对外接口使用文档

### 本次不包含

- 修改或删除反馈
- 关键词全文检索
- Excel/CSV 导出
- 统计汇总接口
- 多级权限模型
- 单条详情接口

## 设计原则

- 只做读取，不混入编辑能力
- 接口简单直接，优先保证外部易接入
- 鉴权独立，不依赖 CAS 会话
- 查询能力只保留最实用的基础筛选
- 文档直接面向外部调用方，可复制即可使用

## 接口设计

### 路由

- 保留现有提交接口：`POST /api/feedback`
- 新增外部读取接口：`GET /api/feedback/external`

这样拆分后：

- `POST /api/feedback` 继续只负责站内反馈提交
- `GET /api/feedback/external` 只负责外部系统读取反馈
- 两个接口都保持在 `feedback` 模块下，职责明确且路径直观

## 鉴权设计

### 方案

外部读取接口使用独立接口令牌鉴权，不依赖 CAS 会话。

建议新增环境变量：

- `FEEDBACK_EXTERNAL_READ_TOKEN`

请求头支持两种方式：

1. `x-internal-auth-token: <token>`
2. `Authorization: Bearer <token>`

### 鉴权规则

- 若当前请求是管理员登录态，可访问
- 若未登录但携带正确专用令牌，可访问
- 若缺少令牌，返回 `401`
- 若令牌错误，返回 `403`

### 选择理由

- 外部系统最容易接入
- 令牌可独立轮换
- 不与站内登录态强耦合
- 比额外引入 JWT、签名方案更轻量

## 查询参数设计

### 支持参数

- `type`
  - 可选
  - 枚举值：`bug`、`ux`、`content`、`other`

- `startAt`
  - 可选
  - ISO 时间字符串
  - 仅返回该时间之后的反馈

- `endAt`
  - 可选
  - ISO 时间字符串
  - 仅返回该时间之前的反馈

- `page`
  - 可选
  - 默认值：`1`

- `pageSize`
  - 可选
  - 默认值：`20`
  - 最大值：`100`

### 不支持参数

本次不支持：

- 关键词搜索
- 自定义排序字段
- 多字段组合模糊匹配

原因是当前目标是“简单实用”，按时间、类型和分页读取已经足够支撑第一阶段外部接入。

## 返回结构设计

### 响应结构

接口返回标准分页对象：

```json
{
  "items": [
    {
      "id": "uuid",
      "type": "ux",
      "content": "右侧反馈入口很好找，但希望成功提示更轻一点。",
      "contact": "tester@example.com",
      "pageRoute": "/articles/123",
      "pageTitle": "文章详情",
      "source": "web_feedback",
      "createdAt": "2026-05-16T04:57:25.944Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1
  }
}
```

### 字段说明

每条反馈返回字段如下：

- `id`
- `type`
- `content`
- `contact`
- `pageRoute`
- `pageTitle`
- `source`
- `createdAt`

### 排序规则

- 默认按 `createdAt DESC` 返回
- 新反馈优先出现在前面

## 后端实现设计

### 影响文件

预计涉及以下文件：

- `apps/api/src/modules/feedback/routes.ts`
- `apps/api/src/lib/store.ts`
- `apps/api/src/config/env.ts`
- `apps/api/src/middleware/auth.ts`
- `apps/api/src/scripts/`
- `apps/api/docs/`

### 模块职责

#### `feedback/routes.ts`

- 保留现有提交接口
- 新增 `GET /external`
- 做参数校验、调用 store、返回结果

#### `store.ts`

- 新增反馈列表查询方法
- 支持类型、时间范围和分页过滤
- 同时返回总数

#### `env.ts`

- 增加 `FEEDBACK_EXTERNAL_READ_TOKEN`

#### `auth.ts`

- 增加适用于反馈外部读取的专用令牌校验逻辑
- 优先读取专用反馈查询令牌

## 错误处理

### 鉴权错误

- 缺少令牌：`401`
- 令牌无效：`403`

### 参数错误

- 查询参数格式不合法：`400`

### 服务端错误

- 查询异常：`500`

### 错误响应

保持与现有 API 风格一致：

```json
{
  "message": "参数错误"
}
```

或：

```json
{
  "message": "反馈查询失败"
}
```

## 验收标准

- 可以通过 `GET /api/feedback/external` 读取反馈列表
- 支持 `type`、`startAt`、`endAt`、`page`、`pageSize`
- 默认按 `createdAt DESC` 返回
- 返回包含 `contact` 原始内容
- 未携带专用令牌时返回 `401`
- 携带错误令牌时返回 `403`
- 使用正确令牌时可正常返回数据
- 返回结构包含 `items` 和 `pagination`
- 提供一份可直接交给外部调用方的接口文档

## 文档交付设计

接口文档建议放在：

- `apps/api/docs/feedback_external_api.md`

文档内容包括：

- 接口地址
- 鉴权方式
- 环境变量说明
- 请求参数说明
- 返回示例
- 错误码示例
- `curl` 调用示例

## 密钥交付策略

本次实现完成后，直接提供一条随机强密钥，供写入：

- `FEEDBACK_EXTERNAL_READ_TOKEN=<generated-token>`

交付时同时给出：

- 推荐写入的环境变量名
- 生成好的令牌值
- 示例请求头写法

## 结论

本次采用“`feedback` 模块内新增独立外部读取接口 + 专用令牌鉴权 + 基础筛选分页”的方案。

该方案满足以下目标：

- 简单实用，外部系统易接入
- 不依赖 CAS，会话边界清晰
- 支持最常见的反馈拉取场景
- 可直接附带文档和密钥交付
