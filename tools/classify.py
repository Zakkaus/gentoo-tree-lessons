#!/usr/bin/env python3
"""Deterministic commit classifier for the gentoo/gentoo tree.

No AI here on purpose: classification must be cheap, reproducible and
human-checkable. AI is only spent later, analyzing the commits this script
marks non-trivial.

Categories (first match wins, ordered by specificity):
  eclass       - touches eclass/ (high-value lessons)
  profiles     - touches profiles/ only (masks, last-rites, keywording policy)
  qa-explicit  - subject/body mentions QA
  security     - CVE / GLSA / security bug
  fix          - modifies an existing ebuild in place, adds a patch, revbump,
                 or references a bug: the "non-trivial" gold to analyze
  stabilize    - keyword/stable one-liners
  bump         - plain version bump (new ebuild + Manifest, old dropped)
  new-package  - initial add of a package
  drop         - removals only
  meta         - metadata.xml / Manifest-only / whitespace / license sync
  other        - anything else (goes to the analyze pile too, low priority)

Output: JSONL, one object per commit, newest first.
"""
import argparse
import json
import os
import re
import subprocess
import sys

_repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_ap = argparse.ArgumentParser(description="classify gentoo/gentoo commits (deterministic)")
_ap.add_argument("--corpus", default=os.environ.get("GENTOO_CORPUS") or os.path.join(_repo_root, ".corpus"),
                 help="path to a gentoo/gentoo git clone (env GENTOO_CORPUS; default <repo>/.corpus)")
_ap.add_argument("--limit", default=os.environ.get("LIMIT", "60000"), help="git log -N cap")
_ap.add_argument("--since", default=None,
                 help="incremental: a ref (uses <ref>..HEAD) or a date (uses --since=<date>)")
_ap.add_argument("--out", default=None, help="output JSONL path (default: stdout)")
_ap.add_argument("corpus_pos", nargs="?", help=argparse.SUPPRESS)  # back-compat: classify.py <corpus> [limit]
_ap.add_argument("limit_pos", nargs="?", help=argparse.SUPPRESS)
_A = _ap.parse_args()
REPO = _A.corpus_pos or _A.corpus
LIMIT = _A.limit_pos or _A.limit
SINCE = _A.since
OUTPATH = _A.out
FMT = "%x1e%H%x00%cs%x00%an%x00%s%x00%b"

BUG_RE = re.compile(r"(?:bugs\.gentoo\.org/|[Bb]ug #?)(\d{4,7})")
CVE_RE = re.compile(r"CVE-\d{4}-\d+")
PKG_RE = re.compile(r"^([a-z0-9-]+/[A-Za-z0-9_+-]+)")

def sh(*args):
    return subprocess.run(["git", "-C", REPO, *args], capture_output=True, text=True).stdout

def main():
    # %x00-separated fields, %x1e between commits; --name-status for file ops.
    # --since: a ref does <ref>..HEAD (only new commits); a date does --since=<date>.
    log_args = ["log", f"--format={FMT}", "--name-status"]
    if SINCE and re.fullmatch(r"[0-9a-fA-F]{7,40}", SINCE):
        log_args.insert(1, f"{SINCE}..HEAD")
    elif SINCE:
        log_args.insert(1, f"--since={SINCE}")
    else:
        log_args.insert(1, f"-{LIMIT}")
    raw = sh(*log_args)
    out = open(OUTPATH, "w") if OUTPATH else sys.stdout
    n = 0
    for chunk in raw.split("\x1e"):
        chunk = chunk.strip("\n")
        if not chunk:
            continue
        head, _, files_blob = chunk.partition("\n")
        parts = head.split("\x00")
        if len(parts) < 5:
            continue
        sha, date, author, subject, body = parts[0], parts[1], parts[2], parts[3], parts[4]
        files = []           # (status, path)
        for line in files_blob.splitlines():
            if not line.strip():
                continue
            cols = line.split("\t")
            if len(cols) >= 2:
                files.append((cols[0], cols[-1]))

        paths = [p for _, p in files]
        text = subject + "\n" + body
        bugs = sorted(set(BUG_RE.findall(text)))
        cves = sorted(set(CVE_RE.findall(text)))
        m = PKG_RE.match(subject)
        pkg = m.group(1) if m else ""

        ebuild_mod = [p for s, p in files if s.startswith("M") and p.endswith(".ebuild")]
        ebuild_add = [p for s, p in files if s.startswith("A") and p.endswith(".ebuild")]
        ebuild_del = [p for s, p in files if s.startswith("D") and p.endswith(".ebuild")]
        patch_add  = [p for s, p in files if s.startswith("A") and "/files/" in p]
        eclass     = [p for p in paths if p.startswith("eclass/")]
        profiles   = [p for p in paths if p.startswith("profiles/")]
        only_meta  = paths and all(
            p.endswith(("metadata.xml", "Manifest")) or p.endswith(".md") for p in paths
        )
        subj_l = subject.lower()

        if eclass:
            cat = "eclass"
        elif cves or "security" in subj_l or "glsa" in subj_l:
            cat = "security"
        elif re.search(r"\bQA\b", text):
            cat = "qa-explicit"
        elif profiles and len(profiles) == len(paths):
            cat = "profiles"
        elif patch_add or (ebuild_mod and not ebuild_add):
            # in-place edit of an existing ebuild, or a new patch: a fix —
            # unless it's a keywording one-liner
            if re.search(r"\b(stable|keyword|stabiliz)", subj_l) and not patch_add:
                cat = "stabilize"
            else:
                cat = "fix"
        elif ebuild_add and ("new package" in subj_l or "initial" in subj_l
                             or not ebuild_mod and not ebuild_del and "add" in subj_l and "drop" not in subj_l
                             and len([p for p in paths if p.endswith("metadata.xml")]) > 0):
            cat = "new-package"
        elif ebuild_add:
            # add (+ maybe drop): a bump; but a bump WITH a message reason
            # (revbump, fix wording, bug ref) is still worth analyzing
            if bugs or re.search(r"\b(fix|revbump|rev bump|-r\d+)\b", subj_l):
                cat = "fix"
            else:
                cat = "bump"
        elif ebuild_del and not ebuild_add:
            cat = "drop"
        elif only_meta:
            cat = "meta"
        elif bugs or re.search(r"\bfix", subj_l):
            cat = "fix"
        else:
            cat = "other"

        rec = {
            "sha": sha, "date": date, "author": author, "subject": subject,
            "category": cat, "pkg": pkg, "bugs": bugs, "cves": cves,
            "nfiles": len(files),
            "patch_add": len(patch_add), "ebuild_mod": len(ebuild_mod),
        }
        out.write(json.dumps(rec, ensure_ascii=False) + "\n")
        n += 1
    print(f"classified {n} commits", file=sys.stderr)

if __name__ == "__main__":
    main()
