# docgrad

> **Last updated:** 2026-07-12

評估並收斂一個 repo 的文件體系（docs 目錄＋root 指引檔）作為 **AI agent context 來源**的品質。
五維計星（完整性/正確性/新鮮度/連結度/一致性）＋token 經濟報告；`loop` 逐輪修 docs 直到達標。

## 安裝

```bash
git clone <repo-url> ~/.claude/skills/docgrad
```

需求：Claude Code、Node.js ≥18（三支量測腳本零依賴）。

## 使用

| 指令 | 作用 |
|---|---|
| `/docgrad init` | 掃描＋問卷 → 寫 `.docgrad.yml` 進目標 repo（一次性） |
| `/docgrad audit` | 單次全量評分，產出 scorecard（不改檔） |
| `/docgrad improve` | 跑一輪收斂：挑最低分維度 → 修 → 重評 → commit |
| `/docgrad loop` | 反覆 improve 直到全維達標／plateau／需人裁決 |
| `/docgrad report` | 重印最近 scorecard＋歷輪分數走勢 |

第一次先在目標 repo 跑 `/docgrad init`；`improve`/`loop` 的變更都 commit 在
`docgrad/converge` branch，整批 review 後再合併。

## 開發

```bash
node --test tests/*.test.mjs
```

設計文件：[docs/design.md](docs/design.md)。
