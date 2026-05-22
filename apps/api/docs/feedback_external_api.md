# 用户反馈外部读取接口文档

## 1. 接口说明

用于外部系统按基础筛选条件读取用户反馈列表。

- 方法：`GET`
- 路径：`/api/feedback/external`
- 返回格式：`application/json`

## 2. 鉴权方式

接口支持以下两种请求头写法，二选一即可：

```bash
x-internal-auth-token: <token>
```

或：

```bash
Authorization: Bearer <token>
```

服务端环境变量：

```bash
FEEDBACK_EXTERNAL_READ_TOKEN=<your-token>
```

## 3. 查询参数

| 参数名 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `type` | string | 否 | 反馈类型，可选值：`bug`、`ux`、`content`、`other` |
| `startAt` | string | 否 | 开始时间，ISO 8601 时间字符串，含时区偏移 |
| `endAt` | string | 否 | 结束时间，ISO 8601 时间字符串，含时区偏移 |
| `page` | number | 否 | 页码，默认 `1` |
| `pageSize` | number | 否 | 每页条数，默认 `20`，最大 `100` |

## 4. 返回字段

```json
{
  "items": [
    {
      "id": "uuid",
      "userId": "tester-1",
      "type": "ux",
      "content": "希望右侧反馈入口成功提示更轻一些。",
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

说明：

- `items`：当前页反馈列表
- `pagination.page`：当前页码
- `pagination.pageSize`：当前每页条数
- `pagination.total`：满足筛选条件的总记录数

## 5. 错误码

| 状态码 | 含义 |
| --- | --- |
| `400` | 查询参数错误 |
| `401` | 未登录且缺少反馈读取令牌 |
| `403` | 反馈读取令牌无效 |
| `500` | 反馈查询失败 |

## 6. 调用示例

### 6.1 使用专用请求头

```bash
curl --request GET \
  --url 'http://localhost:3000/api/feedback/external?type=ux&page=1&pageSize=20' \
  --header 'x-internal-auth-token: <token>'
```

### 6.2 使用 Bearer Token

```bash
curl --request GET \
  --url 'http://localhost:3000/api/feedback/external?startAt=2026-05-16T00%3A00%3A00.000Z&endAt=2026-05-16T23%3A59%3A59.999Z&page=1&pageSize=50' \
  --header 'Authorization: Bearer <token>'
```
