## 这个 PR 做了什么

<!-- 一句话说明改动；关联 issue 用 "Closes #123" -->

## 变更类型

- [ ] 修复 bug
- [ ] 新功能
- [ ] 新增 / 调整内置模板
- [ ] 文档 / 构建 / 测试
- [ ] 重构（不改变行为）

## 验证结果（必填，请粘实际输出，不要只写「已测试」）

```
$ node build/build.mjs
...
$ node tools/check.mjs
...
$ node tests/smoke.mjs
...
```

- [ ] `node build/build.mjs` 已跑（改过 `src/client/` 或 `src/shared/doc.js` 时，`lib/client.js`
      和 `lib/client.meta.json` 已重新生成并一起提交）
- [ ] `node tools/check.mjs` 通过
- [ ] 相关测试通过：`tests/smoke.mjs` / `tests/pdf.mjs` / `tests/render.mjs` / `tests/mount.mjs` /
      `server/smoke.mjs`（按改动范围选择，渲染相关必跑）
- [ ] 行为变化已更新 `CHANGELOG.md`
- [ ] 没有提交 `node_modules/`、`.devrender/node_modules/`、`.devrender/.npmcache/`、日志或临时文件

## 截图（UI / 模板改动请附）

<!-- 面板截图，或 previews/ 里的模板预览截图 -->

## 其他说明 / 破坏性变更

<!-- 需要特别注意的兼容性问题、迁移步骤等；没有就写「无」 -->

## 检查清单

- [ ] PR 只做一件事，描述与代码一致
- [ ] 涉及用户隐私 / API Key 的地方没有硬编码
- [ ] 新模板的 CSS 根选择器是 `.rm-t-*`（并在市场模板里显式带了 `cls`）
