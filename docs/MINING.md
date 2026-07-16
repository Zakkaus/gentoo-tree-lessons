# How this lesson base was mined (and how to re-run / extend it)

The docs in this folder were distilled from real gentoo/gentoo commits, newest
first, on 2026-07-16. Every rule cites the commit sha (relative to the
gentoo/gentoo repo) it was learned from — a rule with no sha is a bug.

## Pipeline (3 stages, AI only in stage 2-3)

1. **Corpus + deterministic classifier** (no AI, human-checkable):
   - Corpus: `git clone --depth 60000 --single-branch https://github.com/gentoo/gentoo.git
     /var/tmp/gentoo-history` — 60k commits ≈ 2025-12-19..2026-07-16 (~7 months).
     The live repo /var/db/repos/gentoo is a depth-1 sync; never touch it for this.
   - Classifier: `/var/tmp/gentoo-analysis/classify.py` (~100 lines of regex over
     commit message + name-status file patterns). Categories: fix / eclass /
     qa-explicit / security / stabilize / bump / drop / new-package / profiles /
     meta / other. Distribution on this corpus: 21.5k stabilize, 14.5k bump,
     11.4k drop, 9.2k fix, 422 eclass, 81 security, 48 qa-explicit.
2. **Parallel analysis** (AI, 92 agents): newest 2000 fix + 200 eclass + 48 qa +
   50 security commits, 25 per agent. Each agent `git show`s its commits and
   writes lesson records to `/var/tmp/gentoo-analysis/lessons/<batch>.jsonl`
   with fields {sha, pkg, ecosystem, problem, root_cause, fix_pattern, rule,
   snippet, automatable, value}. Result: 2300 records, 319 high-value.
3. **Theme synthesis + completeness critique + residue fold** (AI): 10 theme
   docs, then a critic diffed cited-shas vs the high/med pool (found 40% of
   high-value lessons uncited), then a fold pass merged the 543-record residue
   and added kernel/java/perl docs.

Total round-1 cost: ~7.5M subagent tokens, ~112 agents.

## Re-run / extend

- Re-classify after refreshing the corpus: `git -C /var/tmp/gentoo-history fetch
  --deepen=<n>` (or re-clone), then
  `python3 /var/tmp/gentoo-analysis/classify.py /var/tmp/gentoo-history 60000 > commits.jsonl`.
- The workflow scripts live under the session dir but the important artifacts
  (batches, lessons, residue) are all in `/var/tmp/gentoo-analysis/` and this
  folder. A new round only needs: new batch files + the same agent prompts.

## Round-2 recommendations (from the completeness critic)

1. **Bug-linked deep dives**: 209 lesson records reference a bugs.gentoo.org
   number; the root cause often lives in the bug thread, not the commit. A pass
   that fetches those bugs would upgrade many "med" records to real rules.
2. **Not older commits**: pre-2026 conventions age badly (pre-EAPI-8 idioms);
   eclass mining is near-saturated (422 commits → 178 records already).
3. **The remaining ~7200 fix commits** in this corpus are available in
   `/var/tmp/gentoo-analysis/commits.jsonl` if more breadth is wanted; take the
   next-newest slice, same batch format.

## The end goal (why this exists)

Feed these docs to AI bump/review workflows in the gentoo-zh overlay, and turn
the "## Automatable checks" sections into deterministic QA scripts (enhance
pkgcheck-style checking rather than writing one giant unreviewable script).
Next planned step: sweep the gentoo-zh overlay against the Automatable checks
and fix what falls out.
