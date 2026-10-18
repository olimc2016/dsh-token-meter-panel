# 0.6.7 发版记录：发布物隐私面 + 平台包依赖修复

- 日期：2026-10-18
- 仓库：`~/Documents/deepseek-harness/default-workspace/dsh-token-meter-panel`
- 版本：`0.6.6` → `0.6.7`（孪生包 `dsh-token-mb` 同版本）
- 基线：`1be7965`（平台包依赖修复，已推送）

## 0. 结论

| 项 | 结果 |
|---|---|
| 修前发布物含内部审查报告 | **是**：`package/docs/reviews/duplicate-platform-packages-fix.md` |
| 修后发布物含内部审查报告 | **否**：`docs/` 下只剩 9 张 PNG，内部 `.md` 全部不在包内 |
| 修法 | `package.json` 的 `files` 由 `"docs"` 收窄为 `"docs/*.png"`（根 `.npmignore` 实测无效） |
| 孪生包版本 | `0.6.7`，由 `tools/make-twin.mjs` 从主包 `package.json` 读取，未手改 `dist/` |
| 9 项 test + build | 全部退出码 0（含 `env -i` 干净环境复跑） |
| CI | 已推 tag `v0.6.7` 触发；本机无 `gh`、无 `GITHUB_TOKEN`，**CI 结果需 Lead 用 token 盯** |
| staged id | **无**：workflow 是直接 `npm publish --provenance`，不是暂存发布 |

## 1. 发布物隐私面

### 1.1 修前（真实打包，不是 dry-run）

```bash
cd ~/Documents/deepseek-harness/default-workspace/dsh-token-meter-panel
node ~/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/pnpm/bin/pnpm.cjs \
  pack --pack-destination /tmp/pack-before
tar -tzf /tmp/pack-before/dsh-token-meter-panel-0.6.6.tgz | sort
```

结果：共 32 个条目，`docs/` 下 18 个文件，**包含内部审查报告**：

```
package/docs/reviews/duplicate-platform-packages-fix.md   ← 内部审查报告，不该发
package/docs/process/development-standard.md
package/docs/specs/001-render-gate.md
package/docs/specs/_template.md
package/docs/runbook-release.md
package/docs/design-v3.md
package/docs/listing.md
package/docs/marketplace-research.md
package/docs/palette.html
```

另外按仓库 `AGENTS.md`，`docs/marketplace-research.md` 属于「刻意不入库的内部调研笔记」，
因 `files: ["docs"]` 整目录打包，也一起进了发布物。

### 1.2 先试最小改动：根 `.npmignore`（失败）

新增 `.npmignore`：

```
docs/reviews/
docs/process/
docs/specs/
docs/runbook-release.md
```

重新 `pnpm pack` 后 `docs/reviews/...` **仍在包里**，其余排除项也全部无效。
原因：npm/pnpm 的打包语义是 `files` 字段优先，根 `.npmignore` 不能排除
`files` 已列出的目录内容。该文件已删除，避免留下一个看起来有效、实际不生效的配置。

### 1.3 实际修法（有效）

`package.json`：

```diff
-                  "docs",
+                  "docs/*.png",
```

只发 README / 上架截图需要的图片；所有 `.md`、`.html`、`reviews/`、`process/`、`specs/`
都不进包。修后重新真实打包：

```bash
cd ~/Documents/deepseek-harness/default-workspace/dsh-token-meter-panel
node ~/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/pnpm/bin/pnpm.cjs \
  pack --pack-destination /tmp/pack-final
tar -tzf /tmp/pack-final/dsh-token-meter-panel-0.6.7.tgz | sort
```

修后清单（23 个条目）：

```
package/CHANGELOG.md
package/LICENSE
package/README.en.md
package/README.md
package/THIRD-PARTY-NOTICES.md
package/cordis.patch.yml
package/docs/preview-dark.png
package/docs/preview-light.png
package/docs/promo-history.png
package/docs/promo-overview.png
package/docs/shot-2.png
package/docs/shot-3.png
package/docs/shot-4.png
package/docs/shot-overview.png
package/docs/shot-trend.png
package/lib/client.js
package/lib/client.js.map
package/lib/index.js
package/package.json
package/src/chrome-storage.mjs
package/src/client/index.js
package/src/core.mjs
package/src/zstd.mjs
```

- 内部审查报告：**0 个**（`grep -E 'docs/(reviews|process|specs)/'` 无命中）
- README 引用的 3 张图（`preview-dark.png`、`promo-overview.png`、`promo-history.png`）在包内均存在
- 包内 `package.json` 的 `version` 为 `0.6.7`，`files` 为 `docs/*.png`

### 1.4 敏感信息扫描（解包后 grep）

对修后 tarball 解包目录扫描：

- 家目录 / 用户目录路径：**无命中**
- 邮箱：**无命中**
- token 形状（`sk-*`、`ghp_*`、`github_pat_*`、`npm_*`、`AKIA*`、JWT）：**无命中**
- 内部报告文件名 / 路径：**无命中**
- `package.json` 的 `author: "oli20"` 是公开作者元数据，保留
- 历史 CHANGELOG 里原有一处作者本机路径（`C:/Users/...`、`F:/DSH/...`）已改为
  「Windows 用户目录 / 固定盘符」的中性描述，不再出现具体家目录

## 2. 版本与孪生包一致性

- 主包 `package.json`：`0.6.6` → `0.6.7`
- `tools/make-twin.mjs` 读主包 `package.json` 生成 `dist/dsh-token-mb/package.json`，
  只替换 `name` / `description`，**版本自动继承**；本次未手改 `dist/`
- `tools/verify-twin.mjs` 断言通过：

```
PASS 版本与主力包一致: 0.6.7
PASS 依赖与主力包一致: {}
```

- 平台包声明（0.6.7 包含 `1be7965` 的修复）：
  - `dependencies` 为空 `{}`
  - `@deepseek-ai/cordis`、`dsh-home-paths`、`dsh-settings`、`dsh-host-webserver`、
    `schemastery` 全部在 `peerDependencies` 且 `peerDependenciesMeta.*.optional = true`
  - 宿主半侧顶层无静态 bare import；`schemastery` / `dsh-home-paths` 为函数内动态
    `import()` + 降级

## 3. 门禁结果

环境：`node v24.21.0`（`~/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin/node`），
本机 `npm` 不在 PATH，因此直接 `node tools/<script>.mjs` 串联，逐个取退出码。

| 步骤 | 退出码 |
|---|---|
| `node tools/build-client.mjs` | 0 |
| `node tools/verify-generations.mjs` | 0 |
| `node tools/verify-core.mjs` | 0 |
| `node tools/verify-zstd.mjs` | 0 |
| `node tools/verify-rates.mjs` | 0 |
| `node tools/verify-storage.mjs` | 0 |
| `node tools/smoke-host.mjs` | 0 |
| `node tools/smoke-client.mjs` | 0 |
| `node tools/smoke-render.mjs` | 0 |
| `node tools/verify-twin.mjs` | 0 |

干净环境复跑（`env -i HOME=/tmp/cihome PATH=<node目录>:/usr/bin:/bin CI=true`）：
build 0，上述 9 个脚本全部 0。

`verify-twin` 关键输出：

```
PASS 主力包：平台包声明合规: []
PASS 主力包：宿主半侧顶层无静态 bare import: []
PASS 主力包：运行期动态 import 的平台包集合: ["@deepseek-ai/dsh-home-paths","@deepseek-ai/schemastery"]
PASS 反向自检：把 dsh-home-paths 塞回 dependencies 会被抓住: true
PASS 反向自检：把 schemastery 从 peer 移走会被抓住: true
PASS 孪生包：平台包声明合规: []
✅ verify-twin: 全部通过
```

## 4. 提交、tag 与 CI

- 提交：`chore(release): 0.6.7（发布物移除内部审查报告）`，包含
  `package.json`、`CHANGELOG.md`、本文件
- tag：`v0.6.7`，已推送
- `.github/workflows/publish.yml` 行为：
  - 触发：`push` tag `v*` + `workflow_dispatch`（**tag 触发**）
  - 发布方式：**直接发布**，不是暂存
    - `node tools/make-twin.mjs` → `cd dist/dsh-token-mb` → `npm publish --provenance --access public`
    - 主力包 `dsh-token-meter-panel` 是 `continue-on-error: true` 的 best-effort
      （该包名在 npm 上冻结在 0.6.4，账号不可访问）
  - 鉴权：OIDC Trusted Publishing（`id-token: write`），无需 token
- 因此**没有 staged id**；暂存批准这一步不存在。
- CI 状态：本机无 `gh` 命令，环境里也没有 `GITHUB_TOKEN` / `GH_TOKEN`，
  无法查询 run 结果 —— **需要 Lead 用 token 盯 `v0.6.7` 的 publish run**。

## 5. 未做 / 不确定

1. **未替用户批准任何 npm 暂存项**（本 workflow 也不是暂存发布）。
2. `dsh-token-mb` 的 npm Trusted Publisher 绑定状态本机无法确认；若未绑定，
   CI 的 `npm publish` 会失败。以 CI 实际结果为准。
3. 主力包 `dsh-token-meter-panel` 的发布步骤是 best-effort，失败不阻塞孪生包；
   本次修好的隐私面主要影响这个包的 tarball。
4. 孪生包沿用原有行为：`make-twin.mjs` 不复制 `docs/`，其 npm 页面上的 README 截图
   仍是缺图状态（0.6.6 及以前一样，本次未扩大改动范围）。
5. `docs/releasing-*.md` 不会被 npm 包收录（`files` 只收 `docs/*.png`），
   但会进公开 GitHub 仓库 —— 本文件不含账号/凭据/本机绝对路径。

## 6. 复现命令

```bash
NODE=~/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin/node
PNPM=~/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/pnpm/bin/pnpm.cjs
cd ~/Documents/deepseek-harness/default-workspace/dsh-token-meter-panel

# 发布物
$NODE $PNPM pack --pack-destination /tmp/pack-final
tar -tzf /tmp/pack-final/dsh-token-meter-panel-0.6.7.tgz | sort

# 门禁
$NODE tools/build-client.mjs
for s in verify-generations verify-core verify-zstd verify-rates verify-storage \
         smoke-host smoke-client smoke-render verify-twin; do
  $NODE tools/$s.mjs || echo "FAILED: $s"
done
```
