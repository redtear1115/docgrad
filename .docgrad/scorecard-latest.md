# docgrad scorecard — docgrad @ 2026-07-12（第 5 輪收斂後・完整性 ★5）

| 維度 | 星等 | 目標 | 主要失分點 |
|---|---|---|---|
| 完整性 | ★5 | ★4 | ✅ 超標（第 5 輪）。README「從安裝到畢業」walkthrough 補 runbook＋onboarding；how-to 補退役標註慣例 |
| 正確性 | ★4 | ★4 | ✅ 達標（第 3 輪）。ledger 8/8；本輪新增宣稱抽驗通過 |
| 新鮮度 | ★4 | ★4 | ✅ 達標。coverage 100%、零 mismatch；★5 需「隨改隨更」機械 gate |
| 連結度 | ★4 | ★4 | ✅ 達標。零死鏈孤兒、可達率 100%；★5 需 `path › symbol()` 抗漂移錨點慣例 |
| 一致性 | ★4 | ★4 | ✅ 達標（第 4 輪）。README 停止條件摘要→improve.md 權威；how-to 退役慣例→rubric |

## Token 經濟（不計星）
- 固定成本：~1,736 tokens（README 1,023＋SKILL 713）。本輪 onboarding walkthrough 使 README +~660 tokens；
  惟 README 為人類 onboarding 入口，不像 SKILL.md 進每次任務的 agent context，實質固定稅增幅有限。
- 邊際成本（scenario「為 docgrad 新增一個評分維度」）：~5,200 tokens（how-to → design → rubric → audit［→ improve］）
- 污染面：0%（docs/superpowers/ 已移除；舊版 scorecard 記 67.4% 為移除前的過期數字）

## 歷輪走勢
| 輪 | 完整性 | 正確性 | 新鮮度 | 連結度 | 一致性 |
|---|---|---|---|---|---|
| 0（audit 基線） | 3 | 3 | 1 | 4 | 3 |
| 1（新鮮度） | 3 | 3 | **4** | 4 | 3 |
| 2（完整性） | **4** | 3 | 4 | 4 | 3 |
| 3（正確性） | 4 | **4** | 4 | 4 | 3 |
| 4（一致性） | 4 | 4 | 4 | 4 | **4** |
| 5（完整性→★5） | **5** | 4 | 4 | 4 | 4 |
