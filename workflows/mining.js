export const meta = {
  name: 'gentoo-tree-lesson-mining',
  description: 'Mine non-trivial gentoo.git commits (newest first) for reusable ebuild lessons, distill into ~/code/memory/gentoo-lessons/',
  phases: [
    { title: 'Analyze', detail: '92 batches of fix/eclass/QA/security commits' },
    { title: 'Synthesize', detail: '10 theme docs from the lesson pool' },
    { title: 'Critique', detail: 'completeness check' },
  ],
}

// args: array of batch file basenames, e.g. ["fix-000.jsonl", ...]
const batches = Array.isArray(args) ? args : JSON.parse(args)

const ANALYZE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['batch','analyzed','lessons','high'],
  properties: {
    batch: { type: 'string' },
    analyzed: { type: 'integer' },
    lessons: { type: 'integer', description: 'lesson records written to the output jsonl' },
    high: { type: 'integer', description: 'high-value lessons among them' },
  },
}

const SYNTH_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['theme','docPath','lessonsUsed','rules'],
  properties: {
    theme: { type: 'string' },
    docPath: { type: 'string' },
    lessonsUsed: { type: 'integer' },
    rules: { type: 'integer', description: 'number of distilled rules in the doc' },
  },
}

phase('Analyze')
const analyzed = await parallel(batches.map(b => () => agent(
`You are mining the Gentoo main-tree git history for reusable ebuild-maintenance lessons. Work batch: /var/tmp/gentoo-analysis/batches/${b}

Each line of the batch file is {sha, subject, pkg, bugs} for one non-trivial commit in the clone at /var/tmp/gentoo-history.

For EACH commit:
1. Read the full change: git -C /var/tmp/gentoo-history show --stat -p --no-color <sha> | head -c 50000
   (If the diff is mostly Manifest hashes or huge generated content, skim the ebuild/eclass hunks only.)
2. If a bug number is listed, note it, but do NOT fetch the web.
3. Judge: does this commit teach something REUSABLE for someone maintaining ebuilds in an overlay (bump hygiene, QA fix idiom, eclass migration, dependency pinning, SRC_URI/upstream change handling, cross-compiler/musl/libc fixes, revbump policy, python/rust/go/node ecosystem packaging idioms)? Package-specific trivia with no generalizable content = low value, record it as value:"low" with a one-line problem only (no rule).
4. For lessons worth keeping, extract the concrete fix pattern: WHAT was wrong (symptom), WHY (root cause), HOW the gentoo dev fixed it (exact idiom - variable set, eclass function used, dependency change, patch approach), and a generalizable one-sentence rule "when X happens, do Y". Include a code snippet of <= 10 lines when the idiom is copyable. Say whether the check/fix is automatable by a deterministic script (yes/partial/no).

Write ALL lesson records (including the low-value one-liners) as JSONL to /var/tmp/gentoo-analysis/lessons/${b} using the Write tool, one JSON object per line with fields:
{sha, pkg, ecosystem, problem, root_cause, fix_pattern, rule, snippet, automatable, value}
ecosystem is one of: python|rust|go|node|c-cpp|perl|java|kernel|prebuilt|eclass|profile|other.
value is high|med|low. For low, only {sha, pkg, ecosystem, problem, value} is required.

Then return the structured summary (batch=${b}, analyzed=N, lessons=N written, high=count of value:"high").`,
  { label: `analyze:${b.replace('.jsonl','')}`, phase: 'Analyze', schema: ANALYZE_SCHEMA }
)))

const ok = analyzed.filter(Boolean)
const totals = ok.reduce((a, r) => ({ analyzed: a.analyzed + r.analyzed, lessons: a.lessons + r.lessons, high: a.high + r.high }), { analyzed: 0, lessons: 0, high: 0 })
log(`analysis done: ${ok.length}/${batches.length} batches, ${totals.analyzed} commits, ${totals.lessons} lessons (${totals.high} high-value)`)

phase('Synthesize')
const THEMES = [
  { key: 'python',    desc: 'Python ecosystem packaging: distutils-r1/PEP517, PYTHON_COMPAT bumps, pytest/EPYTEST idioms, setuptools-scm, dep pinning' },
  { key: 'rust-go',   desc: 'Rust (cargo.eclass, CRATES/crate tarballs, GIT_CRATES, RUST_MIN_VER) and Go (go-module, vendor tarballs, EGO_SUM) packaging' },
  { key: 'node-prebuilt', desc: 'Node/JS and prebuilt-bin/Electron packages: npm tarballs, unpacker, QA_PREBUILT, RESTRICT strip/mirror, soname deps of bundled blobs' },
  { key: 'c-cpp-build', desc: 'C/C++ build systems: cmake/meson/autotools fixes, gcc/clang version fallout, musl/libc, LTO/modern-C errors (C23, incompatible-pointer-types)' },
  { key: 'eclass-migrations', desc: 'Eclass changes and migrations: deprecations, EAPI bumps, new eclass variables, inherit hygiene - what changed and how consumers adapt' },
  { key: 'qa-fixes',  desc: 'QA classes and their canonical fixes: soname deps, pre-stripped, CONFIG_CHECK, DOCS, insecure functions, RESTRICT, metadata/license issues' },
  { key: 'deps-revbump', desc: 'Dependency correctness: slot/subslot pinning and := operators, revbump policy (when -rN is required), USE dep syntax, || ( ) alternatives, BDEPEND vs DEPEND vs RDEPEND' },
  { key: 'src-upstream', desc: 'SRC_URI/upstream churn: moved repos, renamed assets, tag scheme changes, distfile verification, mirror/fetch restrictions, live ebuilds' },
  { key: 'security-masks', desc: 'Security handling: CVE bumps, GLSA, package.mask/last-rites practice, stabilization policy signals' },
  { key: 'general-hygiene', desc: 'Cross-cutting ebuild hygiene: DESCRIPTION/HOMEPAGE style, keywording, maintainer metadata, common review nits and their conventions' },
]

const synthed = await parallel(THEMES.map(t => () => agent(
`You are distilling mined Gentoo-tree lessons into ONE reusable reference document for overlay maintainers (the gentoo-zh overlay team uses these as AI-workflow context and human docs).

Theme: ${t.key} - ${t.desc}

Source data: JSONL lesson files in /var/tmp/gentoo-analysis/lessons/ (fields: sha, pkg, ecosystem, problem, root_cause, fix_pattern, rule, snippet, automatable, value). Read them with Bash (grep/jq/python) - filter records relevant to YOUR theme (by ecosystem field AND by keyword match in problem/rule; themes overlap, take what fits). There are ~90 files; read them all in bulk with a script, not one by one manually.

Write the distilled document to /home/zakk/code/memory/gentoo-lessons/${t.key}.md with this shape:
- Title line + one-paragraph scope note (what this doc covers).
- "## Rules" - the distilled generalizable rules, EACH backed by at least one real commit: format "- **rule statement** - evidence: \`sha7\` pkg (one-line what happened)". Merge duplicate/near-duplicate rules; prefer the clearest evidence. Order by how often the pattern recurred (recurrence count in parentheses when >2).
- "## Idioms" - copyable code snippets (<= 10 lines each) with a one-line caption, only genuinely reusable ones.
- "## Automatable checks" - bullet list of checks a deterministic script could run (these feed a future QA-scan of the gentoo-zh overlay), each with: what to grep/parse, what threshold/pattern means a violation, evidence sha.
- Keep it terse and factual - no filler, no AI-style hedging. English technical prose (the memory folder convention). Cite shas as plain text (they refer to the gentoo/gentoo repo).

If your theme has fewer than 5 relevant lessons, still write the doc with what exists and note the thin coverage honestly.

Return: theme=${t.key}, docPath, lessonsUsed=count of lesson records you drew on, rules=number of rules in the doc.`,
  { label: `synth:${t.key}`, phase: 'Synthesize', schema: SYNTH_SCHEMA }
)))

const sok = synthed.filter(Boolean)
log(`synthesis done: ${sok.length}/${THEMES.length} theme docs, ${sok.reduce((a,r)=>a+r.rules,0)} rules total`)

phase('Critique')
const critique = await agent(
`Completeness critic. The workflow mined /var/tmp/gentoo-analysis/lessons/*.jsonl (~90 files) and synthesized theme docs in /home/zakk/code/memory/gentoo-lessons/*.md.

Check with Bash:
1. Do the docs exist and are non-empty? List each with its rule count (grep -c '^- \\*\\*').
2. Sample 15 random high-value lessons from the JSONL pool (value:"high") and check each is represented in SOME doc (by sha grep across the docs). Report coverage as N/15 with the missed shas + their rules.
3. Any ecosystem in the lesson pool with >10 records that NO theme doc covers?
4. One paragraph: what a second mining round should target (older commits? more eclass? bug-linked fetches?).

Return your findings as plain text, terse.`,
  { label: 'critique', phase: 'Critique' }
)

return { totals, themes: sok, critique }
