---
name: docgrad
description: Use when the user wants to audit, score, grade, improve, or converge a repository's documentation system as an AI-agent context source — five-dimension star rating (completeness, correctness, freshness, linkage, consistency) plus token-economy reporting, with an improvement loop that fixes docs until target ratings are met. Covers docs quality audit, documentation health check, dead-link/orphan/staleness checks, doc convergence. 中文關鍵字：文件評分、文件健檢、文件收斂、docs 評比、文件品質、死鏈檢查、文件過期。Not for prose style linting, SKILL.md auditing, or code review.
version: 0.1.0
user-invocable: true
argument-hint: "[init · audit · improve · loop · report]"
license: MIT. See NOTICE.md for attribution.
---

> **Last updated:** 2026-07-12

評估並收斂一個 repo 的文件體系（docs 目錄＋root 指引檔）作為 **AI agent context 來源**的品質：
五維計星＋token 經濟報告；`loop` 逐輪修到達標。不評 prose 風格、不評 code、不碰 CI。

`SKILL_DIR`＝本檔所在目錄（scripts 與 reference 的相對根）。

## Routing

| 使用者輸入 | 動作 |
|---|---|
| `/docgrad`（無參數） | 印出本表說明各指令，不做任何事 |
| `init` | 讀 [reference/init.md](reference/init.md) 照做 |
| `audit` | 先讀 [reference/rubric.md](reference/rubric.md)，再照 [reference/audit.md](reference/audit.md) 跑（純報告，不改檔） |
| `improve` | 先讀 rubric.md，再照 [reference/improve.md](reference/improve.md) 跑一輪 |
| `loop` | 同 improve，反覆到停止條件 |
| `report` | 讀目標 repo `.docgrad/scorecard-latest.md` 重印＋用 `.docgrad/history.jsonl` 畫歷輪分數走勢表；檔案不存在 → 提示先跑 improve/loop（audit 純報告不落檔） |

## Blockers（不可跳過）

1. 目標 repo 無 `.docgrad.yml` → 除 `init` 外一律先導向 `/docgrad init`。
2. 評分（audit/improve/loop）前必讀 reference/rubric.md；星等錨點不可自創、不可放寬。
3. improve/loop 只在 `docgrad/converge` branch commit；絕不修改目標 repo 的 CI 設定。

## Scripts

三支零依賴 Node（≥18）腳本，讀目標 repo 的 `.docgrad.yml`，JSON → stdout（完整消費，
不要 head/grep 截斷），錯誤 → stderr＋非零 exit：

```bash
node "$SKILL_DIR/scripts/inventory.mjs" --root .   # 清單/token/固定成本/污染面
node "$SKILL_DIR/scripts/links.mjs" --root .       # 死鏈/壞錨/孤兒/可達率
node "$SKILL_DIR/scripts/freshness.mjs" --root .   # 日期訊號覆蓋/git 對照
```
