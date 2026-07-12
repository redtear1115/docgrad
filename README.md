# docgrad

> **Last updated:** 2026-07-13

評估並收斂一個 repo 的文件體系（docs 目錄＋root 指引檔）作為 **AI agent context 來源**的品質。
五維計星（完整性/正確性/新鮮度/連結度/一致性）＋token 經濟報告；`loop` 逐輪修 docs 直到達標。

## 快速上手：從安裝到畢業

一個 repo 的完整生命週期跑一次就懂——以下五步從零帶到「畢業」（全維達標、規則沉澱成 CI）。

### 0. 安裝（一次）

```bash
git clone <repo-url> ~/.claude/skills/docgrad
```

需求：Claude Code、Node.js ≥18（四支量測腳本零依賴）。裝好後在任一 repo 以 `/docgrad` 呼叫。

### 1. `init` — 設定目標 repo（一次）

在要評分的 repo 根目錄跑：

```
/docgrad init
```

docgrad 掃描候選結構（docs 目錄、always-loaded 入口檔、索引檔、應排除目錄），用問卷逐項跟你確認，寫出 `.docgrad.yml`（進版控、團隊共用）。這是唯一一次手動設定；之後每個指令都讀它。沒有 `.docgrad.yml` 時，其他指令一律先擋下來導回這步。

### 2. `audit` — 看基線（不改檔）

```
/docgrad audit
```

跑一次全量評分，產出 scorecard：五維各打 ★1–★5、標出主要失分點，附 token 經濟報告。純報告、不動任何檔案——先知道「現在幾分、差在哪」，再決定要不要收斂。

### 3. `improve` / `loop` — 逐輪收斂

```
/docgrad loop      # 反覆修到達標；想一輪一輪來就用 improve
```

每輪挑**最低分維度**、只修那一維（收斂不是重寫），重評確認該維上升、其他維不降，然後 commit。所有變更落在 `docgrad/converge` branch，每輪一個 commit——中斷可續、可回退、可整批 review 後再合併。

`loop` 跑到三種停止條件之一（權威定義見 [reference/improve.md](reference/improve.md)）：

- ✅ **達標**：全維 ≥ 你在 `.docgrad.yml` 設的 targets（預設 ★4）。
- ⏸ **plateau**：連兩輪零進步，報告卡在哪一維、為何 skill 修不動。
- ⏸ **需人裁決**：遇到 code 無法仲裁的矛盾或產品決策，列出選項暫停等你。

過程中隨時可 `/docgrad report` 重印最近 scorecard＋歷輪走勢。

### 4. 畢業 — 達標後把規則沉澱成 CI

全維達標時，收官報告會附上**畢業建議**：把可機械化的檢查（死鏈／孤兒／新鮮度／入口檔 token 預算）搬進這個 repo 自己的 docs-gate CI，讓文件品質往後由 CI 自動守住。docgrad 的四支 scripts（inventory／links／freshness／coverage）可直接搬去改造。

docgrad 只評分與修內容，**不代寫、不碰目標 repo 的 CI**——gate 要多嚴由團隊自己定。跑完這步，這個 repo 就從 docgrad「畢業」了。

## 指令速查

| 指令 | 作用 |
|---|---|
| `/docgrad init` | 掃描＋問卷 → 寫 `.docgrad.yml` 進目標 repo（一次性） |
| `/docgrad audit` | 單次全量評分，產出 scorecard（不改檔） |
| `/docgrad improve` | 跑一輪收斂：挑最低分維度 → 修 → 重評 → commit |
| `/docgrad loop` | 反覆 improve 直到全維達標／plateau／需人裁決 |
| `/docgrad report` | 重印最近 scorecard＋歷輪分數走勢 |

路由與 blockers 的權威定義在 [SKILL.md](SKILL.md)，本表僅摘要。

## 開發

```bash
node --test tests/*.test.mjs
```

設計文件：[docs/design.md](docs/design.md)；常見開發任務：[docs/how-to.md](docs/how-to.md)。
