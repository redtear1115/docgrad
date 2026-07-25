# Changelog

版本權威在 [.claude-plugin/plugin.json](.claude-plugin/plugin.json) 的 `version`；本檔記錄各版變更。
版號語意（semver，docgrad 特化）見 [docs/how-to.md](docs/how-to.md) §發版。

## 0.5.0 — 2026-07-26

- **新增**：`reference/placement.md` —— 資訊安置政策。三軸取捨（取用成本／漂移風險／受眾廣度）決定
  每類資訊的權威落點：全塞 entry file 是取用成本最低但 token 稅最貴、最易腐爛的解，故以受眾廣度仲裁。
  六條判定規則含決策資訊的切法——**當前結論的根據寫進它所約束的那份 spec 本身**（根據與結論不分家、
  覆寫而非累積、要含被否決方案與否決條件），辯論過程才留 issue。（issue #4）
- **量測範圍變更（非錨點變更）**：一致性維度的判定範圍從「docs 內部」擴到 **docs ↔ code 註解／spec**
  的落點與重複；失分點分 `[矛盾]`／`[重複]`／`[落點]` 三類。★1–★5 錨點文字未動，但原本 ★5 的 repo
  可能因跨載體重複而下修——跨 0.5.0 比較一致性分數時報告要註明範圍已擴大（同 0.2.0 完整性改以
  coverage 為機械基礎的性質）。決議走擴充維度而非新增第六維：加維度＝rubric 結構變更＝major＋
  所有 repo 歷史分數重新起算。
- **收斂紀律**：`improve`/`loop` 選中一致性時，一輪只修一類失分（`[矛盾]` → `[重複]` → `[落點]`）。
  落點類**只動 docs 範圍內的檔案**——要搬進 code 註解或其他 source 檔的建議一律不自動執行
  （超出「只 commit docs 變更」的 branch 紀律，且腳本驗證不到 code 註解），改列入報告的
  「建議由人處理」清單；因此卡住時判設計性天花板而非 plateau。
- **定位**：`docs/design.md` 補「資訊落點 vs code 品質」的界線——為判落點會讀 code 註解，
  但不評註解品質，否則一致性維度會滑成 code review。

## 0.4.0 — 2026-07-26

- **新增（指令）**：`audit <scope>`／`audit --dim <維度>` —— scoped audit，限定目錄／glob／主題或單一
  維度。一律純報告且**絕不寫入 `.docgrad/`**（scoped 分數混進 history 會毀掉跨輪可比性）；各維度在
  範圍限定下的效力與報告標頭格式見 `reference/audit.md` §scoped audit。（issue #2）
- **新增（CLI）**：四支腳本的共用旗標改由 `scripts/lib.mjs › parseArgs()` 一處解析，新增
  `--include <glob>`（可重複／逗號分隔，支援 `**`／`*`／`?` 與目錄前綴）與 `--config <file>`
  （設定檔外置——文件源本身不能落檔時用）。未知旗標一律丟錯，不再靜默忽略。（issue #2、#3 建議 2）
- **量測語意**：`links.mjs` 在 scope 限定時孤兒回 `[]`、可達率回 `null`（可達性是全量索引概念，
  範圍一縮就失真，不得因此扣星）；`coverage.mjs` 刻意不吃 `--include`（docs 端一縮會把範圍外的提及
  誤判成 undocumented），並在 `note` 說明；`inventory.mjs` 的 `entry_cost.files` 改列實際計入的 entry 檔。
- **相容性**：不加旗標時四支輸出除多一個 `scope: null` 欄位外與 0.3.0 相同；rubric 錨點未動。

## 0.3.0 — 2026-07-26

- **新增（loop 行為）**：`reference/improve.md` 新增**設計性天花板**——某維的下一星錨點落在 Blocker
  禁區時直接判該維「docgrad 範圍內已收斂」、移出挑維度與達標判定，並在畢業建議點名它。修掉
  「新鮮度 ★5 要 CI gate ／ Blocker #3 不碰 CI」的結構性矛盾被誤報成 plateau 的問題（issue #1）。
- **文件（適用邊界）**：README／SKILL.md／`docs/design.md` 明示前提——本地 markdown 檔案樹＋
  可寫入 `.docgrad.yml`；git 非硬需求（無 git 時新鮮度降級為 claimed-only）；wiki／遠端文件源不支援，
  該場景可獨立借用 rubric 五維錨點做人工評分（issue #3 之邊界文件化部分）。
- **註記（非錨點變更）**：rubric 新鮮度 ★5 標註為畢業後範圍（graduation-only）。
  ★1–★5 判定門檻一字未動，歷史分數可比性保留。

## 0.2.0 — 2026-07-13

- **新增**：第四支量測腳本 `scripts/coverage.mjs`（覆蓋漂移）——git 比對每個 code 區域與提及它的
  docs 的時滯，機械偵測 `undocumented`／`drifted` 區域，餵給完整性定星。修掉「新功能長在既有
  模組內部而沒寫文件時，完整性 ★5 虛掛不動」的漏洞。
- **設定**：`.docgrad.yml` 新增 `src_dirs` 與 `coverage:`（`drift_after_days: 30`、`min_commits: 3`）。
  既有 repo 需重跑 `/docgrad init` 或手動補 `src_dirs`；未設定時完整性降級為純 LLM 對照（同舊版行為）。
- **量測方法變更（非錨點變更）**：rubric 完整性「量測」行改以 coverage 輸出為機械基礎；
  星等錨點一字未動，歷史分數可比性保留。
- **發佈**：plugin 化（`.claude-plugin/plugin.json`＋`marketplace.json`），支援
  `/plugin marketplace add redtear1115/docgrad` 安裝與版本更新通知。

## 0.1.0 — 2026-07-12

- 首發：五維 rubric（完整性/正確性/新鮮度/連結度/一致性）＋token 經濟報告；
  `init · audit · improve · loop · report` 五指令；三支零依賴量測腳本（inventory/links/freshness）。
