#!/usr/bin/env python3
"""Record which corpus revision the classified data was built from, so a refresh
is reproducible and diffable."""
import argparse, json, subprocess, collections
p = argparse.ArgumentParser()
p.add_argument("--corpus", required=True); p.add_argument("--commits", required=True)
p.add_argument("--out", required=True)
a = p.parse_args()
g = lambda *x: subprocess.run(["git", "-C", a.corpus, *x], capture_output=True, text=True).stdout.strip()
cats = collections.Counter(); n = 0
for l in open(a.commits):
    if l.strip():
        try: cats[json.loads(l)["category"]] += 1; n += 1
        except Exception: pass
json.dump({"corpus": "gentoo/gentoo", "corpus_head": g("rev-parse", "HEAD"),
           "corpus_head_date": g("show", "-s", "--format=%cs", "HEAD"),
           "classified": n, "categories": dict(cats.most_common()),
           "classifier": "tools/classify.py"}, open(a.out, "w"), indent=1)
print("provenance ->", a.out)
