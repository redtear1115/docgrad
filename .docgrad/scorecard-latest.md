# docgrad scorecard — docgrad @ 2026-07-26（第 9 輪收斂後・全維達標收官）

> **範圍註記**：一致性維度自 v0.5.0 起判定範圍由「docs 內部」擴到 **docs ↔ code 註解／spec** 的落點與重複
> （rubric ★1–★5 錨點文字未動）。本輪一致性 ★4 與第 8 輪的 ★5 **量測範圍不同，不可直接對比**。

| 維度 | 星等 | 目標 | 主要失分點 |
|---|---|---|---|
| 完整性 | ★5 | ★4 | ✅ 超標。領域全覆蓋＋README onboarding walkthrough＋how-to 退役標註慣例。coverage.mjs 因本 repo 未設 `src_dirs` 降級為純 LLM 對照 |
| 正確性 | ★5 | ★4 | ✅ 本輪修復（ledger 8/8）。修前 7/8＝87.5%：`docs/design.md` repo 結構樹漏 v0.5.0 新增的 `reference/placement.md` 與已進版控的 `.docgrad/` |
| 新鮮度 | ★4 | ★4 | 🔒 **設計性天花板**。coverage 100%、零 stale／零 mismatch；★5 需「同 MR 隨改隨更」的機械 gate，受 Blocker #3（不碰目標 repo CI）封頂 |
| 連結度 | ★5 | ★4 | ✅ 超標。44 連結零死鏈、零壞錨、零孤兒、reachable_ratio 1.0＋`path › symbol()` 錨點慣例 |
| 一致性 | ★4 | ★4 | ✅ 達標（範圍已擴大，見上）。`[重複]` scoped audit 語意在 `links.mjs` 註解／`audit.md`／`design.md` 三處各自展開；`[落點]`「為何擴充一致性而非新增第六維」的否決根據只在 CHANGELOG 0.5.0＋issue #4，不在它約束的 rubric.md／placement.md |

## Token 經濟（不計星）
- **固定成本**：~2,762 tokens（entry_files：README.md 1,804＋SKILL.md 958）——每個任務都付
- **邊際成本**（scenario「為 docgrad 新增一個評分維度」）：~7,822 tokens
  必讀路徑：README.md＋SKILL.md（固定）→ docs/how-to.md §新增一個評分維度 → reference/rubric.md → reference/audit.md
- **污染面**：0%（`exclude: []`，無 WIP／archive 目錄）
- **語料總量**：9 檔／57,027 bytes／~16,625 tokens
- **解讀**：固定成本佔全語料 16.6%，邊際路徑再加 5,060 tokens（合計 47%）。這是**偏索引側**的配置——
  entry 檔只放路由表與邊界，細節全靠 SKILL.md §Routing 逐項指路。對 docgrad 這種「一次任務只碰一條路徑」
  （改 rubric 錨點／加腳本／改收斂流程彼此不重疊）的任務組成，這個權衡正確：多跳檢索的邊際稅只在該次付，
  比把 rubric 全文塞進 entry 檔每次都付 1,771 tokens 划算。若任務組成轉為「每次都要同時看錨點與流程」，
  才值得把兩者的交集上移。

## 歷輪走勢
| 輪 | 完整性 | 正確性 | 新鮮度 | 連結度 | 一致性 |
|---|---|---|---|---|---|
| 0（audit 基線） | 3 | 3 | 1 | 4 | 3 |
| 1（新鮮度） | 3 | 3 | **4** | 4 | 3 |
| 2（完整性） | **4** | 3 | 4 | 4 | 3 |
| 3（正確性） | 4 | **4** | 4 | 4 | 3 |
| 4（一致性） | 4 | 4 | 4 | 4 | **4** |
| 5（完整性→★5） | **5** | 4 | 4 | 4 | 4 |
| 6（正確性→★5） | 5 | **5** | 4 | 4 | 4 |
| 7（連結度→★5） | 5 | 5 | 4 | **5** | 4 |
| 8（一致性→★5） | 5 | 5 | 4 | 5 | **5** |
| 9（正確性 3→5） | 5 | **5** | 4 | 5 | 4 † |

† 第 9 輪 audit 重評時正確性先掉回 ★3（v0.5.0 新增檔案未反映進 design.md 結構樹），本輪修復回 ★5；
一致性 ★5→★4 是 v0.5.0 量測範圍擴大所致，非退步。

## 停止：✅ 全維達標
五維皆 ≥ `.docgrad.yml` targets（全 ★4），新鮮度以設計性天花板視同達標 → loop 收官。

## 畢業建議
建議把可機械化的規則沉澱成本 repo 自己的 docs-gate CI（死鏈／孤兒／新鮮度／入口檔 token 預算），
docgrad 的四支 scripts（inventory／links／freshness／coverage）可直接搬去改造。docgrad 只評分與修內容，
不代寫 CI——由團隊自行決定 gate 的嚴格度。

**因設計性天花板封頂的維度：新鮮度（目前上限 ★4）**。該維要再上一星只能靠這道 CI——
★5 錨點要求「docs 與 code 同 MR 更新」有機械 gate 強制，而 Blocker #3 明訂 loop 不碰目標 repo 的 CI。

## 一致性剩餘失分點（本輪未修：該維已達標，且一輪只修一維）
想把一致性推到 ★5，把 `.docgrad.yml` 的 `targets.consistency` 調到 5 再跑 `loop`。屆時：
第 1 條**必須由人處理**（修法會動到 `scripts/` 的 code 註解，超出「只 commit docs 變更」的 branch 紀律）；
第 2 條 docgrad 修得動（目標檔 `reference/placement.md` 在 docs 範圍內）。

1. `[重複]`　**資訊**：scoped audit 下「孤兒／可達率／entry_cost 是全量概念，範圍一縮就失真」的理由。
   **目前落點**：`scripts/links.mjs` L4 與 `scripts/inventory.mjs` L43 註解、`reference/audit.md` §scoped audit 表、
   `docs/design.md` §scripts 契約 三處各自展開。**建議落點**：評分規則歸 `reference/audit.md`（唯一權威），
   code 註解保留實作 why（受眾窄、漂移風險最低），`design.md` 改摘要＋連結。
   **理由（哪一軸）**：受眾廣度——評分規則的受眾是跑 audit 的人，實作 why 的受眾只有改該腳本的人，兩者不該互抄。
2. `[落點]`　**資訊**：「一致性擴充判定範圍而非新增第六維」的否決根據（加維度＝rubric 結構變更＝major＋所有 repo 歷史分數重新起算）。
   **目前落點**：`CHANGELOG.md` 0.5.0 條目＋issue #4。**建議落點**：`reference/placement.md` §與既有維度的關係（或 rubric.md 維度表前言）。
   **理由（哪一軸）**：漂移風險＋規則 4——CHANGELOG 是按版本累積的歷史記錄，不是它所約束的 spec；
   agent 讀 placement.md 只看到「形式決議見 issue #4」，不會知道第六維為何被否決，半年後會重提。
