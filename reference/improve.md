# improve / loop — 收斂輪

> **Last updated:** 2026-07-26

`improve`＝跑一輪就停；`loop`＝反覆跑到停止條件。流程完全相同。

## 前置 blockers

1. 無 `.docgrad.yml` → 停，導向 `/docgrad init`。
2. 尚未讀 [rubric.md](rubric.md) → 先讀。
3. 目標 repo 工作區有未提交變更（非 docgrad 產生）→ 停，請使用者處理後再跑。

## Branch 紀律

- 一律在 `docgrad/converge` branch 工作：不存在 → 從目前 branch 建立；已存在 → checkout 續跑（中斷可續）。
- 只 commit docs 變更與 `.docgrad/` 狀態檔——「docs 變更」＝ `.docgrad.yml` 的 `docs_dirs`／`entry_files`
  涵蓋的檔案，**不含 source code 檔**（含其註解）。**絕不碰目標 repo 的 CI 設定。**
- branch 隔離讓使用者可整批 review 再合併；每輪一 commit 保證可回退。

## 每輪步驟

1. **評分**：依 [audit.md](audit.md) 全量評分（腳本＋LLM），得本輪 scorecard。
2. **挑維度**：取最低分維度；同分 → 取 rubric 順序靠前者（完整性 → 正確性 → 新鮮度 → 連結度 → 一致性）。
   已判**設計性天花板**（見停止條件）的維度不列入挑選，取次低者。
   **一輪只修這一維**——收斂不是重寫，全量改一半會留下矛盾。
   選中**一致性**時再細分一層：一輪只修一類失分，依 `[矛盾]` → `[重複]` → `[落點]` 排序
   （矛盾讓 agent 讀到錯的事實、危害最大；重複是矛盾的溫床；落點只是取用效率）。
   搬動資訊落點會動到 code 註解／spec，比改 docs 風險高——排最後，且該輪不得同時修其他類。
3. **修**：從該維失分點逐條生成 focused 修改並執行：
   - 機械修正直接做：死鏈修復、孤兒補進索引、日期 backfill——一律用
     `git log -1 --format=%as -- <file>` 的真實日期，**禁止捏造日期**。
   - 語意修正也做，但必須在 commit message 列清單：合併冗餘文件、敘述改寫為
     refer-to-code、刪檔、補缺口文件。
   - **落點類的界線**：只動 docs 範圍內的檔案（entry file ↔ docs、docs ↔ docs 的搬移照做）。
     要把資訊搬進 code 註解或其他 source 檔的建議**一律不自動執行**——那超出「只 commit docs 變更」
     的 branch 紀律，且四支腳本驗證不到 code 註解，改了也無從確認沒改壞。這類失分點改寫進本輪報告的
     「建議由人處理」清單並記入 notes；若一致性因此連兩輪無進步，判**設計性天花板**而非 plateau。
4. **驗證**：重跑腳本＋受影響維度重評。成功＝目標維上升且其他維不降。
   任何維度下降 → revert 造成下降的修改，記入 notes。
5. **記錄＋commit**：
   - append 一行到 `.docgrad/history.jsonl`（無則建立）：

     ```json
     {"round": 3, "date": "2026-07-12", "dimension": "linkage", "scores": {"completeness": 4, "correctness": 3, "freshness": 4, "linkage": 4, "consistency": 4}, "notes": "修 12 死鏈；2 孤兒併入索引"}
     ```

   - 覆寫 `.docgrad/scorecard-latest.md`（audit.md 的 scorecard 全文）。
   - commit（zh-TW）：

     ```
     docs(docgrad): 第 N 輪收斂 — <維度> ★x→★y

     語意修改：
     - 合併 a.md 與 b.md（重疊主題）
     - …（無則省略此段）

     scorecard: 完整性★x 正確性★x 新鮮度★x 連結度★x 一致性★x
     ```

## 維度封頂：設計性天花板

某維的下一星錨點落在 Blocker 禁區 → 該維判「docgrad 範圍內已收斂（上限 ★x）」：不再列入挑維度、
達標判定時視同已達標、在收官報告與畢業建議點名它與其原因。**這不停 loop**，只是把該維移出工作集。

目前唯一一例：新鮮度 ★5 錨點要求「同 MR 隨改隨更**有機械 gate 強制**」，而 Blocker #3 明訂不碰目標
repo 的 CI —— loop 內新鮮度上限 ★4（僅在該維 target 設為 5 時撞到；預設 target ★4 不受影響）。

**與 plateau 的區別**：plateau＝修得動、但這兩輪沒修出成績，再跑有機會；設計性天花板＝設計上不可達，
再跑幾輪也不會動。判成 plateau 會讓報告誤導使用者「多跑幾輪試試」，所以先判天花板再判 plateau。

## 停止條件（loop；任一成立即停）

- ✅ **達標**：每個維度皆「≥ `.docgrad.yml` targets」或「已判設計性天花板」→ 收官報告＋畢業建議（見下）。
- ⏸ **plateau**：連續兩輪所有維度分數皆無進步（已封頂維不計入）→ plateau 報告：卡在哪一維哪些失分點、
  為何 docgrad 修不動（例：需要補寫領域知識、需要人定奪的取捨）。
- ⏸ **需人裁決**：兩份文件互斥且 code 無法仲裁，或修正涉及產品決策 → 列出選項
  （A/B＋各自後果與建議），暫停等使用者裁決後再續。

`improve` 單輪跑完直接停，輸出本輪 scorecard 與 diff 摘要。

## 畢業建議（達標收官報告的固定尾節）

達標後在收官報告固定附上：

> 建議把可機械化的規則沉澱成本 repo 自己的 docs-gate CI（死鏈/孤兒/新鮮度/
> 入口檔 token 預算），docgrad 的四支 scripts（inventory/links/freshness/coverage）可直接
> 搬去改造。docgrad 只評分與修內容，不代寫 CI——由團隊自行決定 gate 的嚴格度。

有維度因設計性天花板封頂時，本節要點名它：該維要再上一星只能靠這道 CI
（例：新鮮度 ★5 ＝ 「docs 與 code 同 MR 更新」的 gate），並說明目前上限星等。
