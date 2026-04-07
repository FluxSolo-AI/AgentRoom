# AgentRoom 系统架构与设计文档

## 1. 背景与目标

### 1.1 背景

参考 `hiclaw` 与 `tuwunel` 的经验，可以看到一个有效的多 Agent 系统通常需要三类能力：

- Agent 之间可异步通信
- 任务过程可观测、可追踪、可回放
- 人类可以在关键节点介入，而不是只能旁观

其中，`hiclaw` 通过 `tuwunel` 承担多 Agent 通信与协作，这种方式的优点是统一、完整，但缺点也明显：

- 通信层与业务层耦合较深
- 负载较重，扩展和替换成本高
- 如果目标仅仅是 AI Agent 协同，整体系统显得偏重

因此，`AgentRoom` 采用更聚焦的方案：

- 用 `NATS` 作为消息总线
- 把“Agent 通信”与“业务应用”明确分层
- 把“人工介入”做成一等能力
- 把前端抽象成“房间”，让协作和介入都围绕房间展开

### 1.2 产品目标

`AgentRoom` 的目标不是做一个通用工作流平台，而是做一个专注于 AI 多 Agent 协作的实时系统。

核心目标：

- 支持多 Agent 在房间内协同工作
- 支持事件驱动的任务拆分、转发、订阅和汇总
- 支持人工旁观、插话、审批、接管和恢复自动化
- 支持完整的消息流、状态流和决策流审计
- 支持横向扩展，通信层保持轻量

### 1.3 非目标

本系统当前不追求：

- 通用 BPMN 级流程引擎
- 复杂强一致事务编排
- 替代向量数据库、模型网关或知识库本身
- 构建重量级微服务 ESB

---

## 2. 设计原则

### 2.1 聚焦通信，不把总线变成业务平台

`NATS` 只负责：

- 发布/订阅
- 请求/响应
- 队列消费
- 持久化事件流（使用 JetStream 时）

业务状态、权限、房间视图、消息归档不直接塞进总线。

### 2.2 事件优先，状态可重建

系统内部以事件为核心：

- 一切协作行为都尽可能表达为事件
- 房间当前状态由事件流和持久化投影共同生成
- 关键操作必须可回放、可追踪

### 2.3 人工介入是一等公民

人工不是系统外部角色，而是系统内的特殊参与者：

- 人类可以和 agent 一样向房间发送消息
- 人类可以发起审批、打断、接管、回滚、重试
- 人工动作必须与 agent 动作同样被记录

### 2.4 房间即协作边界

“房间”是系统里的第一层组织单元，负责承载：

- 一组 agent
- 一个上下文窗口
- 一条任务主线
- 一组人工参与者
- 一组消息和状态投影

### 2.5 模块边界清晰

建议按以下边界拆分：

- 消息总线层
- 协作编排层
- 房间状态层
- Agent 执行层
- 人工介入层
- 前端交互层

---

## 3. 总体架构

### 3.1 逻辑架构

```text
+---------------------------------------------------------------+
|                           Web UI                              |
|      Room View / Timeline / Intervention Panel / Audit        |
+------------------------------+--------------------------------+
                               |
                               v
+---------------------------------------------------------------+
|                        API Gateway / BFF                       |
|   Auth / Room API / WebSocket / SSE / Human Actions API       |
+------------------------------+--------------------------------+
                               |
         +---------------------+---------------------+
         |                                           |
         v                                           v
+--------------------------+            +---------------------------+
|   Room Service           |            |   Orchestrator Service    |
| room state / projection  |            | task graph / policies     |
| participants / timeline  |            | routing / approvals       |
+-------------+------------+            +-------------+-------------+
              |                                         |
              v                                         v
         +---------------------------------------------------+
         |                NATS / JetStream                   |
         |   subjects / streams / durable consumers / RPC   |
         +---------------------------------------------------+
              |                 |                 |
              v                 v                 v
+-------------------+ +-------------------+ +----------------------+
| Agent Runtime A   | | Agent Runtime B   | | Human-in-the-Loop    |
| planner / tooler  | | coder / reviewer  | | intervention worker  |
+-------------------+ +-------------------+ +----------------------+
              |
              v
+---------------------------------------------------------------+
|                 Storage & Supporting Services                  |
| Postgres / Redis / Object Storage / Vector DB / Model Gateway |
+---------------------------------------------------------------+
```

### 3.2 核心组件

#### A. `NATS / JetStream`

负责所有实时消息流：

- 房间消息广播
- Agent 命令下发
- Agent 状态上报
- 任务事件流
- 人工介入事件

#### B. `Orchestrator Service`

负责协作逻辑，而不是模型执行：

- 创建任务
- 拆分子任务
- 指定目标 agent 或 agent group
- 维护任务状态机
- 处理超时、重试、升级、人工审批策略

#### C. `Room Service`

负责“房间”这一产品抽象：

- 房间创建/关闭/归档
- 房间参与者管理
- 房间消息时间线投影
- 读取当前房间快照
- 为 UI 提供高效查询接口

#### D. `Agent Runtime`

每类 agent 是一个可横向扩展的执行单元：

- 订阅自己关心的 subject
- 收到任务后拉取上下文
- 调用模型/工具
- 产出结果或请求协作
- 上报中间状态和最终结果

#### E. `Human Intervention Worker`

负责人工介入机制：

- 审批阻塞任务
- 把人工消息注入房间
- 接管 agent 流程
- 在人工完成后恢复自动化

#### F. `API Gateway / BFF`

面向前端提供统一接口：

- 鉴权
- Room REST API
- WebSocket / SSE 推送
- 人工操作提交

---

## 4. 房间模型设计

### 4.1 为什么采用房间

房间是天然的多方协作容器，优点是：

- 用户容易理解
- 可以隔离上下文
- 适合实时消息流展示
- 适合把 agent 和人类统一看作参与者

### 4.2 房间核心对象

#### `Room`

字段建议：

- `id`
- `name`
- `type`：`task_room` / `incident_room` / `review_room`
- `status`：`active` / `paused` / `waiting_human` / `completed` / `archived`
- `created_by`
- `created_at`
- `context_ref`
- `policy_id`

#### `Participant`

统一抽象人和 agent：

- `id`
- `room_id`
- `participant_type`：`human` / `agent` / `system`
- `role`
- `display_name`
- `runtime_ref`
- `presence_status`

#### `RoomMessage`

- `id`
- `room_id`
- `sender_id`
- `sender_type`
- `message_type`
- `thread_id`
- `reply_to`
- `content`
- `attachments`
- `created_at`
- `trace_id`

#### `Task`

- `id`
- `room_id`
- `parent_task_id`
- `title`
- `goal`
- `assigned_to`
- `status`
- `priority`
- `requires_human`
- `deadline_at`
- `trace_id`

#### `Intervention`

- `id`
- `room_id`
- `task_id`
- `intervention_type`
- `requested_by`
- `resolved_by`
- `status`
- `reason`
- `created_at`
- `resolved_at`

### 4.3 房间视图建议

UI 上至少包含以下分区：

- 左侧：房间列表
- 中间：消息时间线
- 右侧：任务与状态面板
- 底部或右下：人工介入面板

---

## 5. 消息与事件模型

### 5.1 为什么用 NATS

相对重量级编排基础设施，`NATS` 更适合这个场景：

- 部署轻
- 延迟低
- pub/sub 语义直接
- request/reply 适合 agent RPC
- queue group 适合 agent runtime 横向扩展
- JetStream 适合保留事件历史和重放

### 5.2 Subject 设计建议

建议采用层次化命名：

```text
room.{roomId}.message
room.{roomId}.event
room.{roomId}.task.created
room.{roomId}.task.updated
room.{roomId}.intervention.requested
room.{roomId}.intervention.resolved

agent.{agentType}.command
agent.{agentType}.event
agent.{agentId}.command
agent.{agentId}.status

orchestrator.task.dispatch
orchestrator.task.result
orchestrator.policy.alert
```

原则：

- 面向领域命名，不面向实现细节命名
- 房间维度和 agent 维度分开
- 广播型 subject 和点对点命令 subject 分开

### 5.3 事件类型

建议统一事件 envelope：

```json
{
  "event_id": "evt_123",
  "event_type": "task.created",
  "room_id": "room_001",
  "task_id": "task_001",
  "sender": {
    "id": "agent_planner_01",
    "type": "agent"
  },
  "trace_id": "trace_abc",
  "timestamp": "2026-04-07T12:00:00Z",
  "payload": {}
}
```

关键事件建议包括：

- `room.created`
- `participant.joined`
- `message.posted`
- `task.created`
- `task.assigned`
- `task.started`
- `task.progressed`
- `task.blocked`
- `task.completed`
- `task.failed`
- `intervention.requested`
- `intervention.accepted`
- `intervention.resolved`
- `agent.status.changed`
- `policy.violation.detected`

### 5.4 命令与事件分离

建议严格区分：

- 命令：希望别人做什么
- 事件：某件事已经发生

例如：

- 命令：`AssignTask`
- 事件：`TaskAssigned`

这样能减少系统语义混乱。

---

## 6. Agent 协作模型

### 6.1 Agent 角色建议

一个典型房间可以有以下 agent：

- `Planner Agent`：拆解目标，生成任务树
- `Executor Agent`：执行具体任务
- `Reviewer Agent`：审查结果，指出问题
- `Summarizer Agent`：汇总过程与结论
- `Router Agent`：根据策略分发到合适 agent
- `Guardrail Agent`：做合规、风险和策略检查

### 6.2 通信模式

支持三种基本模式：

#### 1. 广播协作

某个事件发到房间，多个 agent 都可看到。

适合：

- 上下文共享
- 新需求宣布
- 人类插话

#### 2. 定向委派

由编排器将任务发给特定 agent 类型或实例。

适合：

- 执行任务
- 代码生成
- 审查

#### 3. 请求-响应

一个 agent 向另一个 agent 发起短链 RPC。

适合：

- 快速问答
- 工具调用封装
- 状态查询

### 6.3 上下文管理

不要把完整上下文一直塞进消息体，而要采用“消息 + 引用”模式。

建议：

- 消息里传 `context_ref`
- 长文本放对象存储或数据库
- embedding / 检索走独立知识服务

这样可以避免总线承压和消息膨胀。

### 6.4 失败与补偿

Agent 失败时建议分层处理：

- 短暂异常：自动重试
- 能替代的失败：路由到备用 agent
- 连续失败：升级为人工介入
- 高风险动作：直接等待人工审批

---

## 7. 人工介入设计

### 7.1 人工介入的必要性

多 Agent 系统如果完全自动化，会很快遇到这些问题：

- 决策不可解释
- 错误会级联放大
- 高风险操作无法管控
- 用户无法判断什么时候该介入

因此人工介入必须成为标准流程。

### 7.2 人工介入类型

建议支持以下操作：

- `comment`：人在房间发消息
- `nudge`：提示某 agent 继续或调整方向
- `approve`：审批某个任务或动作
- `reject`：拒绝结果并要求重做
- `takeover`：人工接管某个任务
- `resume`：人工处理后恢复自动流程
- `pause_room`：暂停整个房间
- `kill_task`：终止任务

### 7.3 介入触发条件

以下情况应触发人工介入请求：

- 高风险动作
- 重试次数超阈值
- 任务长时间无进展
- 多 agent 结论冲突
- 审查 agent 判断不通过
- 用户显式要求进入审批点

### 7.4 介入状态机

```text
open -> accepted -> resolved
open -> rejected
open -> timeout -> escalated
```

### 7.5 人工接管语义

接管不是简单发条消息，而是状态切换：

- 将任务状态改为 `waiting_human` 或 `human_owned`
- 暂停自动重试与自动续跑
- 人工完成后明确 `resume_policy`

`resume_policy` 建议支持：

- `resume_from_last_step`
- `rerun_current_step`
- `create_followup_task`
- `close_task`

---

## 8. 前端产品设计

### 8.1 总体交互目标

前端不是聊天框包装器，而是协作控制台。

用户应当能一眼看到：

- 当前房间在做什么
- 哪些 agent 正在工作
- 哪个任务被卡住
- 是否需要人工介入
- 最终结果在哪里

### 8.2 关键页面

#### A. 房间大厅

展示：

- 房间列表
- 状态筛选
- 最近活动
- 等待人工介入的房间数

#### B. 房间详情页

包含四块主区域：

- 消息流
- 任务树
- 参与者状态
- 介入面板

#### C. 审计回放页

支持：

- 按时间回放
- 按 trace 查看
- 按 task 查看
- 对比人工决策前后变化

### 8.3 房间详情页布局建议

```text
+---------------------------------------------------------------+
| Room Header: name / status / owner / policy / actions         |
+----------------------+----------------------+------------------+
| Timeline             | Task Tree            | Intervention     |
| messages / events    | task graph / states  | approvals/block  |
| agent outputs        | retry / owner / SLA  | comments/actions |
+----------------------+----------------------+------------------+
| Composer / Command Bar / Human Takeover Controls              |
+---------------------------------------------------------------+
```

### 8.4 UI 中的房间消息类型

建议区分展示：

- 普通消息
- agent 思考摘要
- 任务状态变化
- 风险告警
- 人工介入事件
- 系统通知

不要把所有内容都渲染成同一种聊天气泡，否则很快不可读。

### 8.5 可观测性设计

在房间 UI 里直接展示：

- 当前 trace id
- 当前 active task
- agent 心跳 / last seen
- 当前是否等待人工
- 上一步 / 下一步建议动作

---

## 9. 服务拆分建议

### 9.1 最小可用版本（MVP）

MVP 建议只做 5 个服务：

- `web`
- `api-gateway`
- `room-service`
- `orchestrator`
- `agent-runtime`

基础设施：

- `NATS`
- `Postgres`
- `Redis`

### 9.2 后续可拆分服务

在系统扩大后再拆：

- `audit-service`
- `policy-service`
- `context-service`
- `notification-service`
- `model-gateway`

### 9.3 为什么不要一开始拆太细

因为这个系统最先要验证的是：

- 房间模型是否好用
- 人工介入是否自然
- 多 agent 协作路径是否稳定

不是验证微服务数量。

---

## 10. 存储设计

### 10.1 Postgres

存储结构化元数据：

- room
- participant
- task
- intervention
- room message index
- projection tables

### 10.2 Redis

用于：

- 热状态缓存
- presence
- websocket session
- 短期去重键

### 10.3 Object Storage

用于：

- 长文本上下文
- 文件附件
- 运行日志归档

### 10.4 JetStream

用于：

- 保留关键事件流
- 重放房间事件
- 构建异步投影

建议不要把 JetStream 当成唯一业务数据库，而是把它当成事件层。

---

## 11. 权限与安全设计

### 11.1 权限模型

建议按房间和操作控制权限：

- `room:read`
- `room:write`
- `room:intervene`
- `room:approve`
- `room:admin`

### 11.2 Agent 权限

Agent 也要有执行权限边界：

- 可读哪些上下文
- 可调用哪些工具
- 可操作哪些任务
- 哪些动作必须人工审批

### 11.3 审计要求

以下动作必须审计：

- 任务创建与分配
- agent 结果提交
- 人工审批/拒绝
- 接管/恢复
- 策略命中

---

## 12. 可靠性设计

### 12.1 消息投递语义

建议按场景区分：

- 房间广播：至少一次
- 任务分配：至少一次 + 幂等消费
- UI 瞬时状态：最多一次也可接受

### 12.2 幂等设计

所有关键 consumer 都应按 `event_id` 或 `command_id` 去重。

例如：

- 重复的 `TaskAssigned` 不应生成两个任务
- 重复的 `InterventionRequested` 不应创建多个待审批单

### 12.3 心跳与超时

每个 agent runtime 定期上报：

- `agent_id`
- `room_id`
- `task_id`
- `heartbeat_at`
- `load`
- `last_error`

编排器可据此做：

- 健康检查
- 超时判断
- 任务迁移

---

## 13. 一个典型工作流

以“用户在房间发起复杂任务”为例：

### 13.1 流程

1. 用户创建房间并输入目标
2. `Room Service` 记录房间，发布 `room.created`
3. `Orchestrator` 创建主任务，发布 `task.created`
4. `Planner Agent` 订阅后拆解任务树
5. `Orchestrator` 将子任务分派给不同 agent
6. `Executor Agent` 执行并持续发布进度
7. `Reviewer Agent` 审查结果
8. 若风险较高，系统发布 `intervention.requested`
9. 人类在房间中审批、修改或接管
10. 任务结束后，`Summarizer Agent` 输出最终总结
11. `Room Service` 更新房间状态为 `completed`

### 13.2 事件流示例

```text
room.created
task.created
task.assigned
task.started
message.posted
task.progressed
task.blocked
intervention.requested
intervention.accepted
message.posted
task.resumed
task.completed
room.completed
```

---

## 14. 技术栈建议

### 14.1 后端

建议：

- `TypeScript + NestJS` 或 `Fastify`
- `NATS.js`
- `Postgres`
- `Redis`
- `Prisma` 或 `Drizzle`

如果更偏基础设施控制，也可以选：

- `Go`
- `nats.go`
- `Postgres`

### 14.2 前端

建议：

- `Next.js`
- `React`
- `Tailwind CSS` 或自定义 design tokens
- `TanStack Query`
- `WebSocket` 或 `SSE`

### 14.3 原因

这套组合有几个好处：

- 对实时交互支持成熟
- 社区生态足够好
- 便于快速做 MVP
- 也方便后续把某些核心服务迁移到 Go

---

## 15. 与 hiclaw / tuwunel 的关系定位

### 15.1 借鉴点

借鉴的核心思想有三点：

- 多 Agent 不是单轮聊天，而是协作网络
- 人工介入必须进入协作闭环
- 系统需要可观测，而不是黑盒自动化

### 15.2 差异化定位

`AgentRoom` 的差异化在于：

- 不把协作通信平台做成重平台
- 用 `NATS` 替代更重的通信承载方式
- 围绕“房间”做产品抽象
- 优先打磨 agent 协作与人工介入，而不是通用业务建模

换句话说：

- `hiclaw` / `tuwunel` 更像完整协作基础设施思路
- `AgentRoom` 更像轻量、实时、AI-first 的协作控制面

---

## 16. MVP 范围建议

第一阶段建议只实现这些能力：

- 创建房间
- 房间内发送消息
- 至少 3 类 agent
- 编排器支持任务拆分与分发
- 人工审批/接管/恢复
- 房间时间线和任务树
- 基本审计回放

明确不做：

- 复杂插件生态
- 跨组织权限模型
- 高级策略 DSL
- 多租户计费

---

## 17. 迭代路线图

### Phase 1: 协作闭环

- 房间模型
- NATS 总线
- 基础 agent runtime
- 人工介入 MVP

### Phase 2: 稳定性

- JetStream 持久化
- 重试、幂等、死信
- 审计与回放
- 任务超时与升级

### Phase 3: 智能化

- 动态路由
- agent 负载感知
- 策略驱动审批
- 长上下文检索

### Phase 4: 平台化

- 多工作空间
- 插件与工具权限
- 高级仪表盘
- 模型成本与效率分析

---

## 18. 核心结论

`AgentRoom` 的推荐架构可以概括为一句话：

> 用 `NATS` 提供轻量实时消息骨架，用“房间”组织多 Agent 协作，用人工介入机制保证系统可控。

最终系统的关键不是“有多少 agent”，而是这四件事是否成立：

- 协作是否自然
- 通信是否轻量
- 人工是否能及时介入
- 过程是否可见、可控、可回放

如果这四点成立，这个系统就能在复杂 AI 协作场景里比重型方案更容易落地。

---

## 19. 下一步实现建议

如果按工程落地顺序推进，建议下一步直接开始：

1. 定义 `Room`、`Task`、`Intervention`、`EventEnvelope` 数据结构
2. 落地 `NATS subject` 命名规范和事件协议
3. 实现 `room-service` 与 `orchestrator` 的最小骨架
4. 做一个单房间 Web UI，先把时间线、任务树和人工介入面板跑通
5. 接入 2 到 3 个最小 agent runtime 验证闭环
