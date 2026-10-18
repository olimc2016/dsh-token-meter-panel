# 发版手册（dsh-token-meter-panel / dsh-token-mb）

## 0. 前置
- `npm run setup` 已跑（esbuild + `@deepseek-ai/*` 就绪），`npm run build` 成功
- `git status` 只有预期文件（不含私有笔记、截图）

## 1. 版本与记录
1. 改 `package.json` 版本（semver）
2. `CHANGELOG.md` 写「用户可感知的变化」+ 迁移提示
3. 版本与 CHANGELOG **同一次提交**：`chore: <版本>`

## 2. 自检
```bash
npm run build && npm test     # 必须全绿
git status                    # 产物与源码一致（无未提交差异）
```

## 3. 打包预检
```bash
npm pack --dry-run | tail -30 # 只应有 lib/ src/ cordis.patch.yml README* CHANGELOG LICENSE 等
```

## 4. 打 tag 并推
```bash
git tag -a vX.Y.Z -m "vX.Y.Z —— <一句话>"
git push origin main && git push origin vX.Y.Z
```
> tag 必须与 `package.json` 版本一致，且与 npm 产物同一 commit。

## 5. 发布到 npm
**首选 OIDC（无 token）**：
```bash
gh workflow run publish.yml --ref main
```
需先在 npm 为 `dsh-token-mb` 绑定 Trusted Publisher：
GitHub Actions / `olimc2016` / `dsh-token-meter-panel` / `publish.yml` / Environment 留空。

**应急（token，仅在无 OIDC 时）**：
```bash
TMP=$(mktemp -d); printf '//registry.npmjs.org/:_authToken=%s\n' "$TOKEN" > "$TMP/.npmrc"; chmod 600 "$TMP/.npmrc"
node tools/make-twin.mjs
(cd dist/dsh-token-mb && NPM_CONFIG_USERCONFIG="$TMP/.npmrc" pnpm publish \
   --access public --no-git-checks --ignore-scripts --registry=https://registry.npmjs.org/)
rm -rf "$TMP"     # 用完立即删除；并到 npm 撤销该 token
```

## 6. 发布后核验
```bash
curl -s https://registry.npmjs.org/dsh-token-mb | jq '.dist-tags'
# 再下载 tarball 看文件清单，确认含 lib/index.js、lib/client.js、cordis.patch.yml
```

## 7. 归档（私有目录，不入库）
`~/Documents/dsh-evidence/dsh-token-mb/<version>/`：真机截图 + 对账结果 + 本次踩坑。

## 8. 回滚
- npm 版本不可撤销 → 发补丁版；
- 严重缺陷：`npm deprecate dsh-token-mb@<ver> "原因 + 替代版本"`。
