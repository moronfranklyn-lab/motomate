# Alpha 12 配置覆盖优先扩建报告

核验日期：2026-08-31

## 结论

按 Ethan 选择的“A：覆盖优先”执行。保留已冻结的第一批 8 条，新增 4 条通过 V0.2 确定性门禁的配置，形成 12 条内部 Alpha 池：

- 豪爵 TR300 都市版，保护价 21,980 元。
- 豪爵 TR300 旅行版，保护价 23,280 元。
- 豪爵 XCR300 标准机械配置，保护价 24,980 元。黑尾/银尾仅作外观选项，不重复建档。
- 五羊本田 CB190SS 辐条轮版，保护价 14,680 元。

本池 `eligible=12`、`recommendation approved=0`，只能用于已确认的内部 `development_preview`，不是对外正式推荐池。

## 未放行候选

本轮共审计了多个覆盖候选，未为达到 12 条而降低准入门槛：

- 无极 SR250GT Play/Pro：官网价可迁移为 `official_public_price_cny`，但主体绑定未闭环且 TCS 平台证据冲突，仍 blocked。
- 奔达灰石250手动/CVT、QJMOTOR赛250MINI、无极CU250两配置：缺官网公开价或主体/参数闭环，blocked。
- CB190R标准版/GP版：当前官网配置与平台历史配置无法安全映射，blocked。
- 无极300AC/300DS：当前官方目录未找到，blocked。
- 升仕350D/350E/350GK：官网商城明确已下架，ineligible，不得把368系列状态迁移给350系列。

详细状态见 `knowledge_base_outputs/exceptions/alpha_coverage_audit_2026-08-31.json`。

## 语义层

- 12 条均有用途标签和风格标签。
- 10 条有可测参数操作压力和新手友好候选值。
- 11 条有已知动力档。
- CB190SS 座高、ABS、TCS缺官方证据，操作压力与新手友好保持中性未知。
- 维护便利性仍全部 `unknown`，不参与排序。
- 语义信号仍只允许低权重内部测试，不对外展示分数。

## 路由与成本

本轮网页证据审计由 Codex 多任务并行完成，没有调用智谱或豆包。模型 API 调用 0，Token 0。页面来源才是事实依据；Codex 审计不是人工事实核验。

## 验收

- 原第一批 8 条 V0.2 校验：通过。
- Alpha 12 条池校验：通过，0 errors。
- Alpha 语义 12 条校验：通过，0 errors。
- 规则引擎现有 7 个场景：全部通过。
- 20 条工程冒烟：20 passed，0 failed，0 blocked。

## 下一步边界

主任务可将 `alpha_pool_v0.1.json` 和 `alpha_semantic_v0.2.json` 接入内部 Alpha。本报告不授权对外发布，也不产生首个 recommendation approval 批次。
