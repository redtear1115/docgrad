# docgrad how-to — 常見開發任務

> **Last updated:** 2026-07-12

## 新增一個評分維度

1. **錨點先行**：在 [reference/rubric.md](../reference/rubric.md) 增加維度小節（★1–★5 完整錨點＋量測方式）。錨點修改＝breaking change，見下節。
2. 更新 rubric 的「機械訊號 → 維度對照」表；維度順序（tie-break 依據）以 rubric 表序為準。
3. `.docgrad.yml` 的 `targets` 加新維度鍵；`scripts/lib.mjs` 的 `DEFAULTS.targets` 同步（欄位清單以 code 為權威，本檔不複述）。
4. [reference/audit.md](../reference/audit.md) 補該維度的評分步驟；scorecard 模板加一列。
5. 若需要新機械訊號：加 `scripts/<name>.mjs`（契約見 [design.md](design.md) §scripts 契約——零依賴、JSON→stdout、錯誤→stderr＋非零 exit、支援 `--root`），並在 `tests/` 加對應 `*.test.mjs`。

## 修改 rubric 錨點的正確姿勢

- 錨點寫入即凍結；語意變更會使各 repo `.docgrad/history.jsonl` 的歷史分數失去可比性。
- 非改不可時：commit message 明示 breaking、建議受影響 repo 的收斂輪從基線重新起算。
- 純排版、補日期行不算 breaking。

## 擴充量測腳本（lib.mjs）

- `scripts/lib.mjs` 是三支 CLI 的共用模組；函式契約以 code 為權威（refer-to-code，docs 不複述簽名）。
- YAML 解析是**兩層子集**（頂層 scalar／inline list／block list＋一層 nested map），新設定欄位不要超出這個結構。
- 開發驗證：`node --test tests/*.test.mjs`（Node ≥18；v25 起目錄參數不可用）。
