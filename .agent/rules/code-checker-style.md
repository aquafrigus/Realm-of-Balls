---
trigger: always_on
---

### 核心开发规范 (Core Development Standards)

1. **机制对称性 (Symmetrical Mechanics)**: 新增或修改游戏机制时，必须验证其在人类玩家与 AI 代理（Agent）之间具有逻辑对称性。需从交互逻辑、数据状态及反馈表现等多个视角确保系统行为的一致性。
2. **环境控制 (Environment Control)**: 禁止擅自启动本地开发服务器或背景常驻进程。保持开发环境的简洁与确定性。
3. **全球化架构导向 (Globalization Ready)**: 界面文案应具备多语言（i18n）扩展能力。避免散乱的文本硬编码，优先采用集中式资源管理，以支持未来语言切换及文案批量维护的高效性。

### 工程可靠性 (Engineering Reliability)
- 当代码修改工具（如 replace_file_content 或 multi_replace_file_content）返回 "We did our best to apply changes despite some inaccuracies" 时，必须执行以下操作：
  - 立即使用 view_file 严谨验证每个修改点的实时状态。
  - 在回复中明确列出修改成功的区块及失败/跳过的部分。
  - 仅在手动确认所有预期变更均已准确应用后，方可宣布任务完成。

### 对战兼容性设计 (PvP Compatibility)
- 实现新机制、视觉特效或全局状态（如子弹时间、屏幕滤镜等）时，架构必须原生兼容未来的 PVP 模式。
- 设计原则：所有特效与状态必须由同步的底层数据（Synced State）驱动，严禁由本地输入事件直接驱动。
- 视觉验证：确保所有客户端（包括本地玩家、人类对手及 AI）在对应状态下均能复现一致的视觉表现。
