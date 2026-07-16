# workflows/

These are **Claude Code Workflow scripts** — deterministic JS that orchestrates parallel
subagents (`agent()` / `pipeline()` / `parallel()`). They carry the exact fan-out structure
and agent prompts used to produce this repo, so they document the methodology reproducibly.
They require the Claude Code harness to run; they are not standalone CLIs. The standalone,
no-AI pieces are `tools/classify.py` (commit classifier) and, in `gentoo-replay-eval`,
`select_cases.py` / `score.py`.

- `mining.js` — phase 1+2: 92 parallel analysis agents over the classified non-trivial
  commits, then 10 theme-synthesis agents + a completeness critic. Produced `data/lessons.jsonl`
  and the topic docs.
- `residue-fold.js` — folds the uncited high/med lessons back into the docs and adds the
  kernel/java/perl docs (round-1 completeness pass).

See `docs/MINING.md` for the pipeline overview and re-run recipe.
