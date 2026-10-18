# Spec: 给面板补"渲染期异常"闸门（白屏回归）

- 日期：2026-10-18 / 作者：lead / 关联 commit：待定
- 状态：**done**（2026-10-18 实现并验证通过）

## 1. 背景与目标
0.6.6 之前出过一次**整面板白屏**：趋势图轴标签的 `map` 回调里用了 `index`，但那个 `map` 没声明该参数 → 数据到手、渲染到图表分支时抛 `ReferenceError`。
现有 `tools/smoke-client.mjs` 只渲染"加载中"状态，走不到图表/表格分支，所以 CI 没拦住。
**目标**：让这类"只有数据分支才炸"的渲染期异常，在 `npm test` 里就能拦住。

## 2. 非目标
- 不做视觉回归 / 像素比对（那是另一个问题）
- 不引入浏览器环境、不依赖网络
- 不重构面板组件结构

## 3. 验收标准
| # | 场景 | 期望结果 | 怎么验证 |
|---|---|---|---|
| AC1 | 正常情况 | `npm test` 8/8 全绿 | 本机 + CI（ubuntu/windows） |
| AC2 | **反向验证**：删掉轴标签 `map` 的 `, index` 参数 | `smoke-client` **必须非零退出**（测试变红） | `sed` 改一行 → `npm run build` → 跑 `smoke-client`，断言 exit≠0；再恢复 |
| AC3 | 覆盖度 | 有数据状态的渲染遍历节点数 **> 200** | 测试输出打印节点数 |
| AC4 | 离线/可移植 | 不联网、不依赖个人路径 | 断网跑一次；换目录跑一次 |
| AC5 | 不退化 | 原有 slot id / 包名派生断言仍通过 | 现有断言保留 |

> AC2 是**准入条件**：跑不出红色就不算完成（这是本项目的"反向验证"铁律）。

## 4. 数据口径
与数据无关（纯渲染）。样例 payload 只需覆盖分支：`days`（含今天、含 tier 分档）、`config`（含 rates / 预算 / 低余额阈值）、`official`（ok + days）、`sessions`、`sessionsList`、`pricing`、`partialScan` 等字段。

## 5. 技术要点与风险
**关键假设**：面板 bundle 可能在求值时**已解构** `useState`，因此现有"先求值、后替换 `stubReact.useState`"的做法不生效（这正是上一版假闸门失效的最可能原因）。
→ 做法：**在 `new Function(code)()` 之前**就把"注入 ready 数据"的 `useState` 装进 React 桩，再做一次遍历渲染。
**兜底**：若该假设不成立（反向验证仍不变红），改用**真挂载**——真 React（可从 npm 装 `react`/`react-dom` 作为 devDependency）+ 最小 DOM（`happy-dom` 或 `linkedom`），挂载一次有数据的面板，断言不抛错且关键节点存在。
**风险**：添加 devDependency 会让 CI 安装变慢（可接受，`npm install` 已在跑）。
**回滚**：纯测试改动，回滚 = revert 该 commit，不影响运行时。

## 6. 任务清单
- [ ] T1 改造 `tools/smoke-client.mjs`：ready 数据注入提前到 bundle 求值之前
- [ ] T2 遍历渲染 + 打印节点数（AC3）
- [ ] T3 跑反向验证（AC2），把"改哪一行、是否变红"记录进 §7
- [ ] T4 `npm test` 全绿（AC1/AC4/AC5），提交
- [ ] T5（可选 P1）把反向验证脚本化为 `tools/mutate-check.mjs`，以后一键跑

## 7. 验证记录（已完成）
- 实现：新增 `tools/smoke-render.mjs`（独立测试：求值前装好"有数据"的 useState → 遍历函数组件树上限 297 节点），已接入 `npm test`。
- 自检：全套 **9/9** 通过（新增 smoke-render）。
- **反向验证（AC2）**：`sed` 去掉轴标签 `trend_.map(({ key, entry }, index)` 的 `, index` → `npm run build` → `node tools/smoke-render.mjs` **退出码 1**，堆栈指向 `Array.map → TokenMeterPanel`；恢复源码后重新通过 ✅
- 覆盖度（AC3）：297 个节点（阈值 >200）。
- 离线/可移植（AC4）：不联网、不依赖个人路径。
- 备注：此前的两次失败尝试（在既有 `smoke-client` 里后置注入）被证伪——**注入必须发生在 bundle 求值之前**，并放在独立文件里（单一职责）。
