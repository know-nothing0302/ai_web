# ECC + OMC 组合使用指南

> AI 徐医主站项目 — 代码质量 × 开发效率双引擎

## 概述

本项目同时使用两套技能系统：

| 系统 | 全称 | 定位 | 命名空间 |
|------|------|------|----------|
| **OMC** | oh-my-claudecode | 多智能体编排层 — *怎么组织工作* | `oh-my-claudecode:` 前缀 |
| **ECC** | Everything Claude Code | 领域模式知识库 — *怎么写代码* | 无前缀（文件级 skill） |

**核心原则：OMC 管流程，ECC 管内容。两者不互斥，而是互补。**

---

## 已安装技能清单

### ECC 技能（26 个，位于 `.claude/skills/ecc/`）

#### 数据库 & API
| 技能 | 用途 | 触发场景 |
|------|------|----------|
| `postgres-patterns` | PostgreSQL 查询优化、索引、Schema 设计、RLS | 写 SQL、设计表结构、排查慢查询 |
| `database-migrations` | 数据库迁移策略、零停机变更、回滚 | 新增字段/表、修改 Schema |
| `api-design` | RESTful API 设计、版本控制、错误格式 | 新增路由、设计接口 |

#### 前后端模式
| 技能 | 用途 | 触发场景 |
|------|------|----------|
| `backend-patterns` | Express/Node.js 后端架构模式 | 新增模块、重构后端 |
| `frontend-patterns` | 前端架构、组件设计、状态管理 | 新增页面、组件重构 |
| `vite-patterns` | Vite 构建优化、插件配置 | 构建慢、配置变更 |
| `frontend-a11y` | Web 无障碍（ARIA、键盘导航、屏幕阅读器） | UI 开发、可访问性审计 |

#### 代码质量
| 技能 | 用途 | 触发场景 |
|------|------|----------|
| `coding-standards` | 编码规范、命名约定、文件组织 | 日常开发 |
| `error-handling` | 错误处理模式、日志、重试策略 | 写 try/catch、异常处理 |
| `design-system` | 设计系统原则、组件一致性 | UI 组件设计 |

#### 工作流
| 技能 | 用途 | 触发场景 |
|------|------|----------|
| `tdd-workflow` | 测试驱动开发流程 | 新功能开发 |
| `e2e-testing` | 端到端测试策略（Playwright） | 写 E2E 测试 |
| `git-workflow` | Git 分支策略、提交规范 | 分支管理、合并 |
| `verification-loop` | 验证循环 — 改完确认有效 | 修改完成后 |
| `codebase-onboarding` | 新成员上手引导 | 新人加入、理解新模块 |

#### 安全（ECC 独有，与 OMC security-reviewer 互补）
| 技能 | 用途 | 触发场景 |
|------|------|----------|
| `security-bounty-hunter` | 安全漏洞主动发现 | 安全审计 |
| `safety-guard` | 代码安全护栏（输入校验、注入防护） | 写路由 handler |
| `gateguard` | 质量门禁 — 合入前检查清单 | PR 合入前 |

#### AI 工程 & 性能
| 技能 | 用途 | 触发场景 |
|------|------|----------|
| `ai-first-engineering` | AI 优先的开发方法论 | 设计 AI 功能 |
| `agentic-engineering` | 智能体工程设计模式 | PageAgent、AI 交互 |
| `prompt-optimizer` | Prompt 优化策略 | 调优 AI 提示词 |
| `cost-aware-llm-pipeline` | LLM 成本控制 | AI API 调用优化 |
| `token-budget-advisor` | Token 预算管理 | 长对话、批量处理 |
| `search-first` | 先搜索再开发方法论 | 开始新任务前 |

#### DevOps & 运维
| 技能 | 用途 | 触发场景 |
|------|------|----------|
| `docker-patterns` | Docker 最佳实践、多阶段构建 | Docker 配置变更 |
| `dashboard-builder` | 管理后台仪表盘设计 | Admin 页面开发 |

### OMC 技能（通过 `oh-my-claudecode:` 前缀调用）

#### 流程编排（日常高频）
| 命令 | 用途 |
|------|------|
| `/oh-my-claudecode:plan` | 制定实施计划 |
| `/oh-my-claudecode:code-review` | 代码审查 |
| `/oh-my-claudecode:simplify` | 代码精简优化 |
| `/oh-my-claudecode:verify` | 验证修改有效 |
| `/oh-my-claudecode:security-review` | 安全审查 |
| `/oh-my-claudecode:debug` | 系统化调试 |

#### 多代理编排
| 命令 | 用途 |
|------|------|
| `/oh-my-claudecode:team` | N 个协调代理并行工作 |
| `/oh-my-claudecode:autopilot` | 全自动执行 |
| `/oh-my-claudecode:ralph` | 自引用循环直到完成 |
| `/oh-my-claudecode:ultrawork` | 高吞吐并行执行 |

### 内置技能（无前缀，Claude Code 原生）
| 命令 | 用途 |
|------|------|
| `/code-review` | 当前 diff 代码审查 |
| `/security-review` | 当前分支安全审查 |
| `/simplify` | 代码简化 |
| `/verify` | 验证修改 |

---

## 命名冲突与解决

ECC 有 249 个技能，其中 2 个与内置/OMC 技能**同名**：

| 冲突名 | 解决方案 | 原因 |
|--------|----------|------|
| `security-review` | ❌ **未安装** ECC 版本。使用内置 `/security-review` + OMC `/oh-my-claudecode:security-reviewer` | 内置版覆盖 PR 审计场景，OMC 版用代理深度审查，功能已覆盖 |
| `deep-research` | ❌ **未安装** ECC 版本。使用 OMC 的 `/oh-my-claudecode:deep-research` | OMC 版更完整：多源搜索 → 交叉验证 → 合成报告 |

**其他"近似但不冲突"的技能**（名字相似但功能不同，两者都安装）：

| ECC 技能 | vs | OMC/内置 | 分工 |
|----------|----|----------|------|
| `verification-loop` | vs | `/verify` | ECC 提供方法论；内置 `/verify` 执行验证 |
| `tdd-workflow` | vs | `/oh-my-claudecode:test-engineer` | ECC 提供 TDD 流程指南；OMC 代理执行测试 |
| `git-workflow` | vs | `/oh-my-claudecode:git-master` | ECC 提供 git 规范；OMC 代理执行 git 操作 |
| `e2e-testing` | vs | `/oh-my-claudecode:qa-tester` | ECC 提供 E2E 策略；OMC 代理执行测试 |

---

## 组合技：1+1 > 2

### 场景一：新功能开发

```
/oh-my-claudecode:plan          ← OMC: 制定计划，分析影响范围
    ↓ (coding-standards 自动激活)
编写代码                          ← ECC: api-design, postgres-patterns, backend-patterns 指导
    ↓ (error-handling, safety-guard 自动激活)
/oh-my-claudecode:code-review   ← OMC: 代理审查代码质量
    ↓
/oh-my-claudecode:verify        ← OMC: 验证修改有效
    ↓ (verification-loop 自动激活)
/oh-my-claudecode:simplify      ← OMC: 精简优化
    ↓
提交                              ← ECC: git-workflow 指导提交规范
```

### 场景二：安全加固

```
/oh-my-claudecode:security-review  ← OMC: 安全代理深度审查
    ↓ (security-bounty-hunter 自动激活)
发现漏洞
    ↓ (safety-guard 自动激活)
修复代码                            ← ECC: 输入校验、注入防护模式
    ↓
/oh-my-claudecode:verify           ← OMC: 确认修复有效
    ↓ (gateguard 自动激活)
合入                                ← ECC: 质量门禁检查清单
```

### 场景三：数据库变更

```
/database-migrations              ← ECC: Schema 迁移策略
    ↓
编写迁移 SQL                       ← postgres-patterns 指导索引、约束
    ↓
/api-design                       ← ECC: 检查 API 是否需同步变更
    ↓
/oh-my-claudecode:code-review    ← OMC: 审查迁移安全性
    ↓
/oh-my-claudecode:verify         ← OMC: 验证迁移可回滚
```

### 场景四：前端新页面

```
/frontend-patterns                ← ECC: 组件设计模式
    ↓
/design-system                    ← ECC: 一致性检查
    ↓
/frontend-a11y                    ← ECC: 无障碍要求
    ↓
/dashboard-builder                ← ECC: 如果是管理后台页面
    ↓
编写代码
    ↓
/oh-my-claudecode:code-review    ← OMC: 代码审查
    ↓
/e2e-testing                      ← ECC: E2E 测试策略
    ↓
/oh-my-claudecode:qa-tester      ← OMC: 执行测试
```

---

## 快速参考：什么时候用哪个

### 用 ECC（领域知识）

- 不知道某个技术领域的最佳实践 → 查 ECC skill
- 写 SQL/API/前端组件时参考模式
- 安全编码规范（输入校验、注入防护）
- 数据库迁移策略
- Git 提交规范
- Docker 部署配置
- Token 成本控制

### 用 OMC（流程编排）

- 复杂多步骤任务 → `/plan` 先规划
- 代码写完了 → `/code-review` 审查
- 改完要确认 → `/verify` 验证
- 安全审计 → `/security-review`
- 大规模改动 → `/team` 并行
- 自驱动完成 → `/ralph` 或 `/autopilot`

### 用内置命令（快速检查）

- 改了一两行 → `/code-review` 快速审查
- 改了安全相关 → `/security-review` 分支审计
- 代码太啰嗦 → `/simplify` 精简

---

## 安装记录

- **安装日期**: 2026-06-02
- **安装方式**: GitHub raw content API 逐文件下载到 `.claude/skills/ecc/`
- **安装数量**: 26 个 ECC 技能（从 249 个中精选）
- **冲突处理**: 跳过 `security-review`、`deep-research`（使用内置/OMC 版）
- **命名策略**: ECC 技能不加前缀，放在 `ecc/` 子目录；OMC 技能使用 `oh-my-claudecode:` 前缀

## 维护

### 新增 ECC 技能

```bash
# 从 ECC 仓库下载新技能
curl -sL "https://raw.githubusercontent.com/affaan-m/everything-claude-code/main/skills/<skill-name>/SKILL.md" \
  -o .claude/skills/ecc/<skill-name>.md

# 检查是否与现有技能冲突
ls .claude/skills/ && ls ~/.claude/skills/
```

### 更新 ECC 技能

```bash
# 重新下载覆盖即可
curl -sL "https://raw.githubusercontent.com/affaan-m/everything-claude-code/main/skills/<skill-name>/SKILL.md" \
  -o .claude/skills/ecc/<skill-name>.md
```

### 移除不需要的技能

```bash
rm .claude/skills/ecc/<skill-name>.md
```
