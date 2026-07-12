# docgrad scorecard — docgrad @ 2026-07-12（第 1 輪收斂後）

| 維度 | 星等 | 目標 | 主要失分點 |
|---|---|---|---|
| 完整性 | ★3 | ★4 | 缺常見任務 how-to（加評分維度、改 rubric 的正確姿勢）；lib.mjs 無文件（refer-to-code 可接受） |
| 正確性 | ★3 | ★4 | ledger 7/8（87.5%）；design.md repo 結構樹缺 tests/、LICENSE、.docgrad.yml（細節非機制） |
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
| 1（本輪：新鮮度） | 3 | 3 | **4** | 4 | 3 |
