# Hermes 用户反馈读取接口文档

## 1. 文档用途

本文档用于指导 `Hermes` 调用 `ai_web` 提供的用户反馈读取接口，按基础筛选条件拉取反馈数据。

适用场景：

- `Hermes` 定时同步用户反馈
- `Hermes` 按反馈类型读取指定数据
- `Hermes` 按时间范围分页拉取反馈

## 2. 接口信息

- 接口名称：用户反馈外部读取接口
- 请求方法：`GET`
- 正式地址：`http://idapps.xzhmu.edu.cn/ai-web/api/feedback/external`
- 返回格式：`application/json`
- 字符编码：`UTF-8`

说明：

- 当前文档按正式前缀 `/ai-web` 编写
- 如果生产网关后续取消此前缀，请将地址调整为 `/api/feedback/external`

## 3. 鉴权方式

接口使用独立读取令牌进行鉴权。

服务端环境变量：

```bash
FEEDBACK_EXTERNAL_READ_TOKEN=<token>
```

当前可用令牌：

```bash
pbdfrLdCfSeNTh0KBPgH8qTehWsfXrcbist2oGyfOOA
```

请求头支持两种写法，任选其一。

### 3.1 写法一

```bash
x-internal-auth-token: pbdfrLdCfSeNTh0KBPgH8qTehWsfXrcbist2oGyfOOA
```

### 3.2 写法二

```bash
Authorization: Bearer pbdfrLdCfSeNTh0KBPgH8qTehWsfXrcbist2oGyfOOA
```

建议：

- `Hermes` 优先使用 `x-internal-auth-token`
- 不要把令牌写死在公开仓库、日志或前端页面中
- 如需轮换令牌，只需服务端更新 `FEEDBACK_EXTERNAL_READ_TOKEN`，并同步更新 `Hermes` 配置

## 4. 查询参数

接口支持以下查询参数：

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `type` | string | 否 | 无 | 反馈类型，可选值：`bug`、`ux`、`content`、`other` |
| `startAt` | string | 否 | 无 | 开始时间，ISO 8601 时间字符串，建议带时区 |
| `endAt` | string | 否 | 无 | 结束时间，ISO 8601 时间字符串，建议带时区 |
| `page` | number | 否 | `1` | 页码，从 `1` 开始 |
| `pageSize` | number | 否 | `20` | 每页条数，最大 `100` |

参数说明：

- `type` 不传时，返回所有类型反馈
- `startAt` 与 `endAt` 可单独使用，也可组合使用
- `pageSize` 建议 `Hermes` 控制在 `20` 到 `100` 之间
- 默认按 `createdAt DESC` 倒序返回，最新反馈优先

## 5. 反馈类型说明

| 类型值 | 含义 |
| --- | --- |
| `bug` | 功能异常、报错、数据错误 |
| `ux` | 交互体验、页面可用性、展示优化建议 |
| `content` | 内容质量、栏目匹配、摘要或正文相关意见 |
| `other` | 其他未分类反馈 |

## 6. 返回结构

成功响应示例：

```json
{
  "items": [
    {
      "id": "97d6e41a-1111-4b0e-8a2b-000000000001",
      "userId": "100002013029",
      "type": "ux",
      "content": "右侧反馈入口位置合理，但希望提交成功提示更轻一点。",
      "contact": "tester@example.com",
      "pageRoute": "/articles/alpha",
      "pageTitle": "文章详情",
      "source": "web_feedback",
      "createdAt": "2026-05-16T08:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1
  }
}
```

字段说明：

| 字段名 | 类型 | 说明 |
| --- | --- | --- |
| `items` | array | 当前页反馈列表 |
| `items[].id` | string | 反馈记录唯一标识 |
| `items[].userId` | string | 提交反馈的用户标识 |
| `items[].type` | string | 反馈类型 |
| `items[].content` | string | 反馈正文 |
| `items[].contact` | string | 联系方式，可能为空 |
| `items[].pageRoute` | string | 反馈发生时的前端路由 |
| `items[].pageTitle` | string | 反馈发生时的页面标题 |
| `items[].source` | string | 当前固定为 `web_feedback` |
| `items[].createdAt` | string | 反馈创建时间 |
| `pagination.page` | number | 当前页码 |
| `pagination.pageSize` | number | 当前每页条数 |
| `pagination.total` | number | 满足筛选条件的总记录数 |

## 7. 错误响应

### 7.1 参数错误

状态码：`400`

示例：

```json
{
  "message": "参数错误"
}
```

### 7.2 缺少令牌

状态码：`401`

示例：

```json
{
  "message": "未登录，且缺少反馈读取令牌"
}
```

### 7.3 令牌无效

状态码：`403`

示例：

```json
{
  "message": "反馈读取令牌无效"
}
```

### 7.4 服务端异常

状态码：`500`

示例：

```json
{
  "message": "反馈查询失败"
}
```

## 8. Hermes 调用示例

### 8.1 读取第一页全部反馈

```bash
curl --request GET \
  --url 'http://idapps.xzhmu.edu.cn/ai-web/api/feedback/external?page=1&pageSize=20' \
  --header 'x-internal-auth-token: pbdfrLdCfSeNTh0KBPgH8qTehWsfXrcbist2oGyfOOA'
```

### 8.2 读取 `ux` 类型反馈

```bash
curl --request GET \
  --url 'http://idapps.xzhmu.edu.cn/ai-web/api/feedback/external?type=ux&page=1&pageSize=20' \
  --header 'x-internal-auth-token: pbdfrLdCfSeNTh0KBPgH8qTehWsfXrcbist2oGyfOOA'
```

### 8.3 按时间范围读取反馈

```bash
curl --request GET \
  --url 'http://idapps.xzhmu.edu.cn/ai-web/api/feedback/external?startAt=2026-05-16T00%3A00%3A00.000Z&endAt=2026-05-16T23%3A59%3A59.999Z&page=1&pageSize=50' \
  --header 'x-internal-auth-token: pbdfrLdCfSeNTh0KBPgH8qTehWsfXrcbist2oGyfOOA'
```

### 8.4 使用 Bearer Token 调用

```bash
curl --request GET \
  --url 'http://idapps.xzhmu.edu.cn/ai-web/api/feedback/external?type=content&page=1&pageSize=20' \
  --header 'Authorization: Bearer pbdfrLdCfSeNTh0KBPgH8qTehWsfXrcbist2oGyfOOA'
```

## 9. Hermes 接入建议

建议 `Hermes` 按以下方式使用：

1. 首次接入先用 `page=1&pageSize=20` 验证链路是否通畅
2. 再按业务需要增加 `type` 或时间范围筛选
3. 使用分页循环拉取，直到本次已取数量覆盖 `pagination.total`
4. 本地保存最近一次同步时间，下次优先用 `startAt` 增量拉取

建议处理规则：

- 遇到 `401`：检查是否漏传令牌
- 遇到 `403`：检查令牌是否过期或配置错误
- 遇到 `400`：检查时间格式、分页参数和类型值
- 遇到 `500`：稍后重试，并记录请求参数用于排查

## 10. 建议的最小调用约定

为便于后续维护，建议 `Hermes` 固定采用以下约定：

- 固定使用 `x-internal-auth-token`
- 固定使用 `UTC` 时间字符串
- 固定携带 `page` 与 `pageSize`
- 默认单次拉取 `50` 条或 `100` 条
- 日志中记录请求时间、请求参数、状态码和返回总数

## 11. 对接确认项

`Hermes` 对接前建议确认以下几点：

- 生产环境网关是否保留 `/ai-web` 路径前缀
- `Hermes` 部署环境是否允许访问 `http://idapps.xzhmu.edu.cn`
- 令牌是否已同步到 `Hermes` 的安全配置中
- 是否需要按固定时间窗口执行增量同步

## 12. 文档结论

`Hermes` 只需携带正确的反馈读取令牌，调用以下地址即可完成读取：

```text
GET http://idapps.xzhmu.edu.cn/ai-web/api/feedback/external
```

推荐优先使用的请求头：

```text
x-internal-auth-token: <FEEDBACK_EXTERNAL_READ_TOKEN>
```
