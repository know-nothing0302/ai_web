# 文章发布接口说明（运维版）

## 1. 适用对象

本文档面向服务端维护人员、运维人员和管理员，聚焦以下内容：

1. 环境变量与默认值
2. 密钥与客户端凭据管理
3. Token 轮换脚本
4. 常见故障与排障建议

若只需要调用接口，请阅读 `article_publish_api_integrator.md`。

## 2. 当前实现范围

当前实现包含以下接口：

- `GET /api/articles/publish/spec`
- `POST /api/articles/publish/token`
- `POST /api/articles/publish`

实现特征：

- 签发算法固定为 `RS256`
- 服务端使用私钥签发，使用公钥验签
- JWT Header 中写入 `kid`
- Token 签发与文章发布均可受 `ARTICLE_PUBLISH_ALLOWED_USER_IDS` 控制

## 2.1 数据库结构（发布链路相关）

发布能力当前依赖以下表：

- `article_channels`：栏目主数据（`code`、`name`、`enabled`、`sort_order`）
- `articles`：文章主表（`created_by_user_id`、`title`、`summary`、`content`、`original_url`、`channel_code`、`category`、`status`、`published_at`）

接口与表字段关系要点：

- `POST /api/articles/publish` 会先解析栏目，再写入 `articles.channel_code` 与 `articles.category`（栏目名称）
- `POST /api/articles/publish` 若携带 `article.originalUrl`，会写入 `articles.original_url`
- `GET /api/articles/publish/spec` 中 `supportedChannels` 来源于 `article_channels` 且仅返回 `enabled=true` 的栏目
- 数据库层 `articles.status` 允许 `draft/published`，但发布接口入参只允许 `draft`（`published` 由后台管理接口使用）

## 3. 环境变量

### 3.1 核心变量

- `ARTICLE_PUBLISH_JWT_ISSUER`：默认 `ai_web_publish`
- `ARTICLE_PUBLISH_JWT_AUDIENCE`：默认 `ai_web_articles`
- `ARTICLE_PUBLISH_JWT_TTL_SECONDS`：默认 `900`
- `ARTICLE_PUBLISH_JWT_MAX_TTL_SECONDS`：默认 `900`
- `ARTICLE_PUBLISH_JWT_ACTIVE_KID`：默认 `v1`
- `ARTICLE_PUBLISH_JWT_PUBLIC_KEYS`：公钥集合
- `ARTICLE_PUBLISH_JWT_PRIVATE_KEYS`：私钥集合
- `ARTICLE_PUBLISH_TOKEN_CLIENTS`：签发客户端集合
- `ARTICLE_PUBLISH_ALLOWED_USER_IDS`：允许签发与发布的业务用户列表

### 3.2 实际生效规则

- 若 `ARTICLE_PUBLISH_ALLOWED_USER_IDS` 为空，则不限制 `userId`
- 若 `ARTICLE_PUBLISH_TOKEN_CLIENTS` 为空，`/publish/token` 返回 `500`
- 若公钥集合无可用项，`/publish` 返回 `500`
- 若私钥集合无可用项，`/publish/token` 返回 `500`
- `ARTICLE_PUBLISH_JWT_ACTIVE_KID` 必须在对应 key ring 中命中，否则视为配置错误

### 3.3 密钥格式

支持两种写法：

- `base64:<pem-base64>`
- 直接 PEM 文本，使用 `\n` 转义换行

配置格式：

```env
ARTICLE_PUBLISH_JWT_ACTIVE_KID=v1
ARTICLE_PUBLISH_JWT_PUBLIC_KEYS=v1:base64:<public-pem-base64>,v0:base64:<old-public-pem-base64>
ARTICLE_PUBLISH_JWT_PRIVATE_KEYS=v1:base64:<private-pem-base64>,v0:base64:<old-private-pem-base64>
ARTICLE_PUBLISH_TOKEN_CLIENTS=workbuddy:secret-1,hermes:secret-2
ARTICLE_PUBLISH_ALLOWED_USER_IDS=100001,100002
```

注意：

- `kid:key` 使用首个 `:` 分隔，后续内容全部视为值本体
- 配置错误不会部分降级为成功，通常直接表现为 `500`

## 4. JWT 规则

### 4.1 签发规则

签发时会写入：

- `alg=RS256`
- `keyid=activeKid`
- `issuer=ARTICLE_PUBLISH_JWT_ISSUER`
- `audience=ARTICLE_PUBLISH_JWT_AUDIENCE`
- `subject=userId`
- `expiresIn=ttlSeconds`

### 4.2 验签规则

验签时校验：

- `algorithms=["RS256"]`
- `issuer`
- `audience`
- `subject`
- `iat`、`exp` 均为数字

处理逻辑：

1. 先读取 Bearer Token
2. 解析 Header 中的 `kid`
3. 若 `kid` 命中公钥集合，则优先用该公钥验签
4. 若 `kid` 缺失或未命中，则遍历全部公钥做兼容校验
5. 全部失败则返回 `401 invalid_token`

### 4.3 与规格接口的关系

`GET /api/articles/publish/spec` 会暴露以下运维观察信息：

- `activeKid`
- `publicKeyCount`
- `privateKeyCount`
- `tokenClientCount`
- `ttlSeconds`
- `maxTtlSeconds`

可用于外部探测与运维核对。

## 5. 栏目相关运维点

### 5.1 发布接口的栏目要求

发布请求中：

- `channelCode` 与 `category` 至少提供一个
- 最终解析出的栏目必须存在且启用

### 5.2 栏目来源

系统通过 `article_channels` 表维护栏目，并在初始化时预置：

- `daily-ai-summary`
- `policy-ethics`
- `medical-frontier`
- `campus-news`
- `edu-plus-ai`
- `tools-recommend`
- `student-zone`

### 5.3 兼容映射

当前代码中的 `category -> channelCode` 兼容映射为：

- `AI政策` -> `policy-ethics`
- `通知公告` -> `campus-news`
- `行业动态` -> `daily-ai-summary`
- `每日AI摘要` -> `daily-ai-summary`
- `AI政策与伦理` -> `policy-ethics`
- `医学AI前沿` -> `medical-frontier`
- `校内AI动态` -> `campus-news`
- `AI+医学教育` -> `edu-plus-ai`
- `工具与应用推荐` -> `tools-recommend`
- `学生专栏` -> `student-zone`

若未来新增栏目，应同步评估：

1. 是否需要更新初始化栏目数据
2. 是否需要扩充 `category` 兼容映射
3. 是否需要通知对接方改为显式传递 `channelCode`

## 6. 密钥轮换

### 6.1 推荐流程

1. 生成新的 RSA 密钥对，例如 `v2`
2. 将 `v2` 公钥追加到 `ARTICLE_PUBLISH_JWT_PUBLIC_KEYS`
3. 将 `v2` 私钥追加到 `ARTICLE_PUBLISH_JWT_PRIVATE_KEYS`
4. 将 `ARTICLE_PUBLISH_JWT_ACTIVE_KID` 切换到 `v2`
5. 保留旧公钥一段缓冲期，兼容未过期 Token
6. 缓冲期结束后移除旧公钥和旧私钥

### 6.2 注意事项

- 先追加，后切换，不能先改 `activeKid`
- 验签虽支持遍历全部公钥回退，但这只是兼容机制，不应长期依赖
- 若切换后立即出现大面积 `401`，优先检查公钥集合、`activeKid` 和调用方缓存 token

## 7. 客户端凭据管理

`ARTICLE_PUBLISH_TOKEN_CLIENTS` 控制可调用签发接口的客户端集合。

建议：

- 每个调用方分配独立 `clientId`
- 定期轮换 `clientSecret`
- 凭据变更后同步通知调用方立即刷新本地 token
- 通过访问日志区分不同 `clientId` 的调用情况

## 8. Token 轮换脚本

项目内置脚本：

- 路径：`src/scripts/rotate_publish_token.ts`
- npm 命令：`npm run token:rotate-publish -- [参数]`

### 8.1 脚本行为

1. 读取本地 token 文件
2. 若文件不存在或内容不可解析，则重新签发
3. 计算剩余有效期
4. 剩余秒数大于阈值时跳过签发
5. 剩余秒数小于等于阈值时重新签发
6. 写回新 token，并将文件权限设置为 `600`

### 8.2 参数与环境变量

必填项：

- `--base-url` 或 `PUBLISH_TOKEN_BASE_URL`
- `--client-id` 或 `PUBLISH_TOKEN_CLIENT_ID`
- `--client-secret` 或 `PUBLISH_TOKEN_CLIENT_SECRET`
- `--user-id` 或 `PUBLISH_TOKEN_USER_ID`
- `--output-file` 或 `PUBLISH_TOKEN_OUTPUT_FILE`

可选项：

- `--ttl-seconds` 或 `PUBLISH_TOKEN_TTL_SECONDS`
- `--min-remaining-seconds` 或 `PUBLISH_TOKEN_MIN_REMAINING_SECONDS`，默认 `120`

### 8.3 手动执行示例

```bash
npm run token:rotate-publish -- \
  --base-url http://127.0.0.1:3000 \
  --client-id workbuddy \
  --client-secret 'replace-with-secret' \
  --user-id 100002 \
  --output-file /opt/idapps/ai_web/run/publish_token.json \
  --ttl-seconds 300 \
  --min-remaining-seconds 120
```

### 8.4 输出文件字段

输出文件会包含：

- `tokenType`
- `accessToken`
- `expiresIn`
- `issuedAt`
- `expiresAt`
- `issuer`
- `audience`
- `subject`
- `kid`
- `algorithm`
- `issueResult`
- `updatedAt`
- `source`

### 8.5 定时执行示例

```bash
*/2 * * * * cd /opt/idapps/ai_web/apps/api && npm run token:rotate-publish -- --base-url http://127.0.0.1:3000 --client-id workbuddy --client-secret 'replace-with-secret' --user-id 100002 --output-file /opt/idapps/ai_web/run/publish_token.json --ttl-seconds 300 --min-remaining-seconds 120 >> /opt/idapps/ai_web/run/token_rotate.log 2>&1
```

## 9. 排障建议

### 9.1 签发接口返回 `401`

优先检查：

- `Authorization: Basic ...` 是否正确
- `clientId`、`clientSecret` 是否已轮换
- Base64 编码前是否使用 `clientId:clientSecret` 原始格式

### 9.2 发布接口返回 `401`

优先检查：

- Bearer Token 是否缺失
- token 是否过期
- `iss`、`aud`、`sub` 是否与当前配置一致
- `ARTICLE_PUBLISH_JWT_PUBLIC_KEYS` 是否包含对应公钥
- `activeKid` 轮换后调用方是否仍在使用旧缓存

### 9.3 返回 `403`

优先检查：

- `userId` 是否存在于 `ARTICLE_PUBLISH_ALLOWED_USER_IDS`
- 当前环境是否误用了测试账号或生产账号

### 9.4 返回 `400`

优先检查：

- 是否缺少 `content` 与 `layout`
- 是否缺少 `channelCode` 与 `category`
- `channelCode` 是否存在且启用
- `category` 是否命中兼容映射

### 9.5 返回 `500`

优先检查：

- `ARTICLE_PUBLISH_TOKEN_CLIENTS` 是否为空
- 公钥或私钥集合是否为空
- `ARTICLE_PUBLISH_JWT_ACTIVE_KID` 是否能命中 key ring
- 密钥值是否为合法 PEM 或合法 base64

## 10. 运行期建议

- 生产环境建议将 `ARTICLE_PUBLISH_JWT_TTL_SECONDS` 控制在 `300-600` 秒
- `ARTICLE_PUBLISH_JWT_MAX_TTL_SECONDS` 不建议大于 `600`
- 私钥和客户端密钥存放于 KMS 或 Secrets Manager
- 定期轮换私钥与客户端密钥
- 在关键位置保留接口日志、签发日志和失败日志，便于排障
- 定期运行 `npm run test:publish-flow` 验证签发和发布链路
