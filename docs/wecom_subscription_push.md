# 企业微信栏目订阅推送系统开发文档

> **版本**：v1.1  
> **日期**：2026-04-14  
> **适用场景**：`ai_web` 独立部署场景下，自带企业微信适配、订阅配置、定时推送与后续模板卡片互动能力，不依赖 `qywx_app`、`config_admin` 作为运行时模块  
> **核心 API 域名**：`https://qyapi.weixin.qq.com`

---

## 目录

1. [系统总体设计](#1-系统总体设计)
2. [access_token 管理](#2-access_token-管理)
3. [企业微信标签管理 API](#3-企业微信标签管理-api)
4. [消息卡片制作与发送 API](#4-消息卡片制作与发送-api)
5. [消息交互边界与订阅管理建议](#5-消息交互边界与订阅管理建议)
6. [消息互动回调处理](#6-消息互动回调处理)
7. [用户 userid 获取（OAuth 免登录）](#7-用户-userid-获取oauth-免登录)
8. [数据库设计](#8-数据库设计)
9. [定时任务设计（标签维护 & 消息推送）](#9-定时任务设计标签维护--消息推送)
10. [完整业务流程详解](#10-完整业务流程详解)
11. [错误码速查表](#11-错误码速查表)
12. [频率限制汇总](#12-频率限制汇总)
13. [安全性设计](#13-安全性设计)
14. [关键难点与解决方案](#14-关键难点与解决方案)

---

## 1. 系统总体设计

### 1.1 功能概述

当前文档需要按“`ai_web` 可独立部署”重写：可以参考现有 `qywx_app` 中的 token、回调与日志处理经验，但不能把 `qywx_app`、`config_admin` 作为运行时依赖。

本期建议先落地以下主流程：

```
用户（Web 端，CAS 登录）→ 订阅栏目与频率 → ai_web 保存 subscriptions.channel_codes
                                                       ↓
                                          node-cron 定时筛选已发布内容
                                                       ↓
                                  ai_web 内部企业微信适配模块直接发送消息
                                                       ↓
                               ai_web 负责 access_token、调用企微 API、记录日志
```

说明：

| 项目 | 当前情况 |
|------|------|
| 用户身份获取 | 当前 `ai_web` 已使用 CAS 会话，订阅接口直接取 `session.user.id`，不是企微内 H5 静默 OAuth |
| 订阅数据结构 | 当前只有 `subscriptions` 表，按用户保存 `channel_codes`、`frequency`、`enabled`，尚无栏目-标签映射表 |
| 推送方式 | 当前 `ai_web` 使用 `node-cron` 执行每日推送；独立部署后应由 `ai_web` 内置企业微信发送能力 |
| 可参考实现 | `qywx_app` 已有 `access_token`、消息验签、日志等实现，可作为迁移参考，不作为运行时依赖 |
| 尚未落地能力 | `ai_web` 内置企业微信客户端、标签建模、标签成员同步、模板卡片高级互动回调 |

### 1.2 系统架构图

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              用户与访问入口                                 │
│   浏览器/H5（订阅页、管理页）                  企业微信客户端（接收推送消息）   │
└───────────────────────┬──────────────────────────────┬─────────────────────┘
                        │ CAS 登录态                    │ 应用消息投递
                        ▼                              ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                           Nginx / API 入口层                                │
│                HTTPS 接入、会话透传、反向代理、基础安全控制                   │
└───────────────────────┬──────────────────────────────┬─────────────────────┘
                        │                              │
                        ▼                              ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ ai_web/apps/api                                                           │
│ Node.js + Express + TypeScript                                            │
│ - 文章管理                                                                │
│ - 栏目管理                                                                │
│ - 订阅管理                                                                │
│ - 推送调度(node-cron)                                                     │
│ - 企业微信客户端(access_token/消息发送/标签/回调)                         │
│ - 配置读取与审计日志                                                      │
└──────────────────────────────┬───────────────────────────────┬─────────────┘
                               │                               │
                               ▼                               ▼
                      ┌────────────────┐              ┌─────────────────────┐
                      │ PostgreSQL     │              │ Redis（可复用）     │
                      │ 业务数据/配置  │              │ token 缓存/幂等去重 │
                      └────────────────┘              └──────────┬──────────┘
                                                                 │
                                                                 ▼
                                                        ┌──────────────────┐
                                                        │ 企业微信开放接口  │
                                                        └──────────────────┘
```

### 1.3 核心模块职责

| 模块 | 职责 |
|------|------|
| `ai_web` 订阅与内容模块 | 复用现有 `articles`、`article_channels`、`subscriptions` 表与接口，维护栏目、文章、订阅频率与启停状态 |
| `ai_web` 推送调度模块 | 使用 `node-cron` 执行每日推送；即时推送由管理接口触发；一期按用户读取订阅并逐个发送 |
| `ai_web` 企业微信适配模块 | 在本项目内实现 `access_token` 管理、消息发送、标签接口封装、回调验签解密、详细日志 |
| `ai_web` 配置管理模块 | 将企业微信应用配置、密钥标识、内部鉴权参数纳入本项目配置体系，不依赖外部配置后台 |
| PostgreSQL | 作为主业务库，同时可增加企业微信配置表、标签映射表、推送记录表等独立部署所需实体 |
| Redis | 可复用现有基础设施，优先用于 `access_token` 缓存、消息幂等去重、短时锁，不作为必须的任务编排组件 |

### 1.4 当前结构修正结论

| 原文不合理点 | 修正结论 |
|------|------|
| 将“企微内 H5 + OAuth 获取 userid”写成前置条件 | 当前阶段应以现有 CAS 登录态为主，企微内 OAuth 作为后续增强能力 |
| 将“标签分组推送”写成现状主路径 | 当前系统尚未具备标签映射与成员同步，应该先按订阅记录逐用户发送 |
| 将 “Celery + RabbitMQ” 写成默认组件 | 当前项目主后端为 Node.js，且业务量较小，一期继续使用 `node-cron` 即可 |
| 将 `qywx_app`、`config_admin` 作为默认依赖 | 本项目可能独立部署，企业微信适配与配置管理能力必须在 `ai_web` 内自建 |
| 默认认为已支持“消息内退订闭环” | 当前不应把消息卡片作为退订主入口，订阅变更仍应以 Web/H5 页面或受控后台接口为准 |

### 1.5 实施方案与排期
- 第一阶段：在 ai_web 内新增企业微信适配模块，覆盖 access_token 管理、消息发送、统一错误处理、详细日志，替换外部 QYWX_API_URL 依赖。
- 第一阶段：补充本项目自有配置承载方式，至少落地企业微信应用配置、回调配置、内部鉴权参数，优先环境变量 + 数据表双层方案。
- 第一阶段：新增推送记录表，记录发送目标、消息类型、企微返回值、重试状态，便于排障和审计。
- 第二阶段：引入栏目标签映射表与标签同步任务，将“按用户逐个发送”升级为“按标签发送”，但保留逐用户发送作为降级路径。
- 第二阶段：补齐标签相关接口封装，包括创建标签、查询成员、增删成员、同步差异与异常回收。
- 第三阶段：补充模板卡片高级互动与回调审计能力，消息继续以展示与跳转为主，不承担退订闭环。
建议排期
- 第 1 周：完成 ai_web 内置企微客户端、配置读取、日志与推送记录表。
- 第 2 周：将现有推送链路改为本地发送，打通每日推送与即时推送，完成联调。
- 第 3 周：设计并落地标签映射、标签同步任务、异常处理。
- 第 4 周：补充模板卡片高级互动回调与灰度验证。

### 1.6 第一阶段验收补充
- 企业微信测试目标不再使用 `.env` 中的临时用户值作为模块正式配置来源，真实验收必须从 `subscriptions.qywx_user_id` 读取有效订阅对象。
- 推送成功验收必须走现有推送业务链路，不再只调用底层企业微信客户端；推荐通过 `POST /api/push/verify` 选择栏目与频率执行单目标验证。
- 推送链路验收以 `push_records` 落库结果为准，至少校验 `status=success`、`wecom_msgid`、`response_code`、`sent_at` 已写入。
- 管理排障时可通过 `GET /api/push/records?limit=20` 查看最近推送记录，确认请求体、返回体、错误信息与重试次数。
- 服务重启前应归档历史 `api.log`，保证当前会话日志纯净，避免新旧版本日志混杂影响排障判断。

---

## 2. access_token 管理

### 2.1 获取接口

| 项目 | 内容 |
|------|------|
| **请求方法** | GET（HTTPS） |
| **接口地址** | `https://qyapi.weixin.qq.com/cgi-bin/gettoken` |

**请求参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `corpid` | string | ✅ | 企业ID，在企业微信管理后台获取 |
| `corpsecret` | string | ✅ | 应用的凭证密钥（应用须处于启用状态） |

**完整请求示例：**

```
GET https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=wx_CORP_ID&corpsecret=APP_SECRET
```

**返回结果：**

```json
{
  "errcode": 0,
  "errmsg": "ok",
  "access_token": "accesstoken000001",
  "expires_in": 7200
}
```

### 2.2 Token 核心特性

| 特性 | 说明 |
|------|------|
| **有效期** | 默认 7200 秒（2小时） |
| **幂等性** | 有效期内重复获取返回相同结果，不延长有效期 |
| **独立性** | 每个应用的 token 彼此独立，缓存时须按应用区分 key |
| **提前失效** | 企业微信可能出于运营原因提前使 token 失效，需实现 `errcode=42001` 时自动重获逻辑 |
| **禁止暴露** | token 只能在后端使用，严禁返回给前端 |

### 2.3 生产环境缓存方案（Redis）

```
业务代码调用 API
        ↓
 Redis 有 token？
  (key: wx:token:{app_name})
 YES → 直接使用
 NO  → 调用 gettoken 接口 → 写入 Redis（TTL = expires_in - 300 秒）
                                          ↓
                               调用企微 API
                                          ↓
                          返回 errcode=42001？
                               YES → 删除 Redis key → 重新获取（最多3次）
```

**关键设计要点：**

| 要点 | 说明 |
|------|------|
| TTL 提前量 | Redis 过期时间 = `expires_in - 300`（提前5分钟过期），防止临界失效 |
| 按应用分 key | `wx:token:{app_name}`，不同 secret 对应不同 key |
| 42001 触发重取 | API 返回 42001 时立即删除缓存重获 token，最多重试 3 次 |
| 分布式部署 | 多实例共享同一 Redis，保证所有节点使用同一 token |
| 禁止频繁主动刷新 | 不应每次请求前都调用 gettoken，会触发频率拦截 |

**Python 代码示例：**

```python
import redis
import requests

r = redis.Redis(host='localhost', port=6379, decode_responses=True)

CORP_ID = "your_corp_id"
CORP_SECRET = "your_corp_secret"
APP_NAME = "push_app"

def get_access_token() -> str:
    cache_key = f"wx:token:{APP_NAME}"
    token = r.get(cache_key)
    if token:
        return token
    # 从企微接口获取
    resp = requests.get(
        "https://qyapi.weixin.qq.com/cgi-bin/gettoken",
        params={"corpid": CORP_ID, "corpsecret": CORP_SECRET},
        timeout=5
    ).json()
    if resp.get("errcode") != 0:
        raise Exception(f"get token failed: {resp}")
    token = resp["access_token"]
    expires_in = resp.get("expires_in", 7200)
    r.setex(cache_key, expires_in - 300, token)
    return token

def wecom_api_call(url: str, payload: dict, max_retry: int = 3) -> dict:
    for attempt in range(max_retry):
        token = get_access_token()
        resp = requests.post(f"{url}?access_token={token}", json=payload, timeout=10).json()
        if resp.get("errcode") == 42001:
            # token 失效，删除缓存，下次重新获取
            r.delete(f"wx:token:{APP_NAME}")
            continue
        return resp
    raise Exception("API call failed after max retries")
```

---

## 3. 企业微信标签管理 API

> **通用说明：**
> - 所有接口须通过 `access_token` URL 参数传递凭证
> - 所有接口须使用 **HTTPS**
> - 标签操作需使用**创建该标签的应用**对应的 access_token

### 3.1 创建标签

| 项目 | 内容 |
|------|------|
| **请求方法** | POST（HTTPS） |
| **接口地址** | `https://qyapi.weixin.qq.com/cgi-bin/tag/create?access_token=ACCESS_TOKEN` |

**请求 Body：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `tagname` | string | ✅ | 标签名称，最长 32 个字（汉字或英文），不可与已有标签重名 |
| `tagid` | int | ❌ | 标签ID（非负整型）；不指定则按当前最大 ID 自增 |

```json
// 请求示例
{"tagname": "科技栏目订阅者", "tagid": 100}

// 返回示例
{"errcode": 0, "errmsg": "created", "tagid": 100}
```

**⚠️ 重要限制：**
- 企业标签总数上限：**3000 个**
- 标签属于创建它的应用，只有该应用才能对其增删成员

### 3.2 获取标签列表

| 项目 | 内容 |
|------|------|
| **请求方法** | GET（HTTPS） |
| **接口地址** | `https://qyapi.weixin.qq.com/cgi-bin/tag/list?access_token=ACCESS_TOKEN` |

```json
// 返回示例
{
  "errcode": 0, "errmsg": "ok",
  "taglist": [
    {"tagid": 1, "tagname": "技术资讯订阅者"},
    {"tagid": 2, "tagname": "行政通知订阅者"}
  ]
}
```

### 3.3 获取标签成员

| 项目 | 内容 |
|------|------|
| **请求方法** | GET（HTTPS） |
| **接口地址** | `https://qyapi.weixin.qq.com/cgi-bin/tag/get?access_token=ACCESS_TOKEN&tagid=TAGID` |

```json
// 返回示例
{
  "errcode": 0, "errmsg": "ok",
  "tagname": "技术资讯订阅者",
  "userlist": [
    {"userid": "zhangsan"},
    {"userid": "lisi"}
  ],
  "partylist": []
}
```

### 3.4 增加标签成员

| 项目 | 内容 |
|------|------|
| **请求方法** | POST（HTTPS） |
| **接口地址** | `https://qyapi.weixin.qq.com/cgi-bin/tag/addtagusers?access_token=ACCESS_TOKEN` |

**请求参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `tagid` | int | ✅ | 标签ID |
| `userlist` | array | 条件 | 企业成员ID列表，单次 ≤ **1000** 个 |
| `partylist` | array | 条件 | 企业部门ID列表，单次 ≤ **100** 个 |

> `userlist` 和 `partylist` 不能同时为空；单个标签下成员 + 部门总数不超过 **3万个**

```json
// 请求示例
{"tagid": 100, "userlist": ["zhangsan", "lisi"]}

// 成功返回
{"errcode": 0, "errmsg": "ok"}

// 部分非法时返回（仍视为成功，需处理 invalidlist）
{"errcode": 0, "errmsg": "ok", "invalidlist": "usr1|usr2"}
```

### 3.5 删除标签成员

| 项目 | 内容 |
|------|------|
| **请求方法** | POST（HTTPS） |
| **接口地址** | `https://qyapi.weixin.qq.com/cgi-bin/tag/deltagusers?access_token=ACCESS_TOKEN` |

参数与"增加标签成员"相同，单次 ≤ 1000 人。

```json
// 成功返回
{"errcode": 0, "errmsg": "deleted"}

// 全部非法
{"errcode": 40031, "errmsg": "all list invalid"}
```

### 3.6 更新标签名字

```
POST https://qyapi.weixin.qq.com/cgi-bin/tag/update?access_token=ACCESS_TOKEN
{"tagid": 100, "tagname": "新标签名"}
```

### 3.7 删除标签

```
GET https://qyapi.weixin.qq.com/cgi-bin/tag/delete?access_token=ACCESS_TOKEN&tagid=100
```

### 3.8 标签管理难点说明

**1. 标签的创建时机**

在订阅系统启动时，应为每个栏目预先创建对应标签，并将 `tagid` 写入业务数据库的 `wecom_tag_mapping` 表。不要在每次推送前动态创建，避免重名和配额浪费。

**2. 标签成员同步（每日 diff）**

每日定时任务核心逻辑：

```python
def sync_tag_members(column_id: int):
    tag_id = get_tagid_by_column(column_id)
    
    # 1. 从数据库获取当前应该订阅的用户集合
    db_subscribers = set(get_active_subscribers(column_id))  # DB 中 status=1
    
    # 2. 从企微获取标签当前成员集合
    wecom_members = set(get_tag_members(tag_id))
    
    # 3. 计算差集
    to_add = db_subscribers - wecom_members      # 需要新增到标签
    to_remove = wecom_members - db_subscribers   # 需要从标签移除
    
    # 4. 分批执行（每批最多1000人）
    batch_add_tag_members(tag_id, list(to_add), batch_size=1000)
    batch_remove_tag_members(tag_id, list(to_remove), batch_size=1000)
```

**3. 权限边界**

标签只能由**创建该标签的应用**的 secret 生成的 access_token 来增删成员。如果使用了多个应用，务必保证标签的创建者与操作者是同一个应用。

---

## 4. 消息卡片制作与发送 API

### 4.1 发送应用消息接口

| 项目 | 内容 |
|------|------|
| **请求方法** | POST（HTTPS） |
| **接口地址** | `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=ACCESS_TOKEN` |

**通用参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `touser` | string | 条件 | 成员ID列表，`\|`分隔，最多1000个；`@all`=全员 |
| `toparty` | string | 条件 | 部门ID列表，`\|`分隔，最多100个 |
| `totag` | string | 条件 | **标签ID列表**，`\|`分隔，最多100个（订阅推送核心参数） |
| `msgtype` | string | ✅ | 消息类型，模板卡片填 `template_card` |
| `agentid` | int | ✅ | 企业应用ID |
| `enable_duplicate_check` | int | ❌ | 1=开启重复消息检查，默认0 |
| `duplicate_check_interval` | int | ❌ | 重复检查间隔秒数，默认1800s，最大4小时 |

> `touser`、`toparty`、`totag` 三者不能同时为空

**按标签群发示例：**

```json
{
  "totag": "100",
  "msgtype": "template_card",
  "agentid": 1000001,
  "template_card": { ... }
}
```

**接口返回：**

```json
{
  "errcode": 0,
  "errmsg": "ok",
  "invalidtag": "",
  "msgid": "XXXXXXXX",
  "response_code": "RESPONSE_CODE"  // 模板卡片专有，72小时内有效，仅能用一次
}
```

> **⚠️ 重要**：务必保存返回的 `response_code`，用于后续更新卡片展示状态或按钮文案；当前不将其用于订阅退订闭环。

### 4.2 模板卡片类型概览

| card_type | 类型 | 适用场景 | 支持回调按钮 |
|-----------|------|----------|-------------|
| `text_notice` | 文本通知型 | 纯文字推送、简报 | 通过 `action_menu` 支持 |
| `news_notice` | 图文展示型 | 带封面图的推送 | 通过 `action_menu` 支持 |
| `button_interaction` | **按钮交互型** | **需要用户点击操作** | ✅ 原生 `button_list` 回调 |

### 4.3 text_notice（文本通知型）完整字段

```json
{
    "touser" : "UserID1|UserID2|UserID3",
    "toparty" : "PartyID1 | PartyID2",
    "totag" : "TagID1 | TagID2",
    "msgtype" : "template_card",
    "agentid" : 1,
    "template_card" : {
        "card_type" : "text_notice",
        "source" : {
            "icon_url": "图片的url",
            "desc": "企业微信",
            "desc_color": 1
        },
        "action_menu": {
            "desc": "卡片副交互辅助文本说明",
            "action_list": [
                {"text": "查看详情", "key": "VIEW_DETAIL"},
                {"text": "查看栏目", "key": "VIEW_CHANNEL"}
            ]
        },
        "task_id": "task_id",
        "main_title" : {
            "title" : "欢迎使用企业微信",
            "desc" : "您的好友正在邀请您加入企业微信"
        },
        "quote_area": {
            "type": 1,
            "url": "https://work.weixin.qq.com",
            "title": "企业微信的引用样式",
            "quote_text": "企业微信真好用呀真好用"
        },
        "emphasis_content": {
            "title": "100",
            "desc": "核心数据"
        },
        "sub_title_text" : "下载企业微信还能抢红包！",
        "horizontal_content_list" : [
            {
                "keyname": "邀请人",
                "value": "张三"
            },
            {
                "type": 1,
                "keyname": "企业微信官网",
                "value": "点击访问",
                "url": "https://work.weixin.qq.com"
            },
            {
                "type": 2,
                "keyname": "企业微信下载",
                "value": "企业微信.apk",
                "media_id": "文件的media_id"
            },
            {
                "type": 3,
                "keyname": "员工信息",
                "value": "点击查看",
                "userid": "zhangsan"
            }
        ],
        "jump_list" : [
            {
                "type": 1,
                "title": "企业微信官网",
                "url": "https://work.weixin.qq.com"
            },
            {
                "type": 2,
                "title": "跳转小程序",
                "appid": "小程序的appid",
                "pagepath": "/index.html"
            }
        ],
        "card_action": {
            "type": 2,
            "url": "https://work.weixin.qq.com",
            "appid": "小程序的appid",
            "pagepath": "/index.html"
        }
    },
    "enable_id_trans": 0,
    "enable_duplicate_check": 0,
    "duplicate_check_interval": 1800
}
```
参数说明：

参数	是否必须	说明
touser	否	成员ID列表（消息接收者，多个接收者用‘|’分隔，最多支持1000个）。特殊情况：指定为@all，则向关注该企业应用的全部成员发送
toparty	否	部门ID列表，多个接收者用‘|’分隔，最多支持100个。当touser为@all时忽略本参数
totag	否	标签ID列表，多个接收者用‘|’分隔，最多支持100个。当touser为@all时忽略本参数
msgtype	是	消息类型，此时固定为：template_card
agentid	是	企业应用的id，整型。企业内部开发，可在应用的设置页面查看；第三方服务商，可通过接口 获取企业授权信息 获取该参数值
card_type	是	模板卡片类型，文本通知型卡片填写 "text_notice"
source	否	卡片来源样式信息，不需要来源样式可不填写
source.icon_url	否	来源图片的url，来源图片的尺寸建议为72*72
source.desc	否	来源图片的描述，建议不超过20个字，（支持id转译）
source.desc_color	否	来源文字的颜色，目前支持：0(默认) 灰色，1 黑色，2 红色，3 绿色
action_menu	否	卡片右上角更多操作按钮
action_menu.desc	否	更多操作界面的描述
action_menu.action_list	是	操作列表，列表长度取值范围为 [1, 3]
action_menu.action_list.text	是	操作的描述文案
action_menu.action_list.key	是	操作key值，用户点击后，会产生回调事件将本参数作为EventKey返回，回调事件会带上该key值，最长支持1024字节，不可重复
main_title.title	否	一级标题，建议不超过36个字，文本通知型卡片本字段非必填，但不可本字段和sub_title_text都不填，（支持id转译）
main_title.desc	否	标题辅助信息，建议不超过44个字，（支持id转译）
quote_area	否	引用文献样式
quote_area.type	否	引用文献样式区域点击事件，0或不填代表没有点击事件，1 代表跳转url，2 代表跳转小程序
quote_area.url	否	点击跳转的url，quote_area.type是1时必填
quote_area.appid	否	点击跳转的小程序的appid，必须是与当前应用关联的小程序，quote_area.type是2时必填
quote_area.pagepath	否	点击跳转的小程序的pagepath，quote_area.type是2时选填
quote_area.title	否	引用文献样式的标题
quote_area.quote_text	否	引用文献样式的引用文案
emphasis_content	否	关键数据样式
emphasis_content.title	否	关键数据样式的数据内容，建议不超过14个字
emphasis_content.desc	否	关键数据样式的数据描述内容，建议不超过22个字
sub_title_text	否	二级普通文本，建议不超过160个字，（支持id转译）
horizontal_content_list	否	二级标题+文本列表，该字段可为空数组，但有数据的话需确认对应字段是否必填，列表长度不超过6
horizontal_content_list.type	否	链接类型，0或不填代表不是链接，1 代表跳转url，2 代表下载附件，3 代表点击跳转成员详情
horizontal_content_list.keyname	是	二级标题，建议不超过5个字
horizontal_content_list.value	否	二级文本，如果horizontal_content_list.type是2，该字段代表文件名称（要包含文件类型），建议不超过30个字，（支持id转译）
horizontal_content_list.url	否	链接跳转的url，horizontal_content_list.type是1时必填
horizontal_content_list.media_id	否	附件的media_id，horizontal_content_list.type是2时必填
horizontal_content_list.userid	否	成员详情的userid，horizontal_content_list.type是3时必填
jump_list	否	跳转指引样式的列表，该字段可为空数组，但有数据的话需确认对应字段是否必填，列表长度不超过3
jump_list.type	否	跳转链接类型，0或不填代表不是链接，1 代表跳转url，2 代表跳转小程序
jump_list.title	是	跳转链接样式的文案内容，建议不超过18个字
jump_list.url	否	跳转链接的url，jump_list.type是1时必填
jump_list.appid	否	跳转链接的小程序的appid，必须是与当前应用关联的小程序，jump_list.type是2时必填
jump_list.pagepath	否	跳转链接的小程序的pagepath，jump_list.type是2时选填
card_action	是	整体卡片的点击跳转事件，text_notice必填本字段
card_action.type	是	跳转事件类型，1 代表跳转url，2 代表打开小程序。text_notice卡片模版中该字段取值范围为[1,2]
card_action.url	否	跳转事件的url，card_action.type是1时必填
card_action.appid	否	跳转事件的小程序的appid，必须是与当前应用关联的小程序，card_action.type是2时必填
card_action.pagepath	否	跳转事件的小程序的pagepath，card_action.type是2时选填
task_id	否	任务id，同一个应用任务id不能重复，只能由数字、字母和“_-@”组成，最长128字节，填了action_menu字段的话本字段必填
enable_id_trans	否	表示是否开启id转译，0表示否，1表示是，默认0
enable_duplicate_check	否	表示是否开启重复消息检查，0表示否，1表示是，默认0
duplicate_check_interval	否	表示是否重复消息检查的时间间隔，默认1800s，最大不超过4小时


### 4.4 news_notice（图文展示型）额外字段

```json{
    "touser" : "UserID1|UserID2|UserID3",
    "toparty" : "PartyID1 | PartyID2",
    "totag" : "TagID1 | TagID2",
    "msgtype" : "template_card",
    "agentid" : 1,
    "template_card" : {
        "card_type" : "news_notice",
        "source" : {
            "icon_url": "图片的url",
            "desc": "企业微信",
            "desc_color": 1
        },
        "action_menu": {
            "desc": "卡片副交互辅助文本说明",
            "action_list": [
                {"text": "查看详情", "key": "VIEW_DETAIL"},
                {"text": "查看栏目", "key": "VIEW_CHANNEL"}
            ]
        },
        "task_id": "task_id",
        "main_title" : {
            "title" : "欢迎使用企业微信",
            "desc" : "您的好友正在邀请您加入企业微信"
        },
        "quote_area": {
            "type": 1,
            "url": "https://work.weixin.qq.com",
            "title": "企业微信的引用样式",
            "quote_text": "企业微信真好用呀真好用"
        },
        "image_text_area": {
            "type": 1,
            "url": "https://work.weixin.qq.com",
            "title": "企业微信的左图右文样式",
            "desc": "企业微信真好用呀真好用",
            "image_url": "https://img.iplaysoft.com/wp-content/uploads/2019/free-images/free_stock_photo_2x.jpg"
        },
        "card_image": {
            "url": "图片的url",
            "aspect_ratio": 1.3
        },
        "vertical_content_list": [
            {
                "title": "惊喜红包等你来拿",
                "desc": "下载企业微信还能抢红包！"
            }
        ],
        "horizontal_content_list" : [
            {
                "keyname": "邀请人",
                "value": "张三"
            },
            {
                "type": 1,
                "keyname": "企业微信官网",
                "value": "点击访问",
                "url": "https://work.weixin.qq.com"
            },
            {
                "type": 2,
                "keyname": "企业微信下载",
                "value": "企业微信.apk",
                "media_id": "文件的media_id"
            },
            {
                "type": 3,
                "keyname": "员工信息",
                "value": "点击查看",
                "userid": "zhangsan"
            }
        ],
        "jump_list" : [
            {
                "type": 1,
                "title": "企业微信官网",
                "url": "https://work.weixin.qq.com"
            },
            {
                "type": 2,
                "title": "跳转小程序",
                "appid": "小程序的appid",
                "pagepath": "/index.html"
            }
        ],
        "card_action": {
            "type": 2,
            "url": "https://work.weixin.qq.com",
            "appid": "小程序的appid",
            "pagepath": "/index.html"
        }
    },
    "enable_id_trans": 0,
    "enable_duplicate_check": 0,
    "duplicate_check_interval": 1800
}
```
参数	是否必须	说明
touser	否	成员ID列表（消息接收者，多个接收者用‘|’分隔，最多支持1000个）。特殊情况：指定为@all，则向关注该企业应用的全部成员发送
toparty	否	部门ID列表，多个接收者用‘|’分隔，最多支持100个。当touser为@all时忽略本参数
totag	否	标签ID列表，多个接收者用‘|’分隔，最多支持100个。当touser为@all时忽略本参数
msgtype	是	消息类型，此时固定为：template_card
agentid	是	企业应用的id，整型。企业内部开发，可在应用的设置页面查看；第三方服务商，可通过接口 获取企业授权信息 获取该参数值
card_type	是	模板卡片类型，图文展示型卡片此处填写 "news_notice"
source	否	卡片来源样式信息，不需要来源样式可不填写
source.icon_url	否	来源图片的url，来源图片的尺寸建议为72*72
source.desc	否	来源图片的描述，建议不超过20个字，（支持id转译）
source.desc_color	否	来源文字的颜色，目前支持：0(默认) 灰色，1 黑色，2 红色，3 绿色
action_menu	否	卡片右上角更多操作按钮
action_menu.desc	否	更多操作界面的描述
action_menu.action_list	是	操作列表，列表长度取值范围为 [1, 3]
action_menu.action_list.text	是	操作的描述文案
action_menu.action_list.key	是	操作key值，用户点击后，会产生回调事件将本参数作为EventKey返回，回调事件会带上该key值，最长支持1024字节，不可重复
main_title.title	是	一级标题，建议不超过36个字，（支持id转译）
main_title.desc	否	标题辅助信息，建议不超过44个字，（支持id转译）
quote_area	否	引用文献样式
quote_area.type	否	引用文献样式区域点击事件，0或不填代表没有点击事件，1 代表跳转url，2 代表跳转小程序
quote_area.url	否	点击跳转的url，quote_area.type是1时必填
quote_area.appid	否	点击跳转的小程序的appid，必须是与当前应用关联的小程序，quote_area.type是2时必填
quote_area.pagepath	否	点击跳转的小程序的pagepath，quote_area.type是2时选填
quote_area.title	否	引用文献样式的标题
quote_area.quote_text	否	引用文献样式的引用文案
image_text_area	否	左图右文样式，news_notice类型的卡片，card_image和image_text_area两者必填一个字段，不可都不填
image_text_area.type	否	左图右文样式区域点击事件，0或不填代表没有点击事件，1 代表跳转url，2 代表跳转小程序
image_text_area.url	否	点击跳转的url，image_text_area.type是1时必填
image_text_area.appid	否	点击跳转的小程序的appid，必须是与当前应用关联的小程序，image_text_area.type是2时必填
image_text_area.pagepath	否	点击跳转的小程序的pagepath，image_text_area.type是2时选填
image_text_area.title	否	左图右文样式的标题
image_text_area.desc	否	左图右文样式的描述
image_text_area.image_url	是	左图右文样式的图片url
card_image	否	图片样式，news_notice类型的卡片，card_image和image_text_area两者必填一个字段，不可都不填
card_image.url	是	图片的url
card_image.aspect_ratio	否	图片的宽高比，宽高比要小于2.25，大于1.3，不填该参数默认1.3
vertical_content_list	否	卡片二级垂直内容，该字段可为空数组，但有数据的话需确认对应字段是否必填，列表长度不超过4
vertical_content_list.title	是	卡片二级标题，建议不超过38个字
vertical_content_list.desc	否	二级普通文本，建议不超过160个字
horizontal_content_list	否	二级标题+文本列表，该字段可为空数组，但有数据的话需确认对应字段是否必填，列表长度不超过6
horizontal_content_list.type	否	链接类型，0或不填代表不是链接，1 代表跳转url，2 代表下载附件，3 代表点击跳转成员详情
horizontal_content_list.keyname	是	二级标题，建议不超过5个字
horizontal_content_list.value	否	二级文本，如果horizontal_content_list.type是2，该字段代表文件名称（要包含文件类型），建议不超过30个字，（支持id转译）
horizontal_content_list.url	否	链接跳转的url，horizontal_content_list.type是1时必填
horizontal_content_list.media_id	否	附件的media_id，horizontal_content_list.type是2时必填
horizontal_content_list.userid	否	成员详情的userid，horizontal_content_list.type是3时必填
jump_list	否	跳转指引样式的列表，该字段可为空数组，但有数据的话需确认对应字段是否必填，列表长度不超过3
jump_list.type	否	跳转链接类型，0或不填代表不是链接，1 代表跳转url，2 代表跳转小程序
jump_list.title	是	跳转链接样式的文案内容，建议不超过18个字
jump_list.url	否	跳转链接的url，jump_list.type是1时必填
jump_list.appid	否	跳转链接的小程序的appid，必须是与当前应用关联的小程序，jump_list.type是2时必填
jump_list.pagepath	否	跳转链接的小程序的pagepath，jump_list.type是2时选填
card_action	是	整体卡片的点击跳转事件，news_notice必填本字段
card_action.type	是	跳转事件类型，1 代表跳转url，2 代表打开小程序。news_notice卡片模版中该字段取值范围为[1,2]
card_action.url	否	跳转事件的url，card_action.type是1时必填
card_action.appid	否	跳转事件的小程序的appid，必须是与当前应用关联的小程序，card_action.type是2时必填
card_action.pagepath	否	跳转事件的小程序的pagepath，card_action.type是2时选填
task_id	否	任务id，同一个应用任务id不能重复，只能由数字、字母和“_-@”组成，最长128字节，填了action_menu字段的话本字段必填
enable_id_trans	否	表示是否开启id转译，0表示否，1表示是，默认0
enable_duplicate_check	否	表示是否开启重复消息检查，0表示否，1表示是，默认0
duplicate_check_interval	否	表示是否重复消息检查的时间间隔，默认1800s，最大不超过4小时

### 4.5 button_interaction（按钮交互型）关键字段

```json
{
  "card_type": "button_interaction",
  "main_title": {"title": "您订阅了技术资讯栏目"},
  "sub_title_text": "本周内容已推送……",
  "button_list": [                 // 必填，最多6个按钮
    {
      "text": "标记已读",
      "style": 4,                  // 1蓝/2红/3绿/4灰
      "key": "READ_COL_1_UID_zhangsan",  // 用户点击后作为EventKey回调，≤1024字节
      "type": 0                    // 0=触发回调，1=跳转URL
    },
    {
      "text": "查看全文",
      "style": 1,
      "url": "https://example.com/article/123",
      "type": 1
    }
  ],
  "card_action": {"type": 1, "url": "https://example.com"},
  "task_id": "col1-20260414-zhangsan"  // 必填，同应用唯一
}
```

### 4.6 更新模板卡片消息接口

用于在用户点击交互按钮后，将按钮更新为灰色不可点击状态，或调整按钮文案。

| 项目 | 内容 |
|------|------|
| **接口地址** | `https://qyapi.weixin.qq.com/cgi-bin/message/update_template_card?access_token=ACCESS_TOKEN` |
| **方法** | POST |

```json
{
  "userids": ["zhangsan"],
  "agentid": 1000001,
  "response_code": "RESPONSE_CODE",   // 发送时返回的code（72h内有效，仅一次）
  "button": {
    "replace_name": "已处理"            // 更新后按钮变为灰色不可点击
  }
}
```

**限制：**
- `response_code` 有效期 72 小时，每个 code 只能用一次
- 仅原卡片为 `button_interaction`、`vote_interaction`、`multiple_interaction`，或填写了 `action_menu` 的 `text_notice`/`news_notice` 可调用此接口

---

## 5. 消息交互边界与订阅管理建议

### 5.1 结论

- `text_notice` 与 `news_notice` 更适合作为消息展示、摘要通知和链接跳转载体，不应承担“取消订阅”主流程。
- 受企业微信模板卡片能力限制，消息内交互更适合做“查看详情”“查看栏目”“标记已读”这类弱状态动作。
- 订阅取消应统一回到 Web/H5 订阅管理页或受控后台接口完成，并由服务端更新数据库与标签成员。
- 如后续确需补充消息互动，建议仅做辅助状态更新，不把消息回调作为订阅状态的唯一事实来源。

### 5.2 推荐做法

```
消息卡片负责展示摘要与跳转入口
        ↓
用户点击卡片或菜单，进入栏目页 / 订阅管理页
        ↓
用户在站内完成取消订阅
        ↓
后端更新 subscriptions 与标签成员
        ↓
后续推送链路按最新订阅状态执行
```

### 5.3 对 `text_notice` / `news_notice` 的适用判断

- `text_notice`：适合发送多条资讯的文字摘要，可通过 `sub_title_text`、`horizontal_content_list`、`jump_list` 做简报式聚合。
- `news_notice`：适合发送带封面图的聚合消息，可用 `image_text_area` 承载主内容，再用 `vertical_content_list` 展示多条补充资讯。
- 两类卡片都只能提供有限的跳转位与展示位，不适合做“每条资讯一个独立完整交互”的富列表体验。
- 若需要真正的多条新闻列表、逐条独立跳转和统一订阅管理，建议跳转到站内聚合页承载。

### 5.4 实际联调结论（2026-04-15）

- 已使用 `ai_web` 新增联调脚本，基于真实已发布文章向真实订阅用户发送 `text_notice` 与 `news_notice` 两张模板卡片。
- 本次联调目标用户为 `subscriptions.qywx_user_id=100002013029`，两次调用企业微信 `/message/send` 均返回 `errcode=0`。
- 结论一：单卡片承载多条资讯在接口层面可行，`text_notice` 与 `news_notice` 都可以成功发送。
- 结论二：`news_notice` 虽可通过 `vertical_content_list` 展示多条资讯，但每条资讯的独立交互能力有限，更适合“主内容 + 补充列表”。
- 结论三：若业务目标是“多条新闻聚合通知”，可继续采用单卡片方案；若目标是“多条新闻逐条独立浏览”，应跳转到站内聚合页承载。

---

## 6. 消息互动回调处理

### 6.1 回调配置

在企业微信管理后台 → 应用管理 → 目标应用 → 接收消息 → 设置API接收，配置：

| 配置项 | 说明 |
|--------|------|
| **URL** | 回调地址，如 `https://yourapp.com/api/wecom/callback` |
| **Token** | 自定义，英文或数字，长度≤32位 |
| **EncodingAESKey** | 43位，用于 AES-256-CBC 加解密 |
| **消息加解密方式** | 选择"安全模式" |

### 6.2 回调验证（GET 请求）

企微配置保存时发送 GET 验证请求：

```
GET /api/wecom/callback?msg_signature=xxx&timestamp=xxx&nonce=xxx&echostr=ENCRYPT_STR
```

处理逻辑：
1. 用 SHA1(sort([token, timestamp, nonce, echostr])) 验签
2. 解密 echostr
3. **1秒内**返回明文 echostr（不能加引号，不能有换行）

### 6.3 卡片交互事件（POST 请求）

企微向回调URL发送 POST 请求，格式为加密 XML：

```xml
<xml>
  <ToUserName><![CDATA[CORP_ID]]></ToUserName>
  <AgentID><![CDATA[1000001]]></AgentID>
  <Encrypt><![CDATA[msg_encrypt]]></Encrypt>
</xml>
```

解密后得到事件明文（`template_card_event` 或 `template_card_menu_event`）：

```xml
<xml>
  <ToUserName><![CDATA[CORP_ID]]></ToUserName>
  <FromUserName><![CDATA[zhangsan]]></FromUserName>   <!-- 点击用户的userid -->
  <CreateTime>1712345678</CreateTime>
  <MsgType><![CDATA[event]]></MsgType>
  <Event><![CDATA[template_card_menu_event]]></Event>
  <EventKey><![CDATA[VIEW_CHANNEL_policy_ethics]]></EventKey>   <!-- 对应菜单或按钮 key -->
  <TaskId><![CDATA[col1-20260414-zhangsan]]></TaskId>
  <CardType><![CDATA[text_notice]]></CardType>
  <ResponseCode><![CDATA[RESPONSE_CODE]]></ResponseCode>
  <AgentID>1000001</AgentID>
</xml>
```

**关键字段说明：**

| 字段 | 说明 |
|------|------|
| `FromUserName` | 触发事件的用户 userid |
| `EventKey` | 菜单或按钮的 key 值（发送卡片时设定） |
| `TaskId` | 对应发送卡片时的 `task_id` |
| `ResponseCode` | 用于调用"更新卡片"接口（72h内有效，仅一次） |
| `Event` = `template_card_menu_event` | 右上角菜单点击事件（`action_menu`） |

### 6.4 回调处理建议

- 回调只作为消息交互审计、状态展示更新或埋点补充，不作为订阅状态变更主入口。
- 若需要处理菜单事件，推荐只记录 `FromUserName`、`EventKey`、`TaskId`、`ResponseCode`、`CardType` 到审计日志。
- 若需要更新卡片文案，应在服务端完成鉴权、幂等判断与日志落库后，再调用 `update_template_card`。
- 取消订阅动作应跳转到站内页面，由站内接口负责鉴权与状态变更。

### 6.5 回调处理重要注意事项

- **5秒响应**：企微服务器5秒内收不到响应会重试，最多3次。务必立即返回"success"，异步处理业务逻辑
- **IP 白名单**：可通过 `GET /cgi-bin/getcallbackip?access_token=XXX` 获取企微服务器IP列表，定时更新防火墙
- **重放攻击**：使用 `timestamp` + `nonce` 做防重放，同一 nonce 不重复处理

---

## 7. 用户 userid 获取（OAuth 免登录）

### 7.1 适用场景

订阅入口通常是企业微信应用内的H5网页，需要获取打开该页面的用户 userid，以便记录订阅关系。

### 7.2 OAuth2.0 静默授权流程

**第一步：后端生成授权跳转URL**

```
https://open.weixin.qq.com/connect/oauth2/authorize
  ?appid=CORP_ID
  &redirect_uri=REDIRECT_URI（需URLEncode）
  &response_type=code
  &scope=snsapi_base
  &agentid=AGENT_ID
  &state=STATE
  #wechat_redirect
```

**第二步：用户在企微内访问该URL，自动重定向携带 code**

```
https://yourapp.com/subscribe?code=CODE&state=STATE
```

**第三步：后端用 code 换取 userid**

```python
def get_userid_by_code(code: str) -> str:
    token = get_access_token()
    resp = requests.get(
        "https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo",
        params={"access_token": token, "code": code},
        timeout=5
    ).json()
    if resp.get("errcode") != 0:
        raise Exception(f"get userid failed: {resp}")
    return resp["userid"]
```

> 注意：`snsapi_base` 为静默授权（用户无感知），可直接获取 userid；`snsapi_privateinfo` 需用户主动同意，可获取手机号等敏感信息

### 7.3 订阅入口建议

在企业微信应用主页或自定义菜单中放置"栏目订阅"入口（H5页面），通过上述 OAuth 流程获取 userid 后展示可订阅的栏目列表。

---

## 8. 数据库设计

### 8.1 栏目表

```sql
CREATE TABLE `columns` (
  `id`           BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT COMMENT '栏目ID',
  `name`         VARCHAR(64)       NOT NULL COMMENT '栏目名称',
  `code`         VARCHAR(32)       NOT NULL COMMENT '栏目编码，唯一',
  `description`  VARCHAR(255)      DEFAULT NULL,
  `push_cron`    VARCHAR(64)       NOT NULL DEFAULT '0 9 * * 1-5' COMMENT '推送Cron表达式',
  `is_active`    TINYINT(1)        NOT NULL DEFAULT 1,
  `sort_order`   INT               NOT NULL DEFAULT 0,
  `created_at`   DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='栏目表';
```

### 8.2 用户订阅关系表

```sql
CREATE TABLE `user_subscriptions` (
  `id`              BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `user_id`         VARCHAR(64)      NOT NULL COMMENT '企微userid',
  `column_id`       BIGINT UNSIGNED  NOT NULL COMMENT '关联栏目ID',
  `status`          TINYINT(1)       NOT NULL DEFAULT 1 COMMENT '1=已订阅 0=已退订',
  `source`          VARCHAR(32)      NOT NULL DEFAULT 'h5' COMMENT '订阅来源',
  `subscribed_at`   DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `unsubscribed_at` DATETIME         DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_column` (`user_id`, `column_id`),
  KEY `idx_column_status` (`column_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户订阅关系表';
```

### 8.3 企微标签映射表

```sql
CREATE TABLE `wecom_tag_mapping` (
  `id`         BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `column_id`  BIGINT UNSIGNED  NOT NULL COMMENT '关联栏目ID',
  `tag_id`     INT UNSIGNED     NOT NULL COMMENT '企微标签ID（tagid）',
  `tag_name`   VARCHAR(64)      NOT NULL COMMENT '企微标签名称',
  `is_active`  TINYINT(1)       NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_column` (`column_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='企微标签映射表';
```

### 8.4 推送记录表

```sql
CREATE TABLE `push_records` (
  `id`              BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `column_id`       BIGINT UNSIGNED  NOT NULL,
  `content_id`      BIGINT UNSIGNED  DEFAULT NULL COMMENT '推送的内容ID',
  `push_type`       VARCHAR(32)      NOT NULL DEFAULT 'scheduled',
  `total_users`     INT              NOT NULL DEFAULT 0 COMMENT '推送目标人数',
  `success_count`   INT              NOT NULL DEFAULT 0,
  `fail_count`      INT              NOT NULL DEFAULT 0,
  `status`          VARCHAR(16)      NOT NULL DEFAULT 'pending' COMMENT 'pending/sending/done/failed',
  `task_id_prefix`  VARCHAR(64)      DEFAULT NULL COMMENT 'task_id前缀，用于标识本次推送',
  `response_code`   VARCHAR(256)     DEFAULT NULL COMMENT '企微返回的response_code，用于更新卡片',
  `pushed_at`       DATETIME         DEFAULT NULL COMMENT '实际推送时间',
  `created_at`      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_column_date` (`column_id`, `pushed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='推送记录表';
```

### 8.5 订阅变更记录表

```sql
CREATE TABLE `subscription_change_logs` (
  `id`          BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `user_id`     VARCHAR(64)      NOT NULL,
  `column_id`   BIGINT UNSIGNED  NOT NULL,
  `trigger`     VARCHAR(32)      NOT NULL COMMENT 'web/admin/import/api',
  `event_key`   VARCHAR(256)     DEFAULT NULL,
  `created_at`  DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_column` (`user_id`, `column_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订阅变更记录表';
```

---

## 9. 定时任务设计（标签维护 & 消息推送）

### 9.1 推荐技术栈

| 组件 | 选型 | 说明 |
|------|------|------|
| Web 框架 | FastAPI / Django | 提供订阅API和回调接口 |
| 任务队列 | Celery + Redis/RabbitMQ | 异步任务和定时调度 |
| 定时任务 | Celery Beat | 基于Cron的定时触发 |
| 缓存 | Redis | token缓存、幂等锁 |
| 数据库 | PostgreSQL | 主业务数据 |

### 9.2 每日标签同步任务

```python
# celery_tasks.py

from celery import Celery
from celery.schedules import crontab

app = Celery('wecom_push', broker='redis://localhost:6379/0')

app.conf.beat_schedule = {
    # 每天 05:00 同步所有栏目的标签成员（推送前确保标签已是最新）
    'sync-all-tags': {
        'task': 'celery_tasks.sync_all_column_tags',
        'schedule': crontab(hour=5, minute=0),
    },
}

@app.task(bind=True, max_retries=3)
def sync_all_column_tags(self):
    """同步所有活跃栏目的企微标签成员"""
    columns = get_active_columns()
    for col in columns:
        try:
            sync_column_tag.delay(col['id'])
        except Exception as exc:
            self.retry(exc=exc, countdown=60)

@app.task(bind=True, max_retries=3)
def sync_column_tag(self, column_id: int):
    """同步单个栏目的标签成员（Diff算法）"""
    tag_id = get_tagid_by_column(column_id)
    
    # 从DB获取应订阅的用户
    db_set = set(get_active_subscribers(column_id))
    # 从企微获取当前标签成员
    wecom_set = set(get_wecom_tag_members(tag_id))
    
    to_add = list(db_set - wecom_set)
    to_remove = list(wecom_set - db_set)
    
    # 分批添加（每批1000人）
    for i in range(0, len(to_add), 1000):
        batch = to_add[i:i+1000]
        result = wecom_api_call(
            "https://qyapi.weixin.qq.com/cgi-bin/tag/addtagusers",
            {"tagid": tag_id, "userlist": batch}
        )
        # 处理 invalidlist
        if "invalidlist" in result:
            handle_invalid_users(result["invalidlist"].split("|"))
    
    # 分批删除（每批1000人）
    for i in range(0, len(to_remove), 1000):
        batch = to_remove[i:i+1000]
        wecom_api_call(
            "https://qyapi.weixin.qq.com/cgi-bin/tag/deltagusers",
            {"tagid": tag_id, "userlist": batch}
        )
```

### 9.3 消息推送任务

```python
import hashlib
from datetime import date

@app.task(bind=True, max_retries=3)
def push_column_content(self, column_id: int, content_id: int):
    """推送单个栏目的内容（按标签群发）"""
    # 幂等检查：同一栏目同一天只推送一次
    idempotent_key = f"push:{column_id}:{date.today().isoformat()}"
    if not redis_set_nx(idempotent_key, "1", ex=86400):
        return  # 已推送，跳过
    
    tag_id = get_tagid_by_column(column_id)
    content = get_content(content_id)
    
    # 构造 task_id（同应用唯一）
    task_id = f"col{column_id}-{date.today().strftime('%Y%m%d')}-{content_id}"
    
    # 组装消息卡片
    message = build_template_card(content, tag_id, task_id)
    
    # 发送
    result = wecom_api_call(
        "https://qyapi.weixin.qq.com/cgi-bin/message/send",
        message
    )
    
    if result.get("errcode") == 0:
        # 保存 response_code 供后续更新卡片展示状态使用
        save_push_record(column_id, content_id, task_id, result.get("response_code"))
    else:
        raise self.retry(exc=Exception(str(result)))


def build_template_card(content: dict, tag_id: int, task_id: str) -> dict:
    return {
        "totag": str(tag_id),
        "msgtype": "template_card",
        "agentid": AGENT_ID,
        "enable_duplicate_check": 1,
        "duplicate_check_interval": 86400,
        "template_card": {
            "card_type": "text_notice",
            "source": {"desc": content["column_name"], "desc_color": 3},
            "action_menu": {
                "desc": "更多操作",
                "action_list": [
                    {"text": "查看栏目", "key": f"VIEW_COLUMN_{content['column_id']}"}
                ]
            },
            "main_title": {"title": content["title"], "desc": content["subtitle"]},
            "sub_title_text": content["summary"][:160],
            "horizontal_content_list": [
                {"keyname": "来源", "value": content.get("author", "编辑部")},
                {"keyname": "全文", "value": "点击阅读", "type": 1, "url": content["url"]}
            ],
            "card_action": {"type": 1, "url": content["url"]},
            "task_id": task_id
        }
    }
```

---

## 10. 完整业务流程详解

### 10.1 订阅流程

```
1. 用户在企微内打开"栏目订阅"H5页面
2. 后端通过 OAuth code 获取用户 userid
3. 查询 user_subscriptions 表，展示栏目列表及订阅状态
4. 用户点击"订阅"按钮
5. 后端写入 user_subscriptions（upsert，status=1，subscribed_at=NOW()）
6. 即时反馈订阅成功（不立即打标签，等待每日同步任务）
7. （可选）立即加入标签（异步任务）
8. （可选）发送欢迎消息
```

### 10.2 标签维护流程（每日）

```
1. Celery Beat 在每天 05:00 触发 sync_all_column_tags 任务
2. 遍历所有活跃栏目，为每个栏目派发 sync_column_tag 子任务
3. 每个子任务执行 Diff 算法（见9.2节）
4. 分批调用 addtagusers / deltagusers
5. 处理返回的 invalidlist（记录日志，可标记对应用户为无效）
6. 更新标签同步时间戳到 wecom_tag_mapping.last_synced_at
```

### 10.3 推送流程（按 Cron 触发）

```
1. Celery Beat 根据各栏目的 push_cron 触发推送任务
2. 检查幂等（Redis SET NX，防止重复推送）
3. 从内容管理系统获取最新内容
4. 构造模板卡片消息（见9.3节）
5. 调用 /message/send 按标签（totag）群发
6. 保存推送记录（含 response_code、task_id）
7. 更新推送记录状态为 done/failed
```

### 10.4 取消订阅流程（站内/H5）

```
1. 用户从消息卡片进入栏目页或订阅管理页
2. 用户在站内执行取消订阅
3. 后端完成接口鉴权与参数校验
4. 更新 user_subscriptions 状态为 0，unsubscribed_at=NOW()
5. 写入 subscription_change_logs
6. 调用 deltagusers 将用户从标签移除
7. 后续推送任务按最新订阅状态执行
```

---

## 11. 错误码速查表

| 错误码 | 含义 | 处理建议 |
|--------|------|---------|
| 0 | 成功 | - |
| 40001 | 无效的凭证，可能过期 | 重新获取 access_token |
| 42001 | access_token 已过期 | 删除缓存，重新获取 |
| 40003 | 无效的 UserID | 检查 userid 是否存在于通讯录 |
| 40031 | UserID列表全部非法 | 检查用户是否在应用可见范围内 |
| 40068 | 不合法的标签ID | 检查 tagid 是否存在 |
| 40070 | 标签成员列表全部无效 | 检查参数格式，确认成员在通讯录 |
| 40071 | 标签名已存在 | 换一个不重名的标签名 |
| 40072 | 标签名长度超限 | 控制在32字以内 |
| 60011 | 指定成员/部门/标签参数无权限 | 检查应用可见范围和标签创建者 |
| 60020 | 不安全的IP | 将服务器IP加入企微"企业可信IP"白名单 |
| 81011 | 无权限操作标签 | 只有标签创建应用的 secret 才能操作该标签 |
| 82003 | 标签ID列表长度超限 | 发消息单次不超过100个标签 |

---

## 12. 频率限制汇总

| 接口类型 | 限制 |
|----------|------|
| **基础API（每企业/每接口）** | ≤ 1万次/分钟，≤ 15万次/小时 |
| **应用消息发送（日上限）** | 账号上限数 × 200 人次/天 |
| **应用消息（同一用户）** | ≤ 30次/分钟，≤ 1000次/小时 |
| **标签成员增加（单次）** | ≤ 1000 个 userid，≤ 100 个 partyid |
| **标签成员删除（单次）** | ≤ 1000 个 userid，≤ 100 个 partyid |
| **单个标签成员上限** | 部门+人员总数 ≤ 3万 |
| **标签总数上限（全企业）** | ≤ 3000 个 |
| **access_token 有效期** | 7200 秒（2小时） |
| **消息 response_code 有效期** | 72 小时，仅可用一次 |
| **模板卡片更新次数** | 每个 response_code 调用一次 |

---

## 13. 安全性设计

### 13.1 回调合法性验证

- 验证 `msg_signature` 签名（SHA1，字典序排序 token+timestamp+nonce+echostr）
- 解密消息（AES-256-CBC，IV 取 AESKey 前16字节）
- 比对 ReceiveId 与 CORP_ID 一致性
- 检查 `timestamp` 防重放（建议拒绝超过5分钟的请求）

### 13.2 站内退订接口防伪造

使用 HMAC-SHA256 对 `userid:column_id:expire_time` 签名，服务端验签后再执行站内取消订阅。

### 13.3 企微可信IP配置

在企业微信管理后台 → 应用管理 → 应用 → 企业可信IP，填写后端服务器的出口IP。未配置的IP调用API会报 `60020` 错误。

### 13.4 access_token 安全

- 绝不将 token 返回给前端
- 所有企微API调用均由后端发起
- Redis 中的 token key 使用应用内前缀区分，防止跨应用泄露

---

## 14. 关键难点与解决方案

### 难点1：标签成员与数据库不一致

**问题**：用户在站内已取消订阅，但标签未及时更新，导致下一次推送仍收到消息。

**解决方案**：
1. 用户在站内取消订阅时，异步任务立即调用 `deltagusers` 从标签移除
2. 每日 05:00 全量 Diff 同步，作为兜底保障
3. 在推送前（如每天 08:00）再次触发一次轻量 Diff（只处理最近24小时变更的用户）

### 难点2：response_code 丢失导致无法更新卡片

**问题**：服务崩溃或推送记录未落库，导致 response_code 丢失，无法更新卡片上的交互状态。

**解决方案**：
1. 发送接口调用完立即写入数据库（`push_records.response_code`），在事务内保证落库
2. 若发送失败（errcode≠0），不写记录，稍后重试
3. 若需要更新卡片时 response_code 已失效（72h过期），则保留原卡片展示，以站内页面状态为准

### 难点3：大规模用户（10万+）的推送性能——不存在，用户量比较少

### 难点4：回调消息加解密

**问题**：企微回调使用 AES-256-CBC 加密，自行实现容易出错。

**解决方案**：
```node
  # with npm
  npm install @wecom/crypto
```

### 难点5：task_id 唯一性保证

**问题**：同一应用内 task_id 不能重复，否则回调时无法区分推送批次。

**解决方案**：使用格式 `col{column_id}-{date}-{content_id}-{userid_hash}` 确保唯一，对于按标签群发的场景（单条消息发给多人），可以共享同一 task_id，但建议为每条推送记录生成唯一前缀。

### 难点6：多栏目下的标签数量规划——不存在，最多不超过10个栏目
---

## 参考资料

1. [企业微信官方文档 - 标签管理](https://developer.work.weixin.qq.com/document/path/90209)
2. [企业微信官方文档 - 发送应用消息](https://developer.work.weixin.qq.com/document/path/90236)
3. [企业微信官方文档 - 模板卡片类型](https://developer.work.weixin.qq.com/document/path/101032)
4. [企业微信官方文档 - 更新模板卡片消息](https://developer.work.weixin.qq.com/document/path/96459)
5. [企业微信官方文档 - 回调配置](https://developer.work.weixin.qq.com/document/path/90930)
6. [企业微信官方文档 - 事件格式](https://developer.work.weixin.qq.com/document/path/90240)
7. [企业微信官方文档 - 获取access_token](https://developer.work.weixin.qq.com/document/path/91039)
8. [企业微信官方文档 - 访问频率限制](https://developer.work.weixin.qq.com/document/90000/90139/90312)
9. [企业微信官方文档 - 全局错误码](https://developer.work.weixin.qq.com/document/path/90313)
10. [企业微信官方文档 - 网页授权登录](https://developer.work.weixin.qq.com/document/path/91020)
