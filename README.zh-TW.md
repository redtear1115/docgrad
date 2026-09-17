# docgrad

[English](README.md) | **繁體中文**

[![release](https://img.shields.io/github/v/release/redtear1115/docgrad?filter=docgrad--*)](https://github.com/redtear1115/docgrad/releases/latest) [![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> **Last updated:** 2026-09-17

> 你的文件現在是 agent 在讀，而 agent 載入的每一份檔案都有價錢。docgrad 把一個 repo 的文件當成
> **AI agent 的 context 來源**，再逐輪修到你設定的目標為止。

**[從 1.x 升級？](UPGRADING.md)**——2.0 是 breaking release，往下讀之前先看 UPGRADING.md 的指令、設定、輸出變更。

一個 Claude Code skill，分**兩層**：

- **`measure`**——四支零依賴 Node 腳本產生可重現的 `OK`/`WATCH`/`FAIL` 訊號（死鏈、孤兒、新鮮度、入口檔
  token 成本）。同一棵樹、同一份設定，在任何機器上都是同一組數字。這是 `loop` 收斂的對象，也是 CI gate
  能強制的東西——見 [measure.md §Targets](skills/docgrad/reference/measure.md#targets)。
- **`judge`**——LLM 對完整性、正確性、一致性三維打 ★1–★5，依據凍結的 rubric。**★ 評分不可重現、跨輪不可比，
  也絕不進 CI 或 loop 的門檻**——它是模型對三個腳本查不出來的事情的判讀，給人參考，不是量測。原因（附實測）見
  [judge.md §Known instability](skills/docgrad/reference/judge.md#known-instability)。

`loop` 何時停止只在一處定義：
[improve.md §Stop conditions](skills/docgrad/reference/improve.md#stop-conditions-loop-any-one-of-them-ends-it)。

## 為什麼要有一個獨立的「成本」訊號

多數文件檢查工具只往一個方向最佳化：覆蓋更多、死鏈更少、文筆更好。套到 agent 的 context 來源上，
這個方向是要付帳的。入口檔（`CLAUDE.md`、`AGENTS.md`）**每一次**任務都會載入，不管這次任務用不用得到；
而外部對照（多個 coding agent 在 SWE-Bench Lite 與 AgentBench 上）指出 context 檔變長會提高成本，
卻未必提高成功率。

所以經濟性訊號是**刻意**與完整性反向的，loop 因此有一道機械煞車。分成兩張表，因為運作方式不同——
一個是量測的，一個是判定的：

**Measure 訊號**（可重現的 `OK`/`WATCH`/`FAIL`；逐行定義見
[measure.md §Verdict lines](skills/docgrad/reference/measure.md#verdict-lines)）：

| 訊號 | 檢查什麼 | 腳本 |
|---|---|---|
| 新鮮度 | 日期訊號存在嗎、誠實嗎？ | `freshness.mjs`——訊號覆蓋、staleness、git 對照 |
| 連結度 | 單一索引走得到全部嗎？ | `links.mjs`——死鏈、壞錨、孤兒、可達率 |
| 覆蓋漂移 | code 領域和其文件有沒有脫節？ | `coverage.mjs`——未文件化與漂移區域 |
| 經濟性 | agent 每次任務付多少？ | `inventory.mjs`——入口檔 token（`entry_cost`）、污染面（`pollution`） |

**Judge 維度**（★1–★5，只有 `judge` 才有，不可重現——見上方的兩層說明）：

| 維度 | 評什麼 | 方法 |
|---|---|---|
| **完整性** | 核心領域到底有沒有文件？ | `coverage.mjs` 漂移資料，加 LLM 對照 repo 實際模組清單 |
| **正確性** | 文件的宣稱還符合 code 嗎？ | claim ledger——腳本決定抽樣，逐條對原始碼驗證 |
| **一致性** | 一主題一權威，docs 與 code 註解一起看 | LLM 跨文件比對，並以 code 三角驗證 |

有三件事讓這組張力不會變成拉鋸：經濟性排在 tie-break 順序最後、`entry_files` 以外的文件不計入固定成本
（所以把內容**搬出**入口檔可以同時滿足兩個訊號），以及每輪的修改要留要退，都由
[improve.md](skills/docgrad/reference/improve.md) 第 4 步決定——它檢查的是每一個 `measure` 項，不只被挑中的那一項。

## 裝了它要付多少

一個評 context 成本的工具，該先公布自己的成本。以下取自 `claude plugin details docgrad`：

```
Always-on:   ~227 tok   每個 session 都加
On-invoke:   ~1.8k tok  每次 skill 觸發時付
```

五支量測腳本是純 Node、零依賴，在模型之外執行。

## 從安裝到畢業

### 0. 安裝（一次）

```bash
claude plugin marketplace add redtear1115/docgrad
claude plugin install docgrad@docgrad --scope user
```

重開 Claude Code，然後跑 `/docgrad`——它會印出路由表，不做任何事。
需求：Claude Code 與 Node.js ≥18。完整的安裝／更新／移除路徑見[下方](#安裝更新移除)。

### 1. `/docgrad init` —— 設定目標 repo（一次）

在要評分的 repo 跑。docgrad 掃描候選結構（docs 目錄、always-loaded 入口檔、索引檔、應排除目錄），
用問卷逐項跟你確認，寫出 `.docgrad.yml`——進版控、團隊共用。這是唯一一次手動設定；
之後每個指令都讀它，沒有它就一律擋下來。

### 2. `/docgrad measure` —— 看基線（不改檔）

跑一次全量四支腳本：數字在前，`OK`/`WATCH`/`FAIL` 評等在旁，附 token 經濟報告。純報告，不動任何檔案。
想要 ★ 評分時另外加 `/docgrad judge`（或在 `improve`/`loop` 上加 `--judge`）——分開一步，因為是不同種輸出。

```
/docgrad measure docs/infra/      # 也吃「infra 相關文件」這種主題描述
/docgrad judge --dim consistency  # 只評一個 judge 維度
```

scoped 報告一律**不寫入 `.docgrad/`**——歷輪走勢只認全量報告，混進 scoped 分數就失去可比性。

### 3. `/docgrad improve` / `/docgrad loop` —— 逐輪收斂

```
/docgrad loop     # 反覆修到達標；想一輪一輪來就用 improve
```

每輪依 [improve.md 第 2 步](skills/docgrad/reference/improve.md#steps-in-each-round)的順序挑**一個未達標的 `measure` 項**、只修那一項（例外見第 2 步）（收斂不是重寫），重新量測，依
[improve.md 第 4 步](skills/docgrad/reference/improve.md)決定保留或退回，然後 commit。所有變更落在 `docgrad/converge` branch，每輪一個 commit——中斷可續、可回退、可整批
review 後再合併。`loop` 絕不會為了 `judge` 的星等去修——見上方的兩層說明。

分數、claim ledger 與最近一份 scorecard 放在 `.docgrad/`，**而且該進版控**。它們是狀態不是暫存檔：
沒有它們，重新 clone 的人覆蓋率會從零開始，也永遠偵測不到尺或語料定義在他腳下變過。

`loop` 的停止條件（達標、plateau、需人裁決，以及兩種「沒有可處理的項目」時的退出）只定義一次，在
[improve.md §Stop conditions](skills/docgrad/reference/improve.md#stop-conditions-loop-any-one-of-them-ends-it)——
本文連結過去，不重述。先提醒一件事：1.x 有「設計性天花板」的概念（兩個星等錨點因為需要 CI gate
而永久封頂）；2.0 把這個概念和它套用的錨點一起退役了——見
[improve.md §Rows outside the working set](skills/docgrad/reference/improve.md#rows-outside-the-working-set)。

### 4. 畢業 —— 把規則沉澱成 CI

達標後（確切時機見
[improve.md §Stop conditions](skills/docgrad/reference/improve.md#stop-conditions-loop-any-one-of-them-ends-it)），
收官報告會**產出畢業交付物**：`.docgrad/graduation/` 下的 `docs-gate.mjs` 與 `docs-gate.yml`，門檻已按該
repo 現況設好——死鏈、壞錨、孤兒、新鮮度覆蓋率、入口檔 token 預算、污染比。**產出但不安裝**——要啟用得自己
複製到 `.github/`，docgrad 絕不寫入你的 CI 設定。完整流程見
[improve.md §Graduation](skills/docgrad/reference/improve.md#graduation-do-it-when-targets-are-met-do-not-just-recommend-it)。

沒有這道 gate，收斂會自然衰減：曾有一個 repo 在收官當天就冒出新孤兒與缺日期的檔案，兩個月後仍在原地。
死鏈與格式其實有更成熟的現成工具（lychee、markdownlint、Vale）；這幾支腳本的差異化價值在
孤兒／可達性分析與入口檔 token 預算。

## 指令速查

| 指令 | 作用 |
|---|---|
| `/docgrad init` | 掃描＋問卷 → 寫 `.docgrad.yml` 進目標 repo（一次性） |
| `/docgrad measure` | 全量四支腳本，產出 `OK`/`WATCH`/`FAIL` 評等（不改檔） |
| `/docgrad judge` | LLM 對完整性／正確性／一致性打 ★1–★5（不改檔，需要本輪的 `measure` 輸出） |
| `/docgrad measure <範圍>`／`judge --dim <維度>` | 限定目錄／主題，或單一 judge 維度的 scoped 報告（不改檔、不落檔） |
| `/docgrad improve` | 跑一輪收斂：挑一個未達標的 `measure` 項（improve.md 第 2 步）→ 修 → 重新量測 → commit |
| `/docgrad loop` | 反覆 improve，直到符合 improve.md §Stop conditions 的任一停止條件 |
| `/docgrad report` | 重印最近 scorecard＋歷輪分數走勢 |
| `/docgrad audit` | **已棄用的別名**——跑 `measure`；加 `--judge` 才會一併跑 `judge`（仍是純報告） |

路由與 blockers 的權威定義在 [skills/docgrad/SKILL.md](skills/docgrad/SKILL.md)，本表僅摘要。

## 安裝、更新、移除

以下指令都是 **user scope**——裝一次，每個 repo 都能用。

```bash
# 安裝
claude plugin marketplace add redtear1115/docgrad
claude plugin install docgrad@docgrad --scope user

# 更新
claude plugin marketplace update docgrad
claude plugin update docgrad

# 移除
claude plugin uninstall docgrad@docgrad --scope user
```

session 內的 `/plugin install` 對話框會問 scope，選 **User**。之後 `/plugin` 的 Marketplaces 頁
會顯示可更新版本（也可對此 marketplace 開啟自動更新）。版本與變更內容見 [CHANGELOG.md](CHANGELOG.md)。

### 讓 agent 自己裝

把下面這段貼給任何一個 Claude Code session：

> 幫我安裝 docgrad plugin：先跑 `claude plugin marketplace add redtear1115/docgrad`，
> 再跑 `claude plugin install docgrad@docgrad --scope user`，要重啟就重啟。
> 然後執行 `/docgrad` 並把路由表印給我看，讓我確認有載入。

之後要更新：

> 幫我更新 docgrad plugin：`claude plugin marketplace update docgrad`，然後 `claude plugin update docgrad`。
> 告訴我更新到哪一版，並把該 repo 的 CHANGELOG.md 裡舊版到新版之間的變更摘要給我。

想一口氣從零跑到第一份分數：

> 幫我安裝 docgrad（marketplace `redtear1115/docgrad`、plugin `docgrad@docgrad`、user scope），
> 然後在這個 repo 跑 `/docgrad init`，問卷能從 repo 推斷的你自己填，只有入口檔與排除清單來問我，
> 接著跑 `/docgrad measure` 把 scorecard 給我看。

### 不用 plugin 系統

clone 下來之後把 skill 本體 symlink 過去——**不要直接 clone 進 `~/.claude/skills/`**，因為 v1.7.0
之後本體在 `skills/docgrad/`，而 plugin manifest 留在 repo 根：

```bash
git clone https://github.com/redtear1115/docgrad ~/.docgrad-src
ln -s ~/.docgrad-src/skills/docgrad ~/.claude/skills/docgrad
```

更新＝到 `~/.docgrad-src` `git pull`；是否有新版自己對 [CHANGELOG.md](CHANGELOG.md)。
你只損失更新通知，其他都一樣。

直接 `cp -r skills/docgrad ~/.claude/skills/docgrad` 也載得起來，但這樣會把 `.claude-plugin/` 留在原地，
於是每支腳本的 JSON 與每一列 `history.jsonl` 的 `version` 都變成 `null`——你會**無聲地**失去
「這個分數是哪一把尺量的」這個指紋。要嘛 symlink，要嘛整包複製。

### 其他平台

佈局遵循 [Agent Skills 標準](https://agentskills.io/specification)（`skills/<name>/SKILL.md`），
各平台的 manifest 放在 repo 根，所以其他 agent 也拿得到。**下表的「已驗證」只代表一件事：從這台機器實際裝過一次，
裝完 skill 與腳本都解析得到。** 它不代表行為與文件敘述比對過。

| 平台 | 打包 | 狀態 |
|---|---|---|
| Claude Code | `.claude-plugin/{plugin,marketplace}.json`，`skills/` 自動探索 | **已驗證**——marketplace add → install → `skills/docgrad/SKILL.md` 在位、五支腳本從安裝副本跑得起來、`version` 解析得到 |
| Codex | `.codex-plugin/plugin.json`（`"skills": "./skills/"`）、`.agents/plugins/marketplace.json` | **未驗證**——manifest 依標準撰寫並參照可運作的實例，但沒有從這台機器跑過 Codex 安裝 |
| Antigravity | 根目錄 `plugin.json`、`.agents/` workspace 探索、`.agents/workflows/docgrad.md` | **未驗證**——同上 |
| Skills CLI（`npx skills add`） | `skills/docgrad/SKILL.md` | **未驗證**——它從已發佈的 GitHub repo 安裝，所以在這版合併前無法對這個佈局實測 |

如果你在未驗證的平台上裝起來了，歡迎開 issue 說成不成功——那是這幾列唯一會改變的途徑。

## Case studies

實際跑出來的量測，附可重跑的指令。對工具有利與不利的數字都在裡面。

| | 受測對象 | 量什麼 | 結論 |
|---|---|---|---|
| [1](case-studies/01-commander-js.md) | `tj/commander.js` | 收斂前後，同一個功能設計任務的**真實 agent token 用量** | 設計品質兩臂都是 12/12 打平；收斂後**輪數少 15%**，但進 context 的 **token 多 20%** |
| [2](case-studies/02-docgrad-self.md) | docgrad 自己，9 輪真實收斂 | 產品長大時，文件的 token 成本落在哪裡 | 語料成長 3.4×，但每次任務付的稅只成長 1.8×，**佔語料比例反而腰斬** |
| [3](case-studies/03-fixtures.md) | 三個 eval fixture | 同一棵樹重跑，1.x 星等能不能拿到同一個結果 | 12 次全數通過，18 個維度格中 16 格完全一致（1.x 評分）——並抓出 rubric 的一個真缺口 |
| [4](case-studies/04-long-running.md) | 一個私有正式專案，13 輪 | 長期跑下來到底買到什麼、又有什麼會衰減 | 星等（1.x）多半 ★4——但**已驗證覆蓋率只有 10.1%**；經濟性連九輪卡在 ★3；產出的 CI 閘門紅了四輪沒人發現 |

打算查核數字的話，先讀[方法說明](case-studies/README.md)。

## 適用邊界

docgrad 評的是**本地 markdown 檔案樹**：五支腳本都以本地路徑運作，`.docgrad.yml` 也要能寫進目標 repo 根目錄。

- **git 不是硬需求**：沒有 git 時新鮮度只認文件自稱的日期、覆蓋漂移無法量測，其餘照跑。
- **wiki／Confluence 等遠端文件源不支援**：檔案不在樹上、設定檔無處可放。真要評這類文件源，
  可只借用 [skills/docgrad/reference/rubric.md](skills/docgrad/reference/rubric.md) 的三個 judge 錨點，
  或 [skills/docgrad/reference/measure.md](skills/docgrad/reference/measure.md#verdict-lines) 的 measure
  band 做人工評分——無機械訊號、不可重現，也不落 scorecard。

不評 prose 風格（Vale 的事）、不評 SKILL.md 本身、不評程式碼品質。一致性維度**會讀** code 註解，
但只判「同一件事有沒有第二份權威、位置對不對」（見 [skills/docgrad/reference/placement.md](skills/docgrad/reference/placement.md)），
不評註解寫得好不好。完整定位見 [docs/design.md](docs/design.md)。

## Repo 結構

```text
docgrad/
├── skills/docgrad/     # skill 本體——agent 執行期會載入的東西都在這
│   ├── SKILL.md        # 路由、blockers、scripts 契約
│   ├── reference/      # rubric（judge 錨點）、measure、judge、audit（已棄用別名路由器）、improve、init、placement
│   ├── scripts/        # 五支零依賴 Node 量測腳本
│   └── templates/      # 畢業交付物：docs-gate.mjs / docs-gate.yml
├── .claude-plugin/     # Claude Code manifest
├── .codex-plugin/      # Codex manifest
├── .agents/            # Codex／Antigravity workspace 探索
├── plugin.json         # Antigravity manifest
├── UPGRADING.md        # 1.x → 2.0 升級指南
├── case-studies/       # 實測紀錄，附重跑指令（多半是 1.x）
├── evals/              # skill 級評測（measure 可不可重現、judge 星等穩不穩）
├── tests/              # 腳本單元測試
└── docs/               # design.md、how-to.md
```

## 開發

```bash
node --test tests/*.test.mjs
```

skill 級評測（`measure` 可重現性、`judge` 星等穩定度、抽樣覆蓋率、偽陽性）另見
[evals/README.md](evals/README.md)——`tests/` 測的是腳本輸出，測不到 `judge` 星等穩不穩。

設計文件：[docs/design.md](docs/design.md)；常見開發任務：[docs/how-to.md](docs/how-to.md)；
出處致謝：[NOTICE.md](NOTICE.md)。

## 授權

MIT
