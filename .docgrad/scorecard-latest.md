# docgrad scorecard — docgrad @ 2026-07-12（第 6 輪收斂後・正確性 ★5）

| 維度 | 星等 | 目標 | 主要失分點 |
|---|---|---|---|
| 完整性 | ★5 | ★4 | ✅ 超標（第 5 輪）。README onboarding walkthrough＋how-to 退役慣例 |
| 正確性 | ★5 | ★4 | ✅ 超標（第 6 輪）。ledger 8/8；design.md 腳本 schema／config 欄位改 refer-to-code 不複述 |
| 新鮮度 | ★4 | ★4 | ✅ 達標。coverage 100%、零 mismatch；★5 需「隨改隨更」機械 gate（loop 不建 gate → 結構性 plateau） |
| 連結度 | ★4 | ★4 | ✅ 達標。零死鏈孤兒、可達率 100%；★5 需 `path › symbol()` 抗漂移錨點慣例 |
| 一致性 | ★4 | ★4 | ✅ 達標（第 4 輪）。★5 需衝突仲裁慣例明文 |

## Token 經濟（不計星）
- 固定成本：~1,736 tokens（README 1,023＋SKILL 713）
- 邊際成本（scenario「為 docgrad 新增一個評分維度」）：~5,200 tokens（how-to → design → rubric → audit［→ improve］）
- 污染面：0%（docs/superpowers/ 已移除）

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
