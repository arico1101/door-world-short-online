# Worktree policy

- Before creating a worktree for any new task, update the local `main` branch from `origin/main` in the primary checkout with `git pull --ff-only origin main` and confirm that it succeeds. Never create a task worktree from a stale `main` branch.
- After updating `main`, create a fresh Git worktree under `/Users/arisa/door-world-short/.claude/worktrees/` and perform all task work from that worktree.
- Create a new, uniquely named worktree and branch for each task. Do not reuse an existing task worktree.
- Once the current task is already running from a worktree under that directory, continue there; do not create recursively nested worktrees.
- Treat the primary checkout at `/Users/arisa/door-world-short` as the worktree-management location only. Except when the user explicitly requests otherwise, do not edit project files there.
- Preserve all uncommitted changes in the primary checkout. Do not move, discard, reset, or overwrite them when creating a task worktree.
