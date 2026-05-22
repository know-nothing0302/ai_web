# 文章发布接口文档索引

## 1. 文档说明

文章发布能力已按使用角色拆分为两份文档，减少单文档过长、职责混杂和后续维护漂移问题。

## 2. 文档列表

### 2.1 对接方版

文件：`article_publish_api_integrator.md`

适用对象：

- 外部系统调用方
- 智能体平台接入方
- 工作流脚本维护人员

主要内容：

- 获取发布 Token 的流程
- 发布接口的请求与响应
- `channelCode`、`category`、`layout` 的使用约束
- `401` 重签与重试建议

### 2.2 运维版

文件：`article_publish_api_ops.md`

适用对象：

- 服务端运维人员
- 管理员
- 配置与密钥维护人员

主要内容：

- 环境变量与默认值
- RSA 公私钥配置
- `activeKid` 与 key ring 关系
- Token 轮换脚本
- 密钥轮换与故障排查
- 发布相关数据库结构与预置栏目数据

## 3. 阅读建议

- 仅需调用接口时，优先阅读 `article_publish_api_integrator.md`
- 需要维护环境配置、密钥、脚本、数据库结构和排障时，优先阅读 `article_publish_api_ops.md`
- 新接入系统建议同时阅读两份文档，并结合 `GET /api/articles/publish/spec` 做最终联调确认

## 4. 当前接口范围

当前文章发布能力对应以下接口：

- `GET /api/articles/publish/spec`
- `POST /api/articles/publish/token`
- `POST /api/articles/publish`

## 5. 维护原则

- 对接方调用方式发生变化时，优先更新 `article_publish_api_integrator.md`
- 配置项、密钥、轮换策略、脚本行为变化时，优先更新 `article_publish_api_ops.md`
- 若接口协议本身发生重大变更，再同步调整本索引页
