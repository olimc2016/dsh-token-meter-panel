# AGENTS.md — dsh-token-meter-panel

> 给编码 agent 的**路由层**：只写「权威文档在哪」和「容易做错的动作」。
> 规则细节看 `docs/process/development-standard.md`。本文件保持 ≤100 行：超了先裁剪，再加新内容。

## 这个项目是什么
DSH（DeepSeek Harness）的 Token 用量 / 花费 / 余额面板插件。同一份源码发布两个包名：
`dsh-token-meter-panel`（主力；npm 上冻结在 0.6.4）与 `dsh-token-mb`（**npm 上的发行名**，由 `npm run twin` 生成）。

## 文件地图（改之前先看这里，别整读大文件）
| 文件 | 职责 |
|---|---|
| `lib/index.js` | 宿主半侧：settings schema、webServer 路由（summary/balance/health/settings）、官方用量与余额取数、更新检查 |
| `src/client/index.js` | 浏览器半侧源码（`React.createElement`，无 JSX）；面板 UI 全在这里 |
| `src/core.mjs` | 共享纯逻辑：会话日志聚合、计价、日期键 |
| `src/chrome-storage.mjs` | 从浏览器 / DSH 内嵌存储读 platform 登录态 |
| `tools/*.mjs` | 构建、模块链接、8 项自检、孪生包生成、预览 |
| `lib/client.js` | **构建产物，必须入库**（用户安装时不会现场构建） |

定位技巧：`grep -n "<关键字>" src/client/index.js`，然后只读 ±20 行；禁止「再通读一遍确认」。

## 常用命令
```bash
npm run setup    # 链接 @deepseek-ai/*（来自 DSH 本体）+ esbuild；pnpm add 之后必须重跑
npm run build    # 构建 lib/client.js（改了 src/client/** 必须跑）
npm test         # 8 项自检（verify-* / smoke-* / verify-twin）
npm run twin     # 生成 dist/dsh-token-mb
node tools/preview.mjs --open   # 真数据 + 真 bundle 的页面预览（截图 / 看版式）
```

## 守卫（这些做错会真的坏）
1. **构建失败必须硬失败**：esbuild 曾装在 `/tmp` 被清理 → build 失败但烟测仍测旧产物（假绿）。改完先确认 build 真的产出了新文件。
2. **改了判定逻辑必须反向验证**：故意破坏一次，确认测试变红，再恢复；没验证过的测试不入库。
3. **产物与源码同一次提交**：`lib/client.js` + `.map` 必须与 `src/` 同 commit。
4. **宿主改动必须重启 DSH 才生效**；只改客户端也要重新 build。
5. **公开仓库禁止出现**：账号 / 邮箱 / token / 账号找回材料 / 内部调研笔记（`docs/marketplace-research.md` 是刻意不入库的）。
6. **同一张表不许混口径**：官方金额与本地推算分开呈现；估算值必须标注「允许几分差异」。
7. **webServer 路由写在数组里**：每项结尾是 `}),` 不是 `});`（写错整文件语法错误）。
8. **官方接口鉴权别混**：账号会话用 `x-dsh-auth-token`，网页 token 用 `Authorization: Bearer`；用量窗口必须按北京零点对齐。
9. **依赖别装 `/tmp`**：esbuild 走 `~/.dsh/tools/esb`（`npm run setup` 负责）；pnpm registry 可能是镜像，装包加 `--registry=https://registry.npmjs.org/`。
10. **发布不可逆**：npm 版本发出去撤不回；发版前先 `npm pack --dry-run` 看白名单。

## token 预算（单次任务）
≤3 个文件、≤200 行改动；构建 + 全套测试 **1 次**；真机验证 **1 次**（攒批做）；设计稿 ≤2 轮；外部调研 0~1 次。

## 权威文档
- 工程规范：`docs/process/development-standard.md`
- 需求规格模板：`docs/specs/_template.md`（新功能先写一页 spec，验收标准必须可执行）
- 发版手册：`docs/runbook-release.md`
- 变更记录：`CHANGELOG.md`；设计定稿：`docs/design-v3.md`
