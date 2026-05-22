# 企业微信推送接口文档索引

## 1. 文档说明

企业微信推送能力已按使用角色拆分为两份文档，减少单文档过长、职责混杂和后续维护漂移问题。

当前文档族已覆盖以下能力：

- 即时推送
- 每日聚合推送
- 每周聚合推送
- 08:00 补发聚合推送
- 标签映射、标签状态查看、标签同步触发
- 推送记录回查

当前实现要点：

- 真实消息模板统一为 `template_card.news_notice`
- 同一用户可同时维护 `instant`、`daily`、`weekly` 三条订阅
- 聚合推送记录会以 `delivery_mode=batch_user` 写入 `push_records`

## 2. 文档列表

### 2.1 对接方版

文件：`wecom_push_api_integrator.md`

适用对象：

- 内部脚本调用方
- 工作流平台接入方
- 验收与联调执行人员

主要内容：

- `daily`、`weekly`、`instant/deferred` 聚合推送接口
- `verify` 验证接口的调用流程
- 标签映射查询、标签状态查看、标签同步接口
- `records` 查询接口的请求与响应
- 内部令牌 Header 的传递方式
- 常见 `401`、`403`、`500` 的处理建议

### 2.2 运维版

文件：`wecom_push_api_ops.md`

适用对象：

- 服务端运维人员
- 管理员
- 推送链路维护人员

主要内容：

- 正式推送接口、聚合推送接口与标签接口的职责边界
- `DEV_AUTH_BYPASS`、内部令牌和定时调度配置的使用原则
- 标签映射表、同步状态与推送记录的排障方法
- 定时标签同步、日报、周报和 08:00 补发的运维动作

## 3. 阅读建议

- 仅需调用联调接口或读取标签状态、推送记录时，优先阅读 `wecom_push_api_integrator.md`
- 需要维护环境配置、鉴权方式、定时规则和排障时，优先阅读 `wecom_push_api_ops.md`
- 新接入脚本建议先阅读两份文档，再选择 `POST /api/push/verify` 或聚合推送接口做联调确认

## 4. 当前接口范围

当前企业微信推送能力对应以下接口：

- `POST /api/push/instant`
- `POST /api/push/daily`
- `POST /api/push/weekly`
- `POST /api/push/instant/deferred`
- `POST /api/push/verify`
- `GET /api/push/records`
- `GET /api/push/tags/mappings`
- `GET /api/push/tags/state`
- `POST /api/push/tags/ensure`
- `POST /api/push/tags/sync`

## 5. 维护原则

- 对接方调用方式发生变化时，优先更新 `wecom_push_api_integrator.md`
- 配置项、鉴权方式、调度策略、日志策略、运维动作变化时，优先更新 `wecom_push_api_ops.md`
- 若接口协议本身发生重大变更，再同步调整本索引页
