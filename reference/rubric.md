# docgrad rubric — 五維星等錨點

> **Last updated:** 2026-07-26

> 本檔是跨輪分數可比性的唯一依據。錨點寫死；任何修改都會讓歷史分數失去可比性，
> 屬 breaking change，必須在 commit message 明示。

## 評分總則

1. 先跑四支腳本（inventory / links / freshness / coverage），機械訊號可重現。
2. LLM 判斷維度（完整性、正確性、一致性）依本檔錨點對號入座，禁止自創標準。
3. 星等取整數 ★1–★5；取「完全滿足」的最高一級。
4. 拿不準時往低取——保守評分讓 loop 有明確的工作方向。
5. 維度固定順序（同分 tie-break 取靠前者）：完整性 → 正確性 → 新鮮度 → 連結度 → 一致性。

## 機械訊號 → 維度對照

| 腳本 | 餵給 |
|---|---|
| inventory.mjs | token 經濟報告（不計星）；完整性的盤點基礎 |
| coverage.mjs | 完整性（覆蓋漂移：undocumented/drifted 區域） |
| links.mjs | 連結度（全量機械） |
| freshness.mjs | 新鮮度（機械為主） |
| （無腳本） | 正確性、一致性（LLM claim-ledger／跨文件三角驗證） |

## 完整性 completeness

| 星 | 錨點 |
|---|---|
| ★1 | 核心模組大多無文件；agent 只能直接讀 code 反推。 |
| ★2 | 有零散文件，但部署、測試、資料模型至少一個關鍵領域整塊缺失。 |
| ★3 | 核心領域皆有權威文件；部署/測試至少有內嵌敘述。 |
| ★4 | 領域全覆蓋，常見任務有 how-to；僅少數邊緣模組缺。 |
| ★5 | 全覆蓋＋runbook＋onboarding 路徑＋退役機制明確標註「勿用於新功能」。 |

量測：coverage.mjs 的 undocumented/drifted 區域清單為機械基礎（src_dirs 未設定時降級為純 LLM 對照），LLM 再掃 src 頂層結構與部署/測試設施補判腳本看不到的缺口（如子系統粒度、mentioned_by 誤判）。undocumented/drifted 區域視同該領域缺權威文件。

## 正確性 correctness

| 星 | 錨點 |
|---|---|
| ★1 | 抽查通過率 <50%，含機制性錯誤（描述的架構已不存在）。 |
| ★2 | 通過率 50–79%，或有整份文件描述已退役機制且無任何標註。 |
| ★3 | 抽查通過 ≥80%；錯的是細節不是機制。 |
| ★4 | 抽查通過 ≥90%，且無殭屍機制文件。 |
| ★5 | 抽查全過＋殭屍代碼/已退役機制有標註＋權威列表 refer-to-code 不複述。 |

量測：claim-ledger——抽 `correctness_sample` 條具體宣稱（加權：優先抽含路徑/符號/狀態機/路由者，同一文件最多 2 條），逐條對 code 驗證（見 audit.md 步驟 3）。

## 新鮮度 freshness

| 星 | 錨點 |
|---|---|
| ★1 | 無日期訊號慣例（coverage_ratio <20%）。 |
| ★2 | 訊號零散（20–60%），或關鍵文件 staleness >180 天。 |
| ★3 | 有日期訊號慣例但靠自律；關鍵文件 staleness ≤60 天。 |
| ★4 | 覆蓋 ≥90%，mismatch 僅零星且 drift <30 天。 |
| ★5 | 全覆蓋＋「同 MR 隨改隨更」有機械 gate 強制＋生命週期管理（superseded 即處理）。 |

量測：freshness.mjs 的 coverage_ratio / stale / mismatches；「關鍵文件」＝entry_files＋index_file＋各領域權威文件。

> **★5 的適用範圍（graduation-only）**：★5 要求的「機械 gate 強制」得動 CI，而 improve/loop 受
> Blocker #3 約束不碰目標 repo 的 CI —— 故 loop 內新鮮度上限為 ★4，該維會判設計性天花板
> （見 [improve.md](improve.md)），★5 屬畢業後由團隊自建 docs-gate CI 才達成的範圍。
> 本註記只說明可達性，**不改動 ★1–★5 任何判定門檻**，歷史分數可比性不受影響。

## 連結度 linkage

| 星 | 錨點 |
|---|---|
| ★1 | 死鏈比例 >10%，或完全沒有索引。 |
| ★2 | 死鏈 2–10%，或孤兒 >20%。 |
| ★3 | 相對連結失效 ≤2%；有索引但非唯一入口。 |
| ★4 | 零死鏈、孤兒 ≤5%、reachable_ratio ≥95%。 |
| ★5 | 零死鏈＋單一頂層索引 transitive 全可達（零孤兒）＋錨點用 `path › symbol()` 抗行號漂移。 |

量測：links.mjs 全量機械輸出（死鏈比例＝dead_links / total_links）。cjk_uncertain 的壞錨不直接扣星：先人工確認再算。

## 一致性 consistency

| 星 | 錨點 |
|---|---|
| ★1 | 同主題多處矛盾且無仲裁線索。 |
| ★2 | 重疊多處，至少一組實質矛盾。 |
| ★3 | 同主題重疊 ≤2 處且互不矛盾。 |
| ★4 | 一主題一權威為主，個別重疊處有互鏈。 |
| ★5 | 一主題一權威（其餘只留摘要＋連結）＋衝突仲裁慣例明文（newer wins＋以 code 仲裁）。 |

量測：LLM 挑 3–5 個關鍵事實主題（架構、狀態機、部署方式…）做跨文件比對＋以 code 三角驗證；
判定範圍**含 docs ↔ code 註解／spec 之間的落點與重複**——規則見 [placement.md](placement.md)，
只判落點與重複，不評註解品質。失分點分 `[矛盾]`／`[重複]`／`[落點]` 三類（見 [audit.md](audit.md) 步驟 6）。

> **範圍變更（v0.5.0，非錨點變更）**：判定範圍從「docs 內部」擴到跨載體，原本 ★5 的 repo 可能因
> code 註解與 docs 各自展開同一事實而下修。★1–★5 錨點文字未動，但跨 v0.5.0 比較一致性分數時
> 要在報告註明範圍已擴大——這與 0.2.0 完整性改以 coverage 為機械基礎是同一種變更。

## Token 經濟（只報告，不計星）

- **固定成本**：`inventory.entry_cost.tokens_est`（entry_files 每次任務都載入）。
- **邊際成本**：按 `.docgrad.yml` 的 `scenario` 沿索引/路由規則模擬 agent 必讀路徑，合計沿路文件的 tokens_est。
- **污染面**：`inventory.pollution.ratio`（exclude 目錄與 WIP 佔全語料比例）。
- **解讀**：報告必附「損益兩平」說明——入口檔塞太多＝每個任務都付固定稅；全靠索引指路＝多跳檢索的邊際成本。按該 repo 的任務組成給權衡建議。
