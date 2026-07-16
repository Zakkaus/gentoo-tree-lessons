CORPUS     ?= .corpus
GENTOO_URL ?= https://github.com/gentoo/gentoo.git
DEPTH      ?= 60000

.PHONY: refresh corpus classify manifest check mine help
help: ## show targets
	@grep -E '^[a-z]+:.*##' Makefile | sed -E 's/:.*## / -- /'
refresh: corpus classify manifest ## update corpus, reclassify, record provenance
corpus: ## shallow clone or update the gentoo tree into $(CORPUS)
	@if [ -d $(CORPUS)/.git ]; then git -C $(CORPUS) fetch --depth=$(DEPTH) origin master && git -C $(CORPUS) reset --hard FETCH_HEAD; \
	else git clone --depth=$(DEPTH) --single-branch --branch master $(GENTOO_URL) $(CORPUS); fi
classify: ## regenerate data/commits.jsonl from the corpus
	python3 tools/classify.py --corpus $(CORPUS) --limit $(DEPTH) --out data/commits.jsonl
manifest: ## record the corpus revision the data was built from
	python3 tools/provenance.py --corpus $(CORPUS) --commits data/commits.jsonl --out data/PROVENANCE.json
check: ## validate committed data + docs (what CI runs; no corpus needed)
	python3 tools/check.py
mine: ## (re)mine lessons -- needs the Claude Code harness
	@echo "Run: Workflow({scriptPath: workflows/mining.js})  then  workflows/residue-fold.js  (see docs/MINING.md)"
