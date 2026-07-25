# init — 一次性設定

> **Last updated:** 2026-07-26

目的：掃描目標 repo → 問卷確認 → 把 `.docgrad.yml` 寫進目標 repo 根目錄（進版控，團隊共用）。
已有 `.docgrad.yml` 時重跑 init＝重新掃描，並以現有設定為問卷預設值。

## 1. 掃描（全部做完再一次問，不要邊掃邊問）

| 項目 | 偵測方式 | 候選 |
|---|---|---|
| docs 目錄 | Glob 頂層目錄 | `docs/`、`doc/`、`documentation/`；其他含 ≥3 個 .md 的頂層目錄 |
| 入口檔（always-loaded） | Glob root 與 .github/ | `CLAUDE.md`、`AGENTS.md`、`GEMINI.md`、`.cursorrules`、`.github/copilot-instructions.md` |
| 索引檔 | docs 目錄內 | `README.md`、`index.md`、`TOC.md` |
| 排除目錄 | 名稱樣式＋.gitignore | `archive/`、`deprecated/`、`generated` 標記、gitignored 的 WIP 目錄 |
| src 目錄 | Glob 頂層目錄 | `src/`、`lib/`、`app/`、`packages/`；其他含程式碼的頂層目錄 |
| 新鮮度慣例 | 抽 5 份 docs 檔看頭部 | frontmatter 日期欄位／「Last updated:」類行／無 |

## 2. 問卷（AskUserQuestion，逐項帶掃描結果當預設選項）

1. `docs_dirs`（多選，帶掃描候選）
2. `entry_files`（多選）
3. `index_file`（單選；無候選 → 填 `null` 並提醒：連結度會因無可達性根而受限，improve 第一輪可代建索引）
4. `exclude`（多選；掃到的候選＋自由輸入）
5. freshness `convention`（frontmatter / heading-line / none）＋ `field`
6. `targets`：預設全 4，問「哪些維度願意降到 3？」（多選）
7. `scenario`：請使用者用一句話描述該 repo 的代表性開發任務（token 邊際成本模擬用）
8. `correctness_sample`：預設 8；大型 docs 體系（>50 檔）建議 12
9. `src_dirs`（多選，帶掃描候選；覆蓋漂移偵測用）：選空 → 完整性降級為純 LLM 對照（coverage.mjs 不量測、只輸出 note）

## 3. 寫檔

寫入 `.docgrad.yml`（值全部帶入問卷結果；只用兩層結構與 inline list，確保腳本可解析）：

```yaml
# .docgrad.yml — docgrad 設定（進版控，團隊共用）
docs_dirs: [docs/]
entry_files: [CLAUDE.md]
index_file: docs/README.md
exclude: [docs/archive/]
src_dirs: [src/]
freshness:
  convention: frontmatter
  field: last_updated
coverage:
  drift_after_days: 30   # doc 落後 code 幾天才算漂移（預設 30）
  min_commits: 3         # 期間 code commit 數達幾次才算漂移（預設 3）
targets:
  completeness: 4
  correctness: 4
  freshness: 4
  linkage: 4
  consistency: 4
correctness_sample: 8
scenario: "在 <某模組> 加一個典型新功能"
language: zh-TW
```

寫完立刻驗證：`node "$SKILL_DIR/scripts/inventory.mjs" --root .` 能跑出 JSON 才算完成。

## 文件源不可寫時（設定檔外置）

文件樹本身不能落檔（唯讀掛載、匯出目錄）→ 把 `.docgrad.yml` 寫到別處，腳本以 `--config <file>`
指定即可跑 `audit`（`improve`/`loop` 仍需要可寫且有 git 的工作區）。這只解決設定檔的落點，
不改變「文件必須是本地 markdown 檔案樹」的前提——邊界見 [design.md](../docs/design.md) §定位與邊界。

## 4. 收尾

- 印出寫入內容摘要（各欄位一行）。
- 建議使用者把 `.docgrad.yml` commit 進版控；經同意後代為 commit
  （message：`chore: docgrad init — 文件評估設定`）。
- 提示下一步：`/docgrad audit` 看第一份 scorecard。
