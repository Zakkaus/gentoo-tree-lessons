#!/usr/bin/env python3
import json, glob, os, py_compile, sys
errs = []
for f in ["data/lessons.jsonl", "data/commits.jsonl"]:
    if os.path.exists(f):
        for i, l in enumerate(open(f), 1):
            if l.strip():
                try: json.loads(l)
                except Exception as e: errs.append(f"{f}:{i}: {e}"); break
for doc in glob.glob("docs/*.md"):
    if os.path.getsize(doc) == 0: errs.append(f"{doc}: empty")
for s in glob.glob("tools/*.py"):
    try: py_compile.compile(s, doraise=True)
    except Exception as e: errs.append(f"{s}: {e}")
print("\n".join(errs) or "check ok: data parses, docs non-empty, tools compile")
sys.exit(1 if errs else 0)
