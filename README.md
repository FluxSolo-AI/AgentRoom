# AgentRoom

`AgentRoom` 是一个面向 AI 多 Agent 协作的房间式系统。

设计目标：

- 借鉴 `hiclaw` / `tuwunel` 的多 Agent 协作与可观测思路
- 使用 `NATS` 作为轻量消息总线，降低通信层负担
- 只聚焦 AI Agent 间通信、编排、人工介入和房间态协作
- 提供类似“房间”的交互界面，统一呈现 agent、消息、任务和人工接管

文档入口：

- [系统架构与设计文档](/work/playground/fluxroom/docs/architecture.md)

当前仓库以设计为主，后续可按文档中的模块边界逐步实现。
