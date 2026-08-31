# MotoMate

面向摩托车新手的咨询 Agent MVP，核心能力是基于可信结构化车型数据进行确定性筛选，再由 AI 解释推荐依据与取舍。

## 当前范围

- 核心流程：新手选车推荐
- 辅助能力：轻量二手车风险助手
- 交互端：同一套响应式网页，兼顾手机端用户测试与桌面端面试展示
- 推荐架构：规则筛选 + AI 解释
- 知识库：第一批 8 个配置已进入确定性规则池

## 核心文件

- `MVP产品需求文档.md`：产品范围、流程与验收口径
- `Agent需求与架构设计V0.1.md`：已确认的 Agent 行为、数据契约、编排与实施基线
- `项目问题与解决方案档案.md`：项目问题、取舍、验证结果与面试复盘案例
- `system_prompt.md`：Agent 行为边界与解释策略
- `knowledge_base_outputs/eligible_pool/first_batch_v1.json`：第一批正式规则池
- `知识库状态与准入规则V0.2.md`：知识库状态与准入规则
- `scripts/`：模型抽取、抽样及确定性校验脚本
- `rules-engine.js`：正式知识库之上的确定性准入、初筛与低权重语义排序模块
- `decision-core.js`：预算换算、信息充分度和单问题追问状态模块
- `recommendation-pipeline.js`、`result-validator.js`：推荐候选编排与候选池越界校验
- `candidate-coverage.js`：候选数量、预算层次和类型多样性的覆盖检测，以及展示候选的预算分层选择
- `price-resolver.js`：缓存价格展示、过期刷新状态和同口径价格冲突的确定性解析模块
- `used-text-risk-tool.js`：二手车源字段整理、信息缺口、卖家问题和线下验车指引模块
- `cost-guard.js`：首轮模型费用硬上限与基础模式降级模块
- `external-candidate-verifier.js`：范围外临时候选的来源、在售、参数与价格证据门禁
- `bocha-search-client.js`：博查 Web Search 安全客户端、相关性过滤和来源域名分类
- `external-candidate-discovery.js`：从搜索线索中确定性提取车型身份、价格与类型，并与本地候选库去重
- `web-evidence-fetcher.js`：带域名、DNS、重定向、体积和网页内容安全限制的公开证据抓取器
- `external-evidence-pipeline.js`：编排官网与平台双源核验，只有通过门禁才生成库外临时候选
- `alpha-orchestrator.js`：内部 Alpha 的意图路由、状态判断、工具编排与降级入口
- `server/alpha-api.js`：加载独立17配置MVP开发预览池的本地HTTP API和脱敏审计事件
- `server/sqlite-store.js`：使用本机 SQLite 持久化会话、推荐版本、反馈与审计事件
- `knowledge_base_outputs/semantic_enrichment/`：第一批车型的可审计语义增强层
- `evaluations/smoke/smoke_cases_v0.1.json`：20 条工程冒烟测试契约
- `scripts/run-smoke-evals.mjs`：冒烟测试运行器，区分通过、失败和模块未实现阻塞
- `evaluations/golden/golden_cases_v0.1.json`、`scripts/run-golden-evals.mjs`：绑定17配置池的50条离线产品黄金评测与发布门禁
- `testing/首轮内部Alpha测试执行手册.md`：5人陪同式可用性测试的边界、说明、任务和决策规则
- `testing/首轮观察记录模板.csv`、`testing/五人测试结果汇总模板.md`：脱敏观察与结果汇总模板
- `scripts/check-alpha-test-readiness.mjs`：实时执行工程/API检查，分别判定陪同式可用性测试与外部邀请Alpha门禁
- `index.html`、`styles.css`、`app.js`：纯对话式响应网页，推荐、依据和反馈均位于对话流中

## 本地预览

启动本地 Alpha 服务后，通过 `http://127.0.0.1:4173/` 查看已接入真实编排器的网页。直接打开 `index.html` 无法访问同源 API。

运行规则引擎测试：

```bash
node scripts/test-rules-engine.mjs
node scripts/test-decision-core.mjs
node scripts/test-price-resolver.mjs
node scripts/test-used-text-risk-tool.mjs
node scripts/test-cost-guard.mjs
node scripts/test-external-candidate-verifier.mjs
node scripts/test-bocha-search-client.mjs
node scripts/test-external-evidence-pipeline.mjs
node scripts/test-external-search-integration.mjs
node scripts/check-external-evidence-positive-path.mjs
node scripts/test-alpha-orchestrator.mjs
node scripts/test-alpha-api.mjs
```

运行当前可执行的 20 条工程冒烟基线：

```bash
node scripts/run-smoke-evals.mjs
```

运行50条产品黄金评测：

```bash
node scripts/run-golden-evals.mjs
```

要求 20 条全部具备实现并通过时使用：

```bash
node scripts/run-smoke-evals.mjs --require-all
```

检查当前是否可以开展内部陪同测试或外部邀请 Alpha：

```bash
node scripts/check-alpha-test-readiness.mjs
```

当前实时门禁结果为：5人陪同式可用性测试已就绪；外部邀请Alpha未就绪。陪同测试只验证交互、理解、依据可见性和反馈完成，不得将`development_preview`作为真实购买建议。

当前用户主界面为纯对话式 Agent。候选首层使用“日常挪车、坐上去的感受、安全辅助”解释配置，专业数值和来源放入按需展开的依据。座高不根据身高做确定性适配承诺，必须结合腿长、坐垫宽度、悬挂下沉和车辆重心进行现场试坐与挪车。

推荐质量 V0.2 已加入候选覆盖检测和预算分层展示：预算继续作为上限，不要求用户花满；在用途与硬规则成立的候选中，优先展示“省心入门、均衡选择、预算内升级”三个层次。系统会检查候选数量、预算上沿覆盖、预算层次数和车型多样性，覆盖不足时自动调用博查 Web Search 发现相关网页线索。搜索线索仍需完成车型身份、在售状态、官方参数和同配置平台价格核验，不会直接进入候选，也不会使用模型记忆补充车型。

博查 Web Search 使用本机 `.env` 中的 `BOCHA_API_KEY`。客户端默认8秒超时、最多10条结果、拒绝本机回环地址、限制文本长度，并按实际URL域名重新分类来源，避免相信第三方错误站点标签。搜索结果必须同时具备摩托车与产品信息信号才会保留；保留后仍标记为`evidence_verified=false`和`candidate_use_allowed=false`。

库外证据管线已完成代码接入和真实网页正反向试跑。搜索线索会先提取车型身份并与本地35条候选Registry去重，再分别核验允许域名内的品牌官网在售/关键参数证据和主流平台同配置/同口径价格证据；抓取器同时限制DNS私网地址、重定向次数、页面体积与可疑提示注入内容。官网信息分散时，管线可在同品牌官网、有限页面数内合并车型概览、价格和参数证据；泛车型只有在官网出现明确“价格紧邻配置名”时才会收敛为具体配置。1.8万元巡航场景中的春风250CL-C因缺官网证据被阻断；豪爵TVL350则从泛车型自动收敛为扶手版，并以官网和摩托范同配置证据通过，价格为28,980元。通过结果仍仅是`verified_temporary_candidate`，不进入正式知识库或正式推荐。

当前工程冒烟基线为20条通过、0条失败、0条阻塞，50条离线产品黄金评测为50/50通过；博查客户端17个场景、库外证据管线30个场景、自动搜索集成9个场景、编排器11个场景和Alpha API 13个场景通过。黄金评测促成了落地总预算筛选修复：3万元落地预算保留原始需求展示，但规则筛选使用扣除费用预留后的26,500元上限。自动发现采用通用搜索加最多2次车型类型相关品牌定向补搜；用户明确车型类型时，不接受类型未知的库外草稿。核验完成后还会按用户预算再次拦截，防止搜索摘要缺价的候选绕过预算初筛。TVL350的4万元页面场景仅用于触发预算覆盖不足的技术验收，不代表MVP正式价格范围从1至3万元扩大。价格模块仍不包含通用的真实联网刷新；二手模块不包含图片分析、真实车况鉴定或行情判断；费用门禁尚未接入真实计费存储和请求网关。

内部 Alpha 编排器另有 8 个端到端场景通过，可统一路由选车、价格、二手文字和范围外候选，并在费用上限下保留规则与固定模板能力。本地 Alpha API 另有 13 个场景通过，显式加载17配置`mvp_eligible_pool_v0.1`与`mvp_semantic_v0.1`，支持静态网页、健康检查、多轮会话、推荐版本、结构化反馈和不保存原始咨询文本的审计事件。会话、推荐版本、反馈和审计事件已分表写入本地 SQLite，并通过服务重启后读取回归。候选卡可展开查看入选原因、价格口径、字段核验状态、公开来源、规则评估和Codex运营复核时间，且明确区分运营复核与正式推荐批准。本地反馈复盘页汇总推荐版本数、反馈覆盖率、平均评分、有效帮助率、评分分布、帮助标签、失败原因和最近反馈，不返回会话ID。网页已移除虚构车型目录和浏览器本地推荐算法，选车与二手结果均来自 Alpha API。17配置全部仅限`development_preview`且`recommendation_approved_count=0`；当前仍未接入模型解释、认证、云数据库、备份、删除生命周期或公网安全配置。`/api/internal/feedback-summary`无管理员认证，只能用于本地 Alpha，不得公网暴露。

启动本地 Alpha API：

```bash
node server/alpha-api.js
```

## 安全说明

真实 API Key 仅保存在本机 `.env`，不会提交到仓库。`.env.example` 只保留变量名和示例配置。

当前仓库作为私有开发与作品整理空间使用，后续公开前还会进一步精简过程文件并检查访谈材料隐私。
