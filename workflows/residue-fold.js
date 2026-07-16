export const meta = {
  name: 'gentoo-lessons-residue-fold',
  description: 'Fold 543 uncited high/med lessons back into the theme docs, add kernel/java/perl docs, re-verify coverage',
  phases: [
    { title: 'Fold', detail: '6 fold agents + 3 new ecosystem docs' },
    { title: 'Verify', detail: 'coverage re-check' },
  ],
}

const FOLD_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['doc','added','merged'],
  properties: {
    doc: { type: 'string' },
    added: { type: 'integer', description: 'new rules added' },
    merged: { type: 'integer', description: 'residue lessons merged as extra evidence into existing rules' },
  },
}

const FOLDS = [
  { residue: 'python',  doc: 'python.md' },
  { residue: 'c-cpp',   doc: 'c-cpp-build.md' },
  { residue: 'eclass',  doc: 'eclass-migrations.md' },
  { residue: 'other',   doc: 'general-hygiene.md' },
  { residue: 'go',      doc: 'rust-go.md' },
  { residue: 'rust',    doc: 'rust-go.md' },
]
// go+rust both target rust-go.md - run them sequentially via one agent to avoid a write race
const foldJobs = [
  ...FOLDS.filter(f => !['go','rust'].includes(f.residue)),
  { residue: 'go AND rust (two files: residue/go.jsonl and residue/rust.jsonl)', doc: 'rust-go.md', files: ['residue/go.jsonl','residue/rust.jsonl'] },
]

const NEWDOCS = [
  { eco: 'kernel', doc: 'kernel.md', desc: 'kernel packages: dist-kernel, module rebuilds, CONFIG_CHECK, initramfs, sys-kernel/* maintenance' },
  { eco: 'java',   doc: 'java.md',   desc: 'java packaging: java-pkg-2/java-pkg-simple, JDK dep ranges, maven artifacts' },
  { eco: 'perl',   doc: 'perl.md',   desc: 'perl packaging: perl-module.eclass, dist-version mapping, perl major-version fallout' },
]

phase('Fold')
const results = await parallel([
  ...foldJobs.map(f => () => agent(
`Fold uncited mined lessons into an existing Gentoo-lessons reference doc.

Doc to update (Edit in place, do NOT rewrite wholesale): /home/zakk/code/memory/gentoo-lessons/${f.doc}
Residue lessons to fold in: ${f.files ? f.files.map(x => '/var/tmp/gentoo-analysis/' + x).join(' and ') : '/var/tmp/gentoo-analysis/residue/' + f.residue + '.jsonl'}
(fields: sha, pkg, ecosystem, problem, root_cause, fix_pattern, rule, snippet, automatable, value)

Method:
1. Read the doc and the residue file(s).
2. For each residue lesson: if an existing rule already covers it, add its sha as extra evidence to that rule (and bump the recurrence count if the doc uses counts). If it is genuinely new and generalizable, add a new rule bullet in the matching section, same format: "- **rule** - evidence: \`sha7\` pkg (one-line)". High-value lessons deserve priority; drop only true package-specific trivia with no reusable content.
3. Add any strong new snippets to "## Idioms" and new deterministic checks to "## Automatable checks".
4. Keep the doc's existing structure, tone (terse English), and ordering conventions. If the residue is large (python has 289), it is FINE to add a lot of rules - organize with subsection headers if the Rules section grows past ~40 bullets.

Return: doc=${f.doc}, added=<new rules>, merged=<lessons folded as extra evidence>.`,
    { label: `fold:${f.doc.replace('.md','')}${f.files ? ':go+rust' : ':' + f.residue}`, phase: 'Fold', schema: FOLD_SCHEMA }
  )),
  ...NEWDOCS.map(n => () => agent(
`Write a NEW Gentoo-lessons reference doc for an ecosystem the first synthesis round missed.

Theme: ${n.eco} - ${n.desc}
Output: /home/zakk/code/memory/gentoo-lessons/${n.doc}

Source: ALL lesson records with ecosystem "${n.eco}" across /var/tmp/gentoo-analysis/lessons/*.jsonl (grep them in bulk; fields: sha, pkg, ecosystem, problem, root_cause, fix_pattern, rule, snippet, automatable, value). Also check /var/tmp/gentoo-analysis/residue/${n.eco}.jsonl exists (subset already computed).

Doc format (match the sibling docs in /home/zakk/code/memory/gentoo-lessons/):
- Title + one-paragraph scope.
- "## Rules" - generalizable rules, each with evidence "\`sha7\` pkg (one-line)"; merge near-duplicates; recurrence counts when >2.
- "## Idioms" - copyable snippets <= 10 lines with captions.
- "## Automatable checks" - deterministic checks with grep/parse pattern + violation condition + evidence sha.
Terse English, no filler. If coverage is thin, say so in the scope note.

Return: doc=${n.doc}, added=<rules written>, merged=0.`,
    { label: `new:${n.eco}`, phase: 'Fold', schema: FOLD_SCHEMA }
  )),
])

const ok = results.filter(Boolean)
log(`fold done: ${ok.length}/${results.length} agents, +${ok.reduce((a,r)=>a+r.added,0)} rules, ${ok.reduce((a,r)=>a+r.merged,0)} merged`)

phase('Verify')
const verify = await agent(
`Re-verify citation coverage of the Gentoo-lessons docs after the residue fold.

With Bash/python:
1. Collect every 7-hex sha cited across /home/zakk/code/memory/gentoo-lessons/*.md.
2. Against the pool /var/tmp/gentoo-analysis/lessons/*.jsonl, compute: cited high / total high, cited med / total med.
3. List up to 10 still-uncited HIGH lessons with their one-line rule (these are accepted losses or next-round work).
4. Sanity-check doc integrity: each doc still has its Title, Rules, Idioms, Automatable checks sections; no duplicated section headers from a bad edit; report per-doc rule counts (grep -c '^- \\*\\*').
Return terse plain text.`,
  { label: 'verify-coverage', phase: 'Verify' }
)

return { fold: ok, verify }
