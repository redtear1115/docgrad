# audit — 單次全量評分

> **Last updated:** 2026-07-13

前置（blocker）：目標 repo 根目錄必須有 `.docgrad.yml`；沒有 → 停下，導向 `/docgrad init`。
本流程**不修改任何檔案**、不寫任何狀態——純報告。評分前必先讀 [rubric.md](rubric.md)。

## 步驟

### 1. 跑機械腳本

`SKILL_DIR` ＝本 skill 的安裝目錄（即本檔上一層）。在目標 repo 根目錄執行：

```bash
node "$SKILL_DIR/scripts/inventory.mjs" --root .
node "$SKILL_DIR/scripts/links.mjs" --root .
node "$SKILL_DIR/scripts/freshness.mjs" --root .
node "$SKILL_DIR/scripts/coverage.mjs" --root .
```

完整消費四份 JSON；不要用 head/grep/jq 截斷。任何一支 exit 非 0 → 停下回報 stderr。

### 2. 完整性

1. 先消費 coverage.mjs 輸出：`undocumented` 與 `drifted` 區域直接列為缺口
   （undocumented＝沒有任何權威文件；drifted＝code 已動但 docs 沒跟上）；
   各區域 `mentioned_by` 可人工複核是否誤判（近似路徑、順帶提及）。
   src_dirs 未設定（輸出帶 note）時此步降級，完全交回下面的 LLM 對照。
2. 再做 LLM 頂層補判：列出 repo 實際模組/領域清單（src 頂層結構、主要子系統、
   部署與測試設施），對照 inventory 檔案清單補抓 coverage 看不到的缺口（子系統粒度、
   部署/測試設施沒有對應 src 目錄者）。
3. 依 rubric 完整性錨點定星，記下失分點清單。

### 3. 正確性（claim-ledger）

1. 從 included 文件抽 `correctness_sample` 條「具體宣稱」。加權抽樣：優先抽含檔案路徑、
   符號名、狀態機/路由描述的段落；同一文件最多 2 條；純敘述性段落不抽。
2. 逐條對 code 驗證（Read/Grep 實查，不憑印象），記入 ledger 表：

   | # | 文件 | 宣稱 | 驗證方式 | 結果 |
   |---|---|---|---|---|
   | 1 | docs/x.md | 「路由定義在 src/router.ts」 | Read src/router.ts | pass / fail / stale |

3. 通過率＋錯誤性質（細節 vs 機制）→ rubric 定星。

### 4. 新鮮度 / 5. 連結度

直接以 freshness.mjs / links.mjs 輸出對 rubric 錨點定星。
links 的 `cjk_uncertain: true` 壞錨先逐一人工確認（開檔看標題）再計入。

### 6. 一致性

挑 3–5 個關鍵事實主題（架構分層、狀態機、部署方式、資料模型…），跨文件比對宣稱，
矛盾處以 code 仲裁。依 rubric 定星。

### 7. Token 經濟報告

依 rubric.md「Token 經濟」節計算固定成本、邊際成本（用 `.docgrad.yml` 的 scenario 模擬
必讀路徑）、污染面，附損益兩平解讀。

### 8. 輸出 scorecard

```markdown
# docgrad scorecard — <repo 名> @ <YYYY-MM-DD>

| 維度 | 星等 | 目標 | 主要失分點 |
|---|---|---|---|
| 完整性 | ★x | ★y | … |
| 正確性 | ★x | ★y | …（附 ledger 通過率 n/N） |
| 新鮮度 | ★x | ★y | … |
| 連結度 | ★x | ★y | … |
| 一致性 | ★x | ★y | … |

## Token 經濟（不計星）
- 固定成本：~N tokens（entry_files: …）
- 邊際成本（scenario「…」）：~N tokens，必讀路徑：a.md → b.md → …
- 污染面：x%（exclude: …）
- 解讀：…

## 建議下一步
最低分維度＝<維度>（同分取 rubric 順序靠前者）。失分點：
1. …
2. …
（要開始收斂請跑 /docgrad improve 或 /docgrad loop）
```
