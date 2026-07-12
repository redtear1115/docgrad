# improve / loop — 收斂輪

`improve`＝跑一輪就停；`loop`＝反覆跑到停止條件。流程完全相同。

## 前置 blockers

1. 無 `.docgrad.yml` → 停，導向 `/docgrad init`。
2. 尚未讀 [rubric.md](rubric.md) → 先讀。
3. 目標 repo 工作區有未提交變更（非 docgrad 產生）→ 停，請使用者處理後再跑。

## Branch 紀律

- 一律在 `docgrad/converge` branch 工作：不存在 → 從目前 branch 建立；已存在 → checkout 續跑（中斷可續）。
- 只 commit docs 變更與 `.docgrad/` 狀態檔。**絕不碰目標 repo 的 CI 設定。**
- branch 隔離讓使用者可整批 review 再合併；每輪一 commit 保證可回退。

## 每輪步驟

1. **評分**：依 [audit.md](audit.md) 全量評分（腳本＋LLM），得本輪 scorecard。
2. **挑維度**：取最低分維度；同分 → 取 rubric 順序靠前者（完整性 → 正確性 → 新鮮度 → 連結度 → 一致性）。
   **一輪只修這一維**——收斂不是重寫，全量改一半會留下矛盾。
3. **修**：從該維失分點逐條生成 focused 修改並執行：
   - 機械修正直接做：死鏈修復、孤兒補進索引、日期 backfill——一律用
     `git log -1 --format=%as -- <file>` 的真實日期，**禁止捏造日期**。
   - 語意修正也做，但必須在 commit message 列清單：合併冗餘文件、敘述改寫為
     refer-to-code、刪檔、補缺口文件。
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

## 停止條件（loop；任一成立即停）

- ✅ **達標**：全維 ≥ `.docgrad.yml` targets → 收官報告＋畢業建議（見下）。
- ⏸ **plateau**：連續兩輪所有維度分數皆無進步 → plateau 報告：卡在哪一維哪些失分點、
  為何 docgrad 修不動（例：需要補寫領域知識、需要人定奪的取捨）。
- ⏸ **需人裁決**：兩份文件互斥且 code 無法仲裁，或修正涉及產品決策 → 列出選項
  （A/B＋各自後果與建議），暫停等使用者裁決後再續。

`improve` 單輪跑完直接停，輸出本輪 scorecard 與 diff 摘要。

## 畢業建議（達標收官報告的固定尾節）

達標後在收官報告固定附上：

> 建議把可機械化的規則沉澱成本 repo 自己的 docs-gate CI（死鏈/孤兒/新鮮度/
> 入口檔 token 預算），docgrad 的三支 scripts（inventory/links/freshness）可直接
> 搬去改造。docgrad 只評分與修內容，不代寫 CI——由團隊自行決定 gate 的嚴格度。
