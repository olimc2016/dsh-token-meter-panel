# DSH 插件市场调研与发布/收录指南

调研时间：本机 Desktop 版 DSH（`dshBuildCommit 5e9e301`，profile `desktop`）
调研方法：直读本机 `app.asar` 内官方模块与技能文档 + npm registry API + GitHub API + 官方仓库文档

---

## 0. 结论速览

| 问题 | 结论 |
|---|---|
| 官方插件市场叫什么？ | **不存在官方插件市场。** 官方入口是侧栏的**「插件 / Plugins」面板**，不是市场 |
| 官方"收录"机制是什么？ | 给插件仓库加 GitHub 话题 **`dsh-plugin`**（官方 README 明文） |
| 官方"发布"机制是什么？ | 把包**发到 npm**（或 git / tarball），包内声明 `dsh.bundle.patch` |
| 那些叫"插件市场/插件中心"的是什么？ | 全部是**第三方**插件，自己声明与官方无隶属关系 |
| 是否需要提交表单/审核？ | 官方：不需要。社区目录：各有 PR / 表单流程 |

---

## 1. 桌面版官方叫法：没有"市场"

在本机 `app.asar` 里逐字检索：

```
插件市场: 0 occurrences
插件中心: 0 occurrences
插件商店: 0 occurrences
插件列表: 27 occurrences
内置插件: 12 occurrences
```

`marketplace` 的出现只有两处来源，都与插件无关：GitHub webhook 事件文档（`marketplace_purchase`）与 TypeBox 的 VS Code 市场链接。

官方实际存在的两个界面：

| 界面 | 侧栏/设置位置 | 作用 | 官方包名 |
|---|---|---|---|
| **插件 / Plugins** | 侧栏一级入口 | 安装、启停、配置、卸载组合包 | `@deepseek-ai/dsh-client-ui-plugin-manager` |
| **内置插件 / 插件列表** | 设置 → 内置插件 | **只读**的运行状态清单 | `@deepseek-ai/dsh-client-ui-settings-plugins`、`@deepseek-ai/dsh-host-plugin-inventory` |

官方面板自己的说明文案（来自 `lib/client.js` 的 `zh` 词典）已经说清了它是什么：

```
panel: "插件"
title: "插件"
intro: "安装、启用和配置插件"
infoDescription: "在这里配置官方插件，安装和管理其他插件。
                  内置插件列表及运行状态可在「设置 → 内置插件」中查看"
officialTitle: "官方"      // 安装随附、默认关闭的官方组合包
bundlesTitle:  "已安装"    // 你自己的 profile 持有的组合包
installTitle:  "添加插件"
installDescription: "输入插件的包名、GitHub 仓库地址或本地目录路径。"
```

**注意**：面板里的「官方」分组指的是**随 DSH 安装提供、默认关闭**的官方组合包（如 `dsh-experimental-schedule-bundle`、`dsh-experimental-voice-input-bundle`），不是你发布的东西的去处。第三方插件一律进「已安装」。

---

## 2. 官方分发机制：发布 = 发一个 npm 包

权威文档：官方仓库 [`docs/user/develop/basic/publish.zh.md`](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.zh.md)（"打包与安装插件"）。

### 2.1 核心概念

- **组合包（bundle）**：带一个配置层的 npm 包，`package.json` 声明 `dsh.bundle`。**这是你要写和分发的东西。**
- **profile**：`$DSH_HOME/profiles/<name>` 下的一份可启动组合，声明 `dsh.profile`。由 `dsh plugin` 自动维护，**作者不写**。

### 2.2 最小可安装组合包

```
dsh-hello-plugin/
├── package.json       # declares dsh.bundle
├── cordis.patch.yml   # the layer applied when a profile lists this bundle
└── index.js           # plugin modules the patch rows reference
```

```json
{
  "name": "dsh-hello-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "index.js",
  "files": ["index.js", "cordis.patch.yml"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

```yaml
# cordis.patch.yml —— 按包名引用，而不是相对路径
- insert:
    - id: hello
      name: dsh-hello-plugin
```

**没有 `dsh.bundle` 的包仍可安装，但只作为普通依赖**：`dsh plugin` 打印警告且不激活任何层。这是社区目录最常见的退稿原因——只声明 `dsh.client` 不足以安装。

### 2.3 三种分发方式

| 方式 | 命令 | 用户是否需授权构建 |
|---|---|---|
| **发 npm**（推荐） | `pnpm publish`，发布前构建好 `lib/` | 否 |
| **发 tarball** | `pnpm pack` → 用户 `dsh plugin add ./x-0.1.0.tgz` | 否 |
| **发 GitHub** | `dsh plugin add github:you/repo` | **是**，需 `prepare` 脚本 + `allowBuilds` 授权 |

GitHub 方式的两道坎（官方文档明确警告）：

- 作者必须提供自包含的 `prepare` 脚本（拉的是源码不是产物，TypeScript 包到手没有 `lib/`）。
- 用户必须在 profile 的 `pnpm-workspace.yaml` 里加：
  ```yaml
  allowBuilds:
    dsh-hello-plugin: true
  ```
  文档原话：请把这项授权视为**允许该包的代码在安装时于你的机器上执行**，且不在任何沙箱之内。

### 2.4 用户侧的三条安装路径（等价）

```sh
# 1) CLI
dsh plugin --profile <name> add <package|git|tarball|local-path>
dsh plugin --profile <name> remove <package>
# 2) Web 侧栏 → 插件 → 添加插件（输入框接受包名/Git 地址/压缩包/本地绝对路径）
# 3) Agent 工具：plugin_manager，action: install_bundle
```

`dsh plugin` 的实质是把参数**原样转发给 profile 目录里的 pnpm**（官方 CLI 帮助原文）：

```
Usage: dsh plugin [options] [args...]
manage a profile's plugins by forwarding the remaining arguments to pnpm in the
profile directory
Arguments:
  args              pnpm arguments, forwarded verbatim (add <pkg>, remove <pkg>,
                    why <pkg>, ...)
Options:
  --profile <name>  the profile whose plugins to manage (initialized on first use)
```

### 2.5 安装源与镜像

- 默认 `https://registry.npmjs.org/`；回退默认 `https://registry.npmmirror.com/`。
- 首次打开安装对话框时，Host 会并发 ping 两个源（各 1.5s 超时），选最先返回 2xx 的；结果缓存 5 分钟。
- 支持自定义 http(s) 注册表；选择的安装源只记在**当前浏览器**的 `localStorage`。
- 相关导出：`@deepseek-ai/dsh-plugin-manager/registry` 的 `OFFICIAL_NPM_REGISTRY`、`NPMMIRROR_REGISTRY`。
- 版本兼容：安装前会检查 DSH peer 版本，不兼容直接失败（错误码 `incompatible-version`），可通过 `compatibility.json` 豁免。

### 2.6 升级的现实

**面板当前没有版本选择器**（官方"已知限制"原文）：

> **没有版本选择器**——spec 按 pnpm 接受的写法输入；页面不列出注册表版本，也不提供升级。……profile 安装的插件通过卸载后重新安装来升级，随 DSH 提供的插件随 DSH 升级。

所以 README 里要明确写：升级 = `dsh plugin --profile <p> remove <pkg>` 再 `add <pkg>@latest`。

---

## 3. 官方收录：GitHub 话题 `dsh-plugin`

官方仓库 `deepseek-ai/deepseek-harness` 的 `README.zh.md`「社区与支持」一节**只给了这一条**：

> - 通过 [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) 提交反馈或 bug 报告。
> - **为你的插件仓库添加 [`dsh-plugin`](https://github.com/topics/dsh-plugin) 话题，便于被发现。**

这就是官方的全部"收录"动作：**没有表单，没有审核，没有官方目录页**。

旁证：

- 官方仓库自己的 topics 就包含 `dsh-plugin`：`['ai-agents', 'cordis', 'dsh', 'dsh-plugin']`，描述 "DeepSeek Harness: Everything is a Plugin."
- 话题 `dsh-plugin` 下已有 **18,564** 个仓库（GitHub Search API）。
- 官方 UI 的示例包名也是这个命名习惯：`dsh-plugin-whale-pet`（占位提示 `例如 dsh-plugin-whale-pet`）。

**命名约定**（官方 UI 引导文案原文）：

> 插件包名即 npm 包名（如 `dsh-xxx` 或 `@作者/插件名`），社区插件的 README 安装命令中 `dsh plugin add` 或 `pnpm add` 之后的部分。

### 官方文档入口

- 仓库：<https://github.com/deepseek-ai/deepseek-harness>
- 文档站：<https://deepseek-harness.github.io/deepseek-harness/>
- 插件开发教程：`docs/user/develop/`（`basic/` 含 `index`/`tool`/`config`/`**publish**`，`framework/` 含 `service`/`events`，`practice/`）
- 应用内权威作者指南：`cordis-plugin-development` 技能（`@deepseek-ai/dsh-agent-preset`），含 `references/host-plugin.md`、`ui-plugin.md`、`mcp-bundle.md`、`practices.md`、`user-actions.md`、`verification.md` 与两个模板

---

## 4. 第三方社区目录（均非官方）

这些是**社区自建**的目录/市场插件。装进 DSH 后会在侧栏或设置里出现"插件市场"字样——这正是"官方插件市场"说法的主要来源，但它们是第三方产物。

| 名称 | 分发形态 | 官网/仓库 | 收录方式 | 备注 |
|---|---|---|---|---|
| **awesome-dsh-plugin** | GitHub 清单（非插件） | `awesome-dsh-plugin/awesome-dsh-plugin`（18.3k★） | 提 PR 加 **一个** YAML：`data/plugins/<owner>__<repo>.yml` | 流程最清晰、要求最明确，见 §4.1 |
| **dsh-plugin.org / DSH Plugin Hub** | npm 包名 **`dsh-plugin`**（v1.6.x） | `dshplugin/dsh-plugin-hub`，站 <https://dsh-plugin.org> | 加 `dsh-plugin` topic 自动发现 + 官网 `/zh/submit` | README 自称收录 9,463 个；**自述与官方无隶属关系** |
| **dshmarket** | npm `dshmarket`（v1.66.x） | `dsh-market/dsh-market`，站 <https://dshmarket.com> | 见其官网 | 版本号迭代极快 |
| **dsh-plugin-marketplace** | npm `dsh-plugin-marketplace`（v0.4.x） | `Scorp1o117/dsh-plugin-marketplace` | 浏览 `github.com/topics/dsh-plugin` | 描述里就写明数据源是 GitHub topic |
| **@nanmicoder/dsh-plugin-market** | npm 作用域包（v0.2.0） | `NanmiCoder/dsh-plugin-market` | 见其仓库 | 自称 "Verified" |
| 其他 | `dsh-plugin-shop-catalog`、`awesome-dsh-plugin-feed`、`dsh-plugin-guide`、`dsh-find-plugin`、`dsh-plugin-mgr`、`dsh-plugin-studio`、`aiko-dsh-plugin-catalog` 等 | — | 各自 | npm 搜 `dsh-plugin` 有大量同类 |

其他清单类仓库（star 数取自调研当时）：`0xsline/awesome-deepseek-harness`(1.2k)、`bruc3van/awesome-dsh-plugin`(401)、`Dominic789654/awesome-deepseek-harness`(374)、`beancookie/awesome-dsh-plugin`(163)、`Alex-Yanggg/awesome-DSH-plugin`(101)、`kejixiaoliang/awesome-dsh-plugins`(48)。

### 4.1 awesome-dsh-plugin 的收录要求（代表性、且最严格）

一个 PR 只加一个文件 `data/plugins/<owner>__<repo>.yml`：

```yaml
url: https://github.com/owner/repo        # 必须与仓库完全一致
name: owner/repo                          # 列表中显示的链接文字
category: usage                           # 见分类表
description:
  en: One-line description ending with a period.
  zh: 一句话描述，以句号结尾。              # 可选，维护者会补
```

要求：

- `package.json` **必须声明 `dsh.bundle`**（官方原文警告：最常见的退稿原因是只声明了 `dsh.client`——那样无法安装）。
- 仓库有**真实可用的代码**，纯占位/纯 README 不收。
- 仓库**创建满 1 天**（CI 自动检查，过滤"PR 前几分钟才建仓库"）。
- 项目**活跃维护**；定期扫描并移除仓库消失/归档/长期停更的条目。
- 仓库加 `dsh-plugin` topic。
- **描述只说功能，不带营销词，且必须与代码核对属实**（"写 46 个工具、六大领域，就应该真有 46 个工具和六大领域"）——夸大是主要退稿原因。
- 分类选贴合实际的，不准时维护者直接改，不会因此打回。

可用分类：
`agi` `ui` `usage` `theme` `model` `identity` `session` `memory` `tools` `wsl` `browser` `vision` `voice` `docs` `skill` `workflow` `git` `notify` `dev` `security` `remote` `market` `fun`

**重要免责**：该清单 README 顶部明确写"收录不等于安全审查"。这条对**所有**社区目录都成立。

---

## 5. 上架元信息规范（决定你在面板/目录里长什么样）

来自官方应用内指南 `cordis-plugin-development/references/host-plugin.md` 的 "Display metadata and icon"。

面板卡片、组合包详情、组件行、设置里的插件清单，都会**在不激活插件的前提下**读取展示元信息。

### 5.1 标题与描述 → `locale/*.json`

```json
// locale/zh.json（en.json 同字段）
{ "meta": { "title": "Token 用量面板", "description": "在侧栏看今天花了多少钱。" } }
```

### 5.2 图标 → `package.json` 顶层 `icon`

```json
{
  "icon": "./icon.svg",
  "exports": {
    "./package.json": "./package.json",
    "./locale/*.json": "./locale/*.json"
  },
  "files": ["locale/*.json", "icon.svg"]
}
```

- `icon` 是**相对 manifest 目录**的路径；接受 SVG / PNG / JPEG / WebP，**≤ 256 KiB**。
- 拒绝：绝对路径、URL、目录外路径、指向目录外的符号链接。
- 缺失字段回退到 `package.json` 的 `name` / `description` 与面板默认插画；元信息格式错误会产生诊断但保留有效文本。

**注意 export 与 files 都要带上**，否则 UI 读不到 locale 与 manifest。

---

## 6. 本插件（dsh-token-meter-panel）现状与差距

当前 `package.json`：`version 0.6.4`，已具备 `dsh.bundle.patch` ✓、`dsh.client.platform: web` ✓、`repository` ✓、`license: MIT` ✓、`keywords` 含 `dsh-plugin` ✓、`exports` 含 `./package.json` ✓。

| 项 | 状态 | 影响 |
|---|---|---|
| `dsh.bundle.patch` 声明 | ✅ 已有 | 满足所有社区目录的硬性要求 |
| `locale/en.json` + `locale/zh.json` 的 `meta.title/description` | ❌ **缺失** | 面板与目录只能拿到 `package.json` 的 name/description 兜底，双语标题/描述显示不出来 |
| `exports` 中的 `./locale/*.json` | ❌ **缺失** | UI 即使有 locale 文件也读不到 |
| 顶层 `icon` | ❌ **缺失** | 面板显示默认插画，目录卡片无图 |
| `files` 内含 `src`、`docs` | ⚠️ 可接受 | 官方仓库内包要求"不发布 src"；第三方包非硬约束，但会显著增大安装体积 |
| `docs/listing.md` | ⚠️ 过期 | 仍写 "上架文案（0.1.0）"，正文"npm view ... 返回 0.1.0"，实际已是 0.6.4 |
| `dsh.client.immediately` | ➖ 可选 | 需要"无需交互即渲染"时再考虑 |
| peer 版本范围 | ⚠️ 需留意 | `dsh-settings`/`dsh-host-webserver` 写死 `<0.3.0-0`；DSH 升级后可能被 `incompatible-version` 拦下 |

### 6.1 建议的发布 checklist

1. **补齐展示元信息**：加 `locale/{en,zh}.json`（`meta.title`/`meta.description`）、顶层 `icon`、`exports` 里的 `./locale/*.json`、`files` 里对应的 glob。
2. **README 首屏**：一句话定位 + 截图 + 安装命令（`dsh plugin --profile <p> add dsh-token-meter-panel`）+ 升级说明（卸载重装）+ 与官方无隶属关系的声明。
3. **`npm publish`**（`publishConfig` 已是 public）→ `npm view dsh-token-meter-panel version` 校验。
4. **GitHub 仓库公开**，加 **`dsh-plugin`** topic，打 tag / 建 Release。
5. **干净 profile 验证**：
   ```sh
   dsh plugin --profile verify-token-meter add dsh-token-meter-panel
   dsh --profile verify-token-meter --dump-config   # 应看到 "# == dsh-token-meter-panel" 层
   ```
   再启一个 Web 确认面板卡片、图标、双语文案与深浅色主题。
6. **提交社区目录**：首选 `awesome-dsh-plugin` 一个 YAML 的 PR（描述要与代码核对属实）；其余目录按其官网/仓库流程；`dsh-plugin.org` 只需 topic 自动发现 + 表单。
7. **更新 `docs/listing.md`** 到当前版本，并把本文件作为"源与表单地址"的引用。

---

## 7. 风险提示

- **没有官方市场**，所以也没有"官方收录"这回事。任何自称"官方插件市场/插件中心"的，都是第三方插件在宣传；`DSH Plugin Hub` 自己的 README 就写着"本项目为独立社区项目，与 DeepSeek Harness 官方无隶属关系"。
- **"收录 ≠ 安全审查"**。官方 UI 也警告："请确认插件来源可信。插件在本机以你的权限运行，来源不明的插件可能损坏 DeepSeek Harness，或读取和泄露你的数据。"
- **反向同样成立**：第三方市场插件本身就是在你的宿主进程里运行的代码，且常带安装/卸载/构建授权能力。评估"要不要装某个市场插件"时，标准和评估被收录的插件一样。
- 收录**不是永久的**：停止维护、行为不良或存在明显缺陷会被移除。
