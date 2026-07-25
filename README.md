# docgrad

> **Last updated:** 2026-07-26

評估並收斂一個 repo 的文件體系（docs 目錄＋root 指引檔）作為 **AI agent context 來源**的品質。
五維計星（完整性/正確性/新鮮度/連結度/一致性）＋token 經濟報告；`loop` 逐輪修 docs 直到達標。

## 快速上手：從安裝到畢業

一個 repo 的完整生命週期跑一次就懂——以下五步從零帶到「畢業」（全維達標、規則沉澱成 CI）。

### 0. 安裝（一次）

**方式 A —— plugin（建議，有版本更新通知）：**

```
/plugin marketplace add redtear1115/docgrad
/plugin install docgrad@docgrad
```

之後 `/plugin` 的 Marketplaces 頁會顯示可更新版本（也可對此 marketplace 開啟自動更新）；
版本號與變更內容見 [CHANGELOG.md](CHANGELOG.md)。

**方式 B —— git clone（手動更新）：**

```bash
git clone https://github.com/redtear1115/docgrad ~/.claude/skills/docgrad
```

更新＝到該目錄 `git pull`；是否有新版自己對 [CHANGELOG.md](CHANGELOG.md)。

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

只想看一塊、或只關心一維時可以限定範圍：

```
/docgrad audit docs/infra/          # 也吃「infra 相關文件」這種主題描述
/docgrad audit --dim freshness      # 只評新鮮度
```

scoped 報告一律**不寫入 `.docgrad/`**——歷輪走勢只認全量 audit，混進 scoped 分數就失去可比性。
範圍縮小時可達率／孤兒與固定成本會標成「不適用」（那是全量概念），規則見 [reference/audit.md](reference/audit.md) §scoped audit。

### 3. `improve` / `loop` — 逐輪收斂

```
/docgrad loop      # 反覆修到達標；想一輪一輪來就用 improve
```

每輪挑**最低分維度**、只修那一維（收斂不是重寫），重評確認該維上升、其他維不降，然後 commit。所有變更落在 `docgrad/converge` branch，每輪一個 commit——中斷可續、可回退、可整批 review 後再合併。

`loop` 跑到三種停止條件之一（權威定義見 [reference/improve.md](reference/improve.md)）：

- ✅ **達標**：全維 ≥ 你在 `.docgrad.yml` 設的 targets（預設 ★4），或已判設計性天花板。
- ⏸ **plateau**：連兩輪零進步，報告卡在哪一維、為何 skill 修不動。
- ⏸ **需人裁決**：遇到 code 無法仲裁的矛盾或產品決策，列出選項暫停等你。

**設計性天花板**＝某維再上一星必須做 docgrad 禁區的事（目前只有新鮮度 ★5 需要 CI gate），該維直接標
「已收斂到上限」移出工作集，不會被誤報成 plateau 讓你以為多跑幾輪還有救。

過程中隨時可 `/docgrad report` 重印最近 scorecard＋歷輪走勢。

### 4. 畢業 — 達標後把規則沉澱成 CI

全維達標時，收官報告會附上**畢業建議**：把可機械化的檢查（死鏈／孤兒／新鮮度／入口檔 token 預算）搬進這個 repo 自己的 docs-gate CI，讓文件品質往後由 CI 自動守住。docgrad 的四支 scripts（inventory／links／freshness／coverage）可直接搬去改造。

docgrad 只評分與修內容，**不代寫、不碰目標 repo 的 CI**——gate 要多嚴由團隊自己定。跑完這步，這個 repo 就從 docgrad「畢業」了。

## 指令速查

| 指令 | 作用 |
|---|---|
| `/docgrad init` | 掃描＋問卷 → 寫 `.docgrad.yml` 進目標 repo（一次性） |
| `/docgrad audit` | 單次全量評分，產出 scorecard（不改檔） |
| `/docgrad audit <範圍>`／`--dim <維度>` | 限定目錄／主題或單一維度的 scoped 報告（不改檔、不落檔） |
| `/docgrad improve` | 跑一輪收斂：挑最低分維度 → 修 → 重評 → commit |
| `/docgrad loop` | 反覆 improve 直到全維達標／plateau／需人裁決 |
| `/docgrad report` | 重印最近 scorecard＋歷輪分數走勢 |

路由與 blockers 的權威定義在 [SKILL.md](SKILL.md)，本表僅摘要。

## 適用邊界

docgrad 評的是**本地 markdown 檔案樹**：四支腳本都以本地路徑運作，設定檔 `.docgrad.yml` 也要能寫進目標 repo 根目錄。

- **git 不是硬需求**：沒有 git 時新鮮度只認文件自稱的日期、覆蓋漂移無法量測，其餘照跑。
- **wiki／Confluence 等遠端文件源不支援**：檔案不在樹上、設定檔無處可放，整套流程用不上。真要評這類文件源，
  可只借用 [reference/rubric.md](reference/rubric.md) 的五維錨點做人工評分——無機械訊號、不可重現，也不落 scorecard。
- **新鮮度 ★5 屬畢業後範圍**：★5 要求 CI gate 強制，而 docgrad 不碰 CI ——`loop` 內該維上限 ★4
  （預設 target 就是 ★4，不受影響；只有把 target 調到 5 才會遇到）。

不評 prose 風格（Vale 的事）、不評 SKILL.md 本身（agnix 的事）、不評程式碼（code review 的事）——
完整定位見 [docs/design.md](docs/design.md)。

## 開發

```bash
node --test tests/*.test.mjs
```

設計文件：[docs/design.md](docs/design.md)；常見開發任務：[docs/how-to.md](docs/how-to.md)。
