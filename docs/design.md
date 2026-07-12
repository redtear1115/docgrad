# docgrad — 專案文件綜合評估與收斂 skill 設計

> **狀態**：已實作（2026-07-12 定案並完成 v0.1.0，實作計畫見 [docs/superpowers/plans/2026-07-12-docgrad-implementation.md](superpowers/plans/2026-07-12-docgrad-implementation.md)）
> **Last updated:** 2026-07-12

## 緣起

2026-07-10～07-11 對 store_center 與 kdan-workforce 兩個文件系統做了多輪「agentic development 視角」評比（完整性／正確性／新鮮度／連結度／一致性／token 經濟性），並在 kdan-workforce 實際走完「評分 → 改進建議 → #207 重組 → 重跑評分反超」的完整迴圈。本 skill 把那套實戰方法論沉澱成**通用、可安裝、可迭代**的工具：裝完之後對任一 repo 跑 `init` 指定文件夾與基本規則，然後 `loop` 逐輪修改 docs，直到各項指標達到目標星等（預設 4，可個別降到 3）。

生態系調研（2026-07-12）確認無現成 skill 覆蓋此事：最接近的 `ln-21-documentation-auditor`（levnikolaevich/claude-code-skills，515★）在正確性 claim-ledger 與 git-blame 新鮮度上紮實但不碰 token 經濟與檢索紀律；`agnix`（432 條規則）只 lint CLAUDE.md/AGENTS.md 等 config 檔不評 docs 全體系。空白區＝**全 docs 體系的 token 經濟性、索引/檢索紀律、prose 規則降級成機械 gate**——正是本 skill 的差異化價值。

## 定位與邊界

- **評什麼**：一個 repo 的文件體系（docs 目錄＋root 指引檔）作為 **AI agent 開發時的 context 來源**的品質。
- **不評什麼**：prose 風格（Vale 的事）、SKILL.md 本身品質（agnix/skill-audit 的事）、程式碼品質（code review 的事）。
- **通用性**：零 repo 假設。結構（文件夾、索引、入口檔、新鮮度慣例）全部由 `init` 偵測＋問卷確認後寫入設定檔，之後每輪讀設定檔。
- **使用者決策（2026-07-12 定案）**：獨立 git repo 發布（本 repo）；impeccable 式「init 一次、之後逐步收斂」；五維計星＋token 經濟只報告不計星；loop 每輪 commit、達標才停；評分＝內建機械腳本＋LLM 判斷混合。

## Repo 結構（impeccable 同款骨架）

```
docgrad/
├── SKILL.md              # 路由：init · audit · improve · loop · report
├── reference/
│   ├── init.md           # 掃描＋問卷 → 寫入目標 repo 的 .docgrad.yml
│   ├── rubric.md         # 五維星等錨點（評分穩定性的關鍵，見下）
│   ├── audit.md          # 單次評分流程：腳本 → LLM 抽查 → scorecard
│   └── improve.md        # 收斂輪流程（improve 與 loop 共用）
├── scripts/
│   ├── lib.mjs           # 共用模組：YAML 子集解析/config/walker/token/markdown 解析
│   ├── inventory.mjs     # 文件清單＋CJK-aware token 量測＋成本試算輸入
│   ├── links.mjs         # 死鏈/anchor/孤兒（從索引＋entry 檔 transitive 可達性）
│   └── freshness.mjs     # 日期訊號覆蓋率＋git log 真實日期對照
├── tests/                # node --test；fixtures/basic/ 迷你目標 repo
├── docs/
│   ├── design.md         # 本檔
│   ├── how-to.md         # 常見開發任務（加維度/改 rubric/擴充 lib）
│   └── superpowers/      # 歷史實作 plan（.docgrad.yml 列 exclude）
├── .docgrad.yml          # 本 repo 自己的 docgrad 設定（dogfood）
├── NOTICE.md             # 出處致謝（ln-21 claim-ledger、Diátaxis、HumanLayer、impeccable）
├── LICENSE               # MIT
└── README.md             # 安裝方式（clone 到 ~/.claude/skills/docgrad）
```

skill 名稱＝目錄名＝`docgrad`（安裝進 `~/.claude/skills/docgrad` 或 plugin marketplace 後以 `/docgrad` 呼叫）。SKILL.md frontmatter description 以英文為主＋中文關鍵字（觸發匹配雙語皆可），本文與 reference 用 zh-TW（主要受眾為中文團隊；日後要國際發布再譯）。

## 指令面

| 指令 | 說明 |
|---|---|
| `/docgrad init` | 一次性設定：掃描候選結構 → 問卷確認 → 寫 `.docgrad.yml` 進目標 repo 版控 |
| `/docgrad audit` | 單次全量評分，產出 scorecard 報告（不改任何檔案） |
| `/docgrad improve` | 跑一輪收斂（挑最低維 → 修 → 重評 → commit），跑完停 |
| `/docgrad loop` | 反覆 improve 直到停止條件（見下） |
| `/docgrad report` | 只重印最近一次 scorecard＋歷輪分數走勢 |

無參數時印指令表（同 impeccable 的 routing rule 1）。

## `init` 與 `.docgrad.yml`

`init` 自動掃描：docs 目錄候選（`docs/`、`doc/`、`documentation/`）、always-loaded 入口檔（`CLAUDE.md`、`AGENTS.md`、`.cursorrules`…）、索引檔候選（`docs/README.md`、`docs/index.md`）、應排除目錄（`archive/`、`node_modules/`、generated、gitignored WIP）。掃描結果以問卷逐項確認，含目標星等。寫入：

```yaml
# .docgrad.yml — docgrad 設定（進版控，團隊共用）
docs_dirs: [docs/]
entry_files: [CLAUDE.md]          # always-loaded，計入固定成本
index_file: docs/README.md        # 孤兒判定的可達性根
exclude: [docs/archive/]          # 不計分但列入污染面報告
freshness:
  convention: frontmatter          # frontmatter | heading-line | none
  field: last_updated              # 或 "Last updated:" 行的 pattern
targets:                           # 各維目標星等（loop 停止條件）
  completeness: 4
  correctness: 4
  freshness: 4
  linkage: 4
  consistency: 4
correctness_sample: 8              # 每次 audit 抽查的宣稱條數
scenario: "在 <某模組> 加一個典型新功能"  # token 經濟模擬用的代表性任務
language: zh-TW                    # 報告與 commit 語言
```

repo 沒有 `.docgrad.yml` 時，`audit`/`improve`/`loop` 一律先導向 `init`（同 impeccable「PRODUCT.md 缺失就先 teach」的 blocker 模式）。

## 五維 rubric（錨點住 reference/rubric.md）

分數要能跨輪比較，錨點必須寫死。各維 ★1–★5 錨點自實戰評比沉澱，摘要：

| 維度 | ★3（及格）錨點 | ★5 錨點 | 量測方式 |
|---|---|---|---|
| **完整性** | 核心領域皆有權威文件；部署/測試至少內嵌敘述 | 領域全覆蓋＋runbook＋onboarding 路徑＋退役機制明確標註「勿用於新功能」 | 腳本盤點＋LLM 對照 repo 實際模組清單找缺口 |
| **正確性** | 抽查通過 ≥80%；錯的是細節非機制 | 抽查全過＋殭屍代碼/已退役機制有標註＋權威列表 refer-to-code 不複述 | claim ledger：抽 N 條具體宣稱（路徑/符號/狀態機/路由）逐條對 code 驗證 |
| **新鮮度** | 有日期訊號慣例但靠自律；關鍵文件 staleness ≤60 天 | 日期訊號全覆蓋＋「同 MR 隨改隨更」有機械 gate 強制＋生命週期管理（superseded 即處理） | freshness.mjs：訊號覆蓋率＋git log 真實日期 vs 宣稱日期 |
| **連結度** | 相對連結失效 ≤2%；有索引但非唯一入口 | 全量驗證零死鏈＋單一頂層索引 transitive 全可達（零孤兒）＋錨點用 `path › symbol()` 抗行號漂移 | links.mjs 全量機械驗證 |
| **一致性** | 同主題重疊 ≤2 處且不矛盾 | 一主題一權威（其餘摘要＋連結）＋衝突有仲裁慣例（newer wins＋以 code 仲裁） | LLM：挑關鍵事實宣稱做跨文件＋對 code 三角驗證 |

**Token 經濟（只報告，不計星）**：①固定成本＝entry_files token 量②邊際成本＝按 `scenario` 沿路由規則模擬必讀路徑的 token 合計③污染面＝exclude 目錄與 WIP 佔語料比例。CJK-aware 估算（中文 token/byte 密度與英文不同，inventory.mjs 內建係數）。報告附「損益兩平」解讀（固定 vs 邊際的任務組成權衡）。

## `loop` 機制（核心需求：裝完就能一直跑到達標）

每輪（＝`improve` 一次）：

1. 跑三支腳本＋LLM 判斷維度 → scorecard。
2. 挑**最低分維度**（同分取 rubric 表順序靠前者），從該維的失分點生成一批 focused 修改（一輪只修一個維度，避免全量改一半留矛盾——收斂不是重寫）。
3. 機械修正（死鏈、日期 backfill 用 `git log -1 --format=%as` 真實日期不捏造、孤兒補入索引）直接做；語意修改（合併冗餘文件、改寫敘述為 refer-to-code、刪檔）也做，但在 commit message 明示清單。
4. 重跑量測確認該維分數上升、其他維不降。
5. 在專用 branch（`docgrad/converge`）commit，message 附本輪 scorecard 摘要。

**停止條件**（任一成立即停）：
- ✅ 全維 ≥ `.docgrad.yml` targets → 收官報告＋畢業建議。
- ⏸ 連續兩輪任何維度分數皆無進步 → plateau 報告（說明卡在哪、為何 skill 修不動）。
- ⏸ 遇到需要人裁決的語意矛盾（兩份文件互斥且 code 無法仲裁、或修正涉及產品決策）→ 列出仲裁選項後暫停。

branch 隔離讓用戶可整批 review 再合併；每輪 commit 保證中斷可續、可回退。

## 畢業建議（報告固定尾節，不自動執行）

達標後建議把可機械化的規則沉澱成該 repo 自己的 CI gate（死鏈/孤兒/新鮮度/入口檔預算——kdan-workforce `scripts/docs-gate.mjs` 模式），並說明 docgrad 的三支 scripts 可直接搬去改造。docgrad 只評分與修內容，**不碰目標 repo 的 CI 設定**。

## scripts 契約

三支皆為零依賴 Node（≥18）腳本，讀 `.docgrad.yml`，輸出 JSON 到 stdout（LLM 消費），錯誤走 stderr＋非零 exit code：

- `inventory.mjs` → `{files: [{path, bytes, tokens_est, type}], totals, entry_cost, pollution: {excluded_tokens, ratio}}`
- `links.mjs` → `{dead_links: [], bad_anchors: [], orphans: [], reachable_ratio}`（可達性從 `index_file`＋`entry_files` 起算 transitive——entry 檔 always-loaded，定義上可達）
- `freshness.mjs` → `{coverage_ratio, stale: [{path, claimed, actual_git, age_days}], mismatches}`

## 開放問題（實作時定案）

- anchor slug 演算法對 CJK 標題的近似誤差（workforce 實戰為 WARN＋人工確認，沿用）。
- `correctness_sample` 的抽樣策略：純隨機 vs 加權（優先抽「宣稱具體符號/路徑」的段落）——傾向後者。

## 出處致謝（NOTICE.md 詳列）

claim-ledger 正確性抽查借鑑 ln-21-documentation-auditor；文件類型學參照 Diátaxis；entry-file token 經濟觀點參照 HumanLayer〈Writing a Good CLAUDE.md〉；星等評比六維與 loop 方法論來自 2026-07-10/11 store_center × kdan-workforce 實戰評比。
