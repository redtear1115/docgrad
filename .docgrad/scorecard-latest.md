# docgrad scorecard — docgrad @ 2026-07-12（第 3 輪收斂後）

| 維度 | 星等 | 目標 | 主要失分點 |
|---|---|---|---|
| 完整性 | ★4 | ★4 | ✅ 達標（第 2 輪）。docs/how-to.md 補常見任務；lib.mjs 明文 refer-to-code |
| 正確性 | ★4 | ★4 | ✅ 達標（第 3 輪）。ledger 8/8；結構樹已同步現況 |
| 新鮮度 | ★4 | ★4 | ✅ 達標。coverage 100%、零 mismatch；★5 需「隨改隨更」機械 gate |
| 連結度 | ★4 | ★4 | ✅ 達標。零死鏈孤兒、可達率 100%；★5 需單一索引全可達＋抗漂移錨點慣例 |
| 一致性 | ★3 | ★4 | README↔SKILL.md、design 摘要表↔rubric.md 兩處重疊缺互鏈 |

## Token 經濟（不計星）
- 固定成本：~1,036 tokens（README＋SKILL.md）
- 邊際成本（scenario「為 docgrad 新增一個評分維度」）：~5,100 tokens（design → rubric → audit［→ improve］）
- 污染面：67.4%（docs/superpowers/ 歷史 plan 16k tokens）

## 歷輪走勢
| 輪 | 完整性 | 正確性 | 新鮮度 | 連結度 | 一致性 |
|---|---|---|---|---|---|
| 0（audit 基線） | 3 | 3 | 1 | 4 | 3 |
| 1（新鮮度） | 3 | 3 | **4** | 4 | 3 |
| 2（完整性） | **4** | 3 | 4 | 4 | 3 |
| 3（正確性） | 4 | **4** | 4 | 4 | 3 |
