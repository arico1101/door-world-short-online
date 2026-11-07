# どれが最新か（確認・回答の前に必ず読む）

このリポジトリ（せかい版ショート）は**あしなが内部の検証用**で、運営ルールやゲームの仕様が古いままのことがある。
質問に答えるとき・資料を直すときは、まず下の「正」を確認すること。

| 何の正か | どこ |
| --- | --- |
| 運営ルール（家庭カードの見せ方、事前に言ってよいこと、タイムテーブル、ふりかえり） | Notion「トビラ せかい版 実施ガイド」 https://app.notion.com/p/3c0b9e20cc3e81fd8884c1c39b414341 ／ 国内版 https://app.notion.com/p/3c0b9e20cc3e81b18693d2d0797307ea |
| ゲーム本体（せかい版。盤面「ぜんぶ」「みじかめ」） | `arico1101/door-world-online` の `main` |
| ゲーム本体（国内版） | `arico1101/door-domestic-game` の `main` |
| 進行スライド | 実施ガイドからリンクしている Canva（せかい版 https://www.canva.com/d/7ElRgrEIuAq6gHY ／ 国内版 https://www.canva.com/d/Sdj0ZRpuPT4hMIk） |

- このリポジトリの `README.md`・`SLIDES_SCRIPT.md`・`SLIDES_BRIEF.md`・`slides.html` と食い違ったら、**上の「正」を優先する**。
  例：家庭カードは「見せ合ってOK、『とくい』だけ最後まで秘密」（実施ガイド）。このリポジトリの台本の「人に見せない」は古い。
- 質問に答える前に、関係する Notion ページと、関係するリポジトリの `origin/main` を確認する。
  セッションに入っていないリポジトリは追加してから見る（追加できないときは、見られなかったことを回答に書く）。
- 古い記述を見つけたら、回答の中でそのことを伝える。黙って古いほうに合わせない。

# Worktree policy

- Before creating a worktree for any new task, update the local `main` branch from `origin/main` in the primary checkout with `git pull --ff-only origin main` and confirm that it succeeds. Never create a task worktree from a stale `main` branch.
- After updating `main`, create a fresh Git worktree under `/Users/arisa/door-world-short/.claude/worktrees/` and perform all task work from that worktree.
- Create a new, uniquely named worktree and branch for each task. Do not reuse an existing task worktree.
- Once the current task is already running from a worktree under that directory, continue there; do not create recursively nested worktrees.
- Treat the primary checkout at `/Users/arisa/door-world-short` as the worktree-management location only. Except when the user explicitly requests otherwise, do not edit project files there.
- Preserve all uncommitted changes in the primary checkout. Do not move, discard, reset, or overwrite them when creating a task worktree.
