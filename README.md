# gentoo-tree-lessons

从 gentoo/gentoo 主仓库的真实提交里挖出来的 ebuild 维护经验。每条规则都带出处
commit,可以直接喂给 AI 工作流当上下文,也可以人工查阅。

Ebuild-maintenance lessons mined from real gentoo/gentoo commits. Every rule
cites the commit it was learned from. Meant to be fed to AI packaging
workflows as context, and to be read by humans.

## 数据规模 / Scope

第一轮(2026-07):取主仓库最近 60000 个提交(约 2025-12 至 2026-07),先用
确定性脚本分类,再对其中 2298 个非平凡提交(fix / eclass / QA / security,
倒序最新优先)逐个分析,提炼出 2300 条记录,归纳成 13 份主题文档、706 条规则。

Round 1 (2026-07): the newest 60000 commits of the main tree (~2025-12 to
2026-07) were classified by a deterministic script; the 2298 non-trivial ones
(fix / eclass / QA / security, newest first) were analyzed one by one into
2300 lesson records, distilled into 13 topic docs with 706 rules.

## 目录 / Layout

- `docs/` — 主题文档 / topic docs:
  - 生态 / ecosystems: `python` `rust-go` `node-prebuilt` `c-cpp-build`
    `kernel` `java` `perl`
  - 横切 / cross-cutting: `eclass-migrations` `qa-fixes` `deps-revbump`
    `src-upstream` `security-masks` `general-hygiene`
  - 每份都有三节 / each has three sections: **Rules**(规则+出处)、
    **Idioms**(可复制片段)、**Automatable checks**(可脚本化的检查,
    以后做 QA 扫描用)。
  - `MINING.md` — 挖掘管线说明与复跑方法 / how it was mined and how to re-run.
- `tools/classify.py` — 提交分类器,纯规则无 AI,可人工审查 /
  the deterministic commit classifier (no AI, human-checkable).
- `data/lessons.jsonl` — 2300 条原始分析记录 / the raw lesson records.
- `data/commits.jsonl` — 6 万条提交的分类语料(sha/日期/作者/标题/类别/包),挖掘和用例选取的共同底料 /
  the 60k-commit classified corpus (sha/date/author/subject/category/pkg) that both mining and case
  selection draw on.
- `workflows/` — 生成本仓库的 Claude Code 工作流脚本(并行 agent 编排 + 原始提示词)/ the Claude Code
  workflow scripts that produced this repo (parallel-agent orchestration + the exact prompts).

## 用法 / Usage

把 `docs/` 里相关主题塞进 bump / review 工作流的上下文;要写脚本检查就从
`Automatable checks` 小节挑。规则不确定时,按 sha 去 gentoo/gentoo 看原提交。

Drop the relevant `docs/` topics into your bump/review workflow context; pick
from the `Automatable checks` sections when writing scripted QA. When a rule
seems off, look up its sha in gentoo/gentoo and read the original commit.

## 更新 / Refreshing (可持续)

    make refresh      # 更新 corpus -> 重新分类 -> 记录 provenance / update corpus -> reclassify -> record provenance
    make check        # 校验数据+文档(CI 跑的就是这个)/ validate data+docs (what CI runs)
    make mine         # 重新挖掘(需要 Claude Code harness)/ re-mine (needs the harness)

增量:`python3 tools/classify.py --since <sha或日期>` 只分类新提交(对应「优先扫新增」)。
`data/PROVENANCE.json` 记录数据基于哪个 corpus revision,所以刷新可复现、可 diff。语料克隆 `.corpus/`
被 gitignore(用 `make corpus` 拉)。CI(`.github/workflows/ci.yml`)在每次 push 跑 `make check`。

Incremental: `python3 tools/classify.py --since <sha-or-date>` classifies only new commits ("scan new
first"). `data/PROVENANCE.json` pins the corpus revision so refreshes are reproducible and diffable. The
corpus clone `.corpus/` is gitignored (`make corpus` fetches it). CI runs `make check` on every push.

## 说明 / Notes

- 分类是纯规则脚本;分析和归纳由 Claude Fable 5(`claude-fable-5`)以并行
  agent 工作流完成,共 112 个 agent、约 800 万输出 token。按 API 牌价
  (输入 $10 / 输出 $50 每百万 token)折算约 $600-900;实际跑在 Claude
  订阅额度内,没有额外费用。
  Classification is a plain rule script; the analysis and synthesis were done
  by Claude Fable 5 (`claude-fable-5`) running parallel agent workflows,
  112 agents and ~8M output tokens in total. At API list price ($10 in / $50
  out per million tokens) that is roughly $600-900 equivalent; in practice it
  ran within a Claude subscription at no extra cost.
- 规则学自约 7 个月的近期提交,反映当下惯例;老写法(pre-EAPI-8)刻意不挖。
  Rules come from ~7 months of recent commits and reflect current practice;
  older idioms were deliberately not mined.
- 代码片段引自 gentoo/gentoo(GPL-2),本仓库整体 GPL-2。
  Snippets are quoted from gentoo/gentoo (GPL-2); this repo is GPL-2.
