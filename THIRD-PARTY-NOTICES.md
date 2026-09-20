# Third-party notices / 第三方许可声明

本项目以 MIT 许可证发布（见 [LICENSE](LICENSE)）。它包含或改写了下列第三方代码；
**每个项目仍适用其自身的许可证，本文件不改变这些条款。**

This project is distributed under the MIT license (see [LICENSE](LICENSE)). It contains or
adapts the third-party code listed below. **Each project remains under its own license;
nothing in this file changes those terms.**

---

## 1. `@deepseek-ai/dsh-session-persistence-jsonl`（DeepSeek Harness）

| 项 | 值 |
|---|---|
| 上游项目 | DeepSeek Harness (DSH) |
| 上游仓库 | <https://github.com/deepseek-ai/deepseek-harness> |
| 涉及的包 | `@deepseek-ai/dsh-session-persistence-jsonl` |
| 使用位置 | 本仓库 `src/zstd.mjs` 的 `scanZstdFrames()` |
| 许可证 | MIT，`Copyright (c) 2026 DeepSeek` |

本项目的 `src/zstd.mjs` 中，Zstandard 多帧日志的**帧边界扫描逻辑**改写自该包的
`scanZstdFrames()` 实现（DSH 的 `session.*.jsonl.zstd` 是追加写入的多帧 zstd，
必须按帧边界切分后逐帧解压）。上游实现与本项目实现同构，其版权声明与许可声明
按 MIT 要求保留如下。

`src/zstd.mjs` in this project adapts the Zstandard multi-frame **frame-boundary scanning
logic** from that package's `scanZstdFrames()` implementation. The upstream copyright and
permission notice are retained below, as required by the MIT license.

### MIT License（上游）

```
MIT License

Copyright (c) 2026 DeepSeek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 2. 运行时依赖（不随本包分发）

下列包通过 `dependencies` / `peerDependencies` 在运行时由宿主提供，本项目**不再分发**其代码：

- `@deepseek-ai/schemastery`（MIT）— 设置项 schema
- `@deepseek-ai/cordis`、`@deepseek-ai/dsh-*`（均为 MIT，`Copyright (c) 2026 DeepSeek`）— DSH 内核服务

浏览器半侧产物 `lib/client.js` 中，`react` 等基座模块被标记为 external，由 DSH 客户端
模块系统在运行时提供，**未被打包进本项目的产物**。
