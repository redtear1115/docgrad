# docgrad how-to — 常見開發任務

> **Last updated:** 2026-07-26

## 新增一個評分維度

1. **錨點先行**：在 [reference/rubric.md](../reference/rubric.md) 增加維度小節（★1–★5 完整錨點＋量測方式）。錨點修改＝breaking change，見下節。
2. 更新 rubric 的「機械訊號 → 維度對照」表；維度順序（tie-break 依據）以 rubric 表序為準。
3. `.docgrad.yml` 的 `targets` 加新維度鍵；`scripts/lib.mjs › DEFAULTS.targets` 同步（欄位清單以 code 為權威，本檔不複述）。
4. [reference/audit.md](../reference/audit.md) 補該維度的評分步驟；scorecard 模板加一列。
5. 若需要新機械訊號：加 `scripts/<name>.mjs`（契約見 [design.md](design.md) §scripts 契約——零依賴、JSON→stdout、錯誤→stderr＋非零 exit、共用旗標一律走 `scripts/lib.mjs › parseArgs()`），並在 `tests/` 加對應 `*.test.mjs`。

## 修改 rubric 錨點的正確姿勢

- 錨點寫入即凍結；語意變更會使各 repo `.docgrad/history.jsonl` 的歷史分數失去可比性。
- 非改不可時：commit message 明示 breaking、建議受影響 repo 的收斂輪從基線重新起算。
- 純排版、補日期行不算 breaking。

## 擴充量測腳本（lib.mjs）

- `scripts/lib.mjs` 是四支 CLI 的共用模組；函式契約以 code 為權威（refer-to-code，docs 不複述簽名）。
- 共用旗標（`--root`／`--config`／`--include`）由 `parseArgs()` 一處解析：新增旗標改那裡，四支同時吃到；
  未知旗標一律丟錯，不靜默忽略。scope 過濾語意見 `matchesScope()`，新腳本若不適用 scope（如 `coverage.mjs`）
  要在輸出的 `note` 明講為什麼。
- YAML 解析是**兩層子集**（頂層 scalar／inline list／block list＋一層 nested map），新設定欄位不要超出這個結構。
- 開發驗證：`node --test tests/*.test.mjs`（Node ≥18；v25 起目錄參數不可用）。

## 發版

版本權威＝[.claude-plugin/plugin.json](../.claude-plugin/plugin.json) 的 `version`（semver；
SKILL.md frontmatter 不放版號——官方規格無此欄位、無機制消費）。plugin 更新通知按此欄位比對。

版號語意（docgrad 特化）：

- **major**：rubric 星等錨點的語意變更——歷史分數失去可比性，受影響 repo 的收斂輪應從基線重新起算。
- **minor**：新維度、新量測訊號、新指令、`.docgrad.yml` 新欄位（向後相容）。
- **patch**：修錯、文件修正、量測腳本 bug fix（不改判定語意）。

發版步驟：bump `plugin.json` version → [CHANGELOG.md](../CHANGELOG.md) 補一節（日期＋變更清單，
major 要明示 breaking 與重新起算建議）→ commit → `git tag vX.Y.Z` → push（含 tag）。

## 引用 code 的錨點慣例

docs 指到 code 時用 `` `path › symbol()` ``，不用行號——行號一改就漂移：

- ✅ `` `scripts/lib.mjs › DEFAULTS.targets` ``、`` `scripts/lib.mjs › parseYamlSubset()` ``
- ❌ `scripts/lib.mjs:84`（下次編輯就失準）

符號夠定位就好，不必連完整簽名。這與連結度 ★5 錨點同源，見 [reference/rubric.md](../reference/rubric.md) 連結度。

## 標註退役／被取代的文件

docgrad 對別的 repo 評「退役機制有無標註」，自家 docs 也照做（dogfood）：

- **整份文件被取代**：頂端加狀態橫幅 `> **狀態**：已退役 — 勿用於新功能，改用〈對應新文件〉`，
  保留檔案讓舊連結不斷、讓讀者知道往哪去。
- **整塊機制移除**：直接刪檔（例：`docs/superpowers/` 歷史 plan 已移除），並在**同一 commit**
  清掉其他文件對它的殘留引用——移除不留死鏈才算乾淨。
- **段落層級的舊敘述**：就地改寫為現況，或標「（已於 vX 移除）」，不留無標註的殭屍描述。

判準：留著有導引價值（舊連結多、遷移路徑重要）就標橫幅；純歷史包袱就刪乾淨。這與新鮮度的
生命週期管理（superseded 即處理）同源，錨點見 [reference/rubric.md](../reference/rubric.md)。
