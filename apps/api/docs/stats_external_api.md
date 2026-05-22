# 统计外部读取接口文档

## 接口地址

- `GET /api/stats/external/overview`
- `GET /api/stats/external/trends`

## 鉴权方式

环境变量：

```bash
STATS_EXTERNAL_READ_TOKEN=<your-token>
```

请求头支持：

```bash
x-internal-auth-token: <token>
```

或：

```bash
Authorization: Bearer <token>
```

## overview 查询参数

- `startAt`：可选，ISO 时间
- `endAt`：可选，ISO 时间
- `channelCode`：可选，栏目编码

## trends 查询参数

- `startAt`：必填，ISO 时间
- `endAt`：必填，ISO 时间

## 返回示例

```json
{
  "pv": 10,
  "uv": 3,
  "articleViews": 5,
  "articlesPublished": 2,
  "pushTotal": 4,
  "pushSuccess": 3,
  "pushFailed": 1,
  "pushSuccessRate": 75,
  "feedbackCount": 1,
  "pageAgentConversationCount": 2,
  "pageAgentMessageCount": 6,
  "generatedAt": "2026-05-18T08:00:00.000Z"
}
```
