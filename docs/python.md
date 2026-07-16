# Python ecosystem packaging lessons (mined from gentoo/gentoo)

Distilled from 705 mined lesson records over two passes (all high/med value) covering distutils-r1/PEP517 usage, PYTHON_COMPAT bumps (the py3.15 and free-threading rollouts supplied most evidence), pytest/EPYTEST idioms, setuptools-scm/pypi-eclass sourcing, and dependency pinning. Shas refer to the gentoo/gentoo repo. Intended use: reference when bumping/adding dev-python packages in gentoo-zh, and as ground truth for a future deterministic QA scan.

## Rules

- **Always declare EPYTEST_PLUGINS explicitly (empty array `()` if the suite needs none) before `distutils_enable_tests pytest`; this disables plugin autoloading and generates the plugin BDEPENDs. Replace hand-written `test? ( dev-python/<plugin> )` blocks and custom `python_test()` bodies that only export PYTEST_DISABLE_PLUGIN_AUTOLOAD or pass `-p` flags.** (181) - evidence: d0452a5 dev-python/rply (autoloaded system plugins caused spurious failures); f8f8f38 dev-python/flask-login (whole python_test override replaced by one variable); c1ca843 dev-python/natsort (manual test? BDEPEND migrated to EPYTEST_PLUGINS); d38c56b dev-python/trio-websocket (override doing autoload-off + -p + deselects collapsed to globals).
- **Roll PYTHON_COMPAT as a sliding window: when a new CPython target lands, extend the brace range and drop EOL/retired impls (old python3_NN, stale pypy3_*) in the same one-line edit, only after the test suite passes on the new interpreter, and never revbump for a COMPAT-only change.** (116) - evidence: 545def9 dev-python/smmap (`python3_{11..14}` -> `python3_{12..15}`); 873a6d7 dev-python/yapf (same rotation dropping pypy3_11); f865e76 dev-python/tomlkit (stale mixed list pruned on touch); 49ffb27 dev-python/python-ironicclient (deps-first bottom-up through the chain).
- **Free-threaded (no-GIL) targets are opt-in and separate: the numeric brace range does NOT cover them; append `python3_{14,15}t` explicitly, only after running tests on a freethreaded build, working leaf-first up the dependency graph. For DISTUTILS_EXT=1 packages first verify upstream ships cp3XXt wheels / declares Py_mod_gil.** (77) - evidence: f36f726 dev-python/dependency-groups (brace range gotcha stated explicitly); f8096bf dev-python/coverage (leaf-first ordering); 922a59c dev-python/lxml (C-extension pre-check before adding t targets); 3b32059 dev-python/pynacl (t entries are separate list items when sliding the window); c9dc405 dev-python/async-timeout (verify every runtime dep lists the t targets first).
- **The DISTUTILS_USE_PEP517 value must match pyproject.toml's build-backend and use the -core package name: flit->flit-core, poetry->poetry-core; the short aliases pull the full frontend tool as BDEPEND and are fatal in EAPI 9. Re-verify on every bump instead of copying forward.** (80) - evidence: be58ce7 eclass/distutils-r1 (EAPI-9 gate on old spellings); 658a4a9 dev-python/threadpoolctl (flit -> flit-core); 11c8f81 dev-python/jsonschema-path (poetry -> poetry-core); 6b5154c dev-python/pkgconfig (also flit_scm -> flit-scm, jupyter -> jupyter-packaging).
- **When a new Python breaks the package, backport the upstream fix as a FILESDIR patch with the upstream PR/commit URL in a comment above the PATCHES entry (or as line 1 of the patch). Revbump only if installed files change; test-only patches need no revbump. Check upstream master before writing your own patch.** (61) - evidence: 4dc474d dev-python/genshi (py3.15 ast hard error, PR URL cited, revbump); 4b96894 dev-python/resolvelib (test-only patch, no revbump); c075123 dev-python/pyquery (fix already on upstream master, backported verbatim); ee1b11d dev-python/cherrypy (prefer the upstream xfail/skip commit over a local deselect); feb5ddd dev-python/frozenlist (upstream skip-list commit instead of EPYTEST_DESELECT).
- **Every PYTHON_COMPAT change must re-audit all `python_gen_cond_dep` calls: their hardcoded impl lists do not grow with COMPAT, silently dropping deps on new interpreters; unwrap `'python*'` guards once pypy leaves COMPAT; extend stdlib-removal backport ranges (legacy-cgi, audioop-lts) to the new version; inline deps whose condition now matches every impl.** (47) - evidence: be92bfa dev-util/babeltrace (setuptools dep keyed to python3_12 only, silently missing on 3.13/3.14); 60381f2 dev-python/webtest (legacy-cgi range had to reach 3.15); b72dd75 dev-python/cryptography (no-op 'python*' wrapper removed); a930163 sys-process/audit (flattening to unconditional dep is a revbump).
- **To ship a package on a new interpreter before its tests/test-deps are ready, split `PYTHON_TESTED=( subset )` from `PYTHON_COMPAT=( "${PYTHON_TESTED[@]}" python3_XX )`, gate test BDEPEND via `python_gen_cond_dep ... "${PYTHON_TESTED[@]}"` and short-circuit python_test outside the subset. Promote the impl and delete the scaffolding once green - it must not be carried forever.** (35) - evidence: 508a2a5 dev-python/pytest (bootstrap-chain package installable weeks before testable); f5a59eb dev-python/uvicorn (full pattern); a6ea95c dev-python/uvicorn (scaffolding removed after 3.15 became testable); fcdce26 dev-python/pytest (adding to COMPAT is step one - promote into PYTHON_TESTED or the impl ships untested forever).
- **Deselect impl-specific test failures with `case ${EPYTHON} in python3.XX*)` appending to EPYTEST_DESELECT inside python_test, with an upstream-issue comment - never RESTRICT tests, sed-delete test code, or deselect globally for all impls. Declare the arrays local, use version-range globs (`python3.1[45]*`) or `;&` fall-through for failures spanning versions, and `python*t)` branches for freethreaded-only failures (ABI/wheel-tag tests).** (30) - evidence: 98188b5 dev-python/lazy-object-proxy (fragile seds replaced by case block); 45a13e7 dev-python/parso (exception-wording tests deselected on 3.15 only); dd415af dev-python/rich (dead pypy branch removed when impl dropped); 3f10f8f dev-python/mypy-extensions (range glob); 089942f dev-python/et-xmlfile (;& fall-through); 28dcb0b dev-python/poetry-core (t-only guard).
- **Dropping an impl from PYTHON_COMPAT is a multi-site cleanup: grep the ebuild for EPYTHON case branches, impl-specific EPYTEST_DESELECT lists, python_gen_cond_dep wrappers and patches that only served it, and delete them in the same commit.** (22) - evidence: 92cfb9e dev-python/ensurepip-pip (dead pypy3* case block lingered); 218efbc dev-python/frozenlist (dep string and phase function both carried dead branches); 07ab49f dev-python/re-assert; 6aeeb09 dev-python/pyflakes.
- **Use EPYTEST_XDIST=1 for parallel-safe suites, EPYTEST_RERUNS=N for flaky ones, EPYTEST_TIMEOUT as needed - and set every EPYTEST_* knob BEFORE `distutils_enable_tests`, which converts them into test deps at call time; setting them after silently loses the dependency. When TIMEOUT and RERUNS combine and tests hang, pass `-o timeout_func_only=true`; EPYTEST_* is pytest-only - delete the knobs when distutils_enable_tests uses another runner.** (23) - evidence: 450f590 dev-python/apscheduler (EPYTEST_RERUNS after the call -> missing pytest-rerunfailures dep); a6181e4 dev-python/terminado (manual --reruns flags replaced); 3583884 dev-python/aioquic (XDIST opt-in); c74f0db eclass/python-utils-r1 (timeout_func_only); 4d9e7e7 dev-python/pykeepass (EPYTEST_* under unittest runner deleted).
- **For setuptools-scm/hatch-vcs projects prefer the PyPI sdist (`inherit pypi`) over forge tarballs: it eliminates SETUPTOOLS_SCM_PRETEND_VERSION exports, MY_P/S overrides; set PYPI_NO_NORMALIZE=1 if the project name is not PEP 503-normalized, and PYPI_VERIFY_REPO=<repo> when upstream publishes attestations. A stale PRETEND_VERSION export on an sdist-fetched package is dead code - delete it.** (21) - evidence: 1f262db dev-python/varlink (GH tarball + 3 hacks -> plain pypi); e82d487 dev-python/flatdict (PYPI_VERIFY_REPO added); 5f83c2b dev-python/pytest-testinfra (stale export dropped); 963cb0f dev-python/txaio (PYPI_VERIFY_REPO added on a routine COMPAT bump).
- **Exception: if the PyPI sdist omits the test suite, fetch the GitHub tag tarball as `${P}.gh.tar.gz` and leave a comment stating why.** (3) - evidence: 19bd910 dev-python/websockets ("tests are missing pypi sdist, as of 16.0"); 42b7c1d dev-python/msgspec.
- **Gate environment-dependent test deselects on `has_version` (optional deps, USE flags of installed deps) inside python_test instead of skipping unconditionally or keeping hardcoded tested-impl lists.** (20) - evidence: 98674e7 dev-python/versioningit (has_version replaced a duplicated PYTHON_FULLY_TESTED list); cb84089 app-arch/patool (deselect only when `app-arch/rpm[-sequoia]`); 05cb888 dev-python/gitdb (exact-compressed-bytes test vs sys-libs/zlib-ng[compat]).
- **Use EPYTEST_IGNORE for files/dirs that fail at collection/import time (missing optional deps, docs/ dirs), EPYTEST_DESELECT for individual tests that collect fine but fail at runtime; deselecting a whole file usually means IGNORE was intended.** (16) - evidence: bb236a8 dev-python/pytest-regressions (DESELECTed file still errored at collection); ceb59a6 dev-python/click-threading (`EPYTEST_IGNORE=( docs )`); 82682d3 dev-python/multidict (sandbox-hostile isolated/subprocess/benchmark dirs IGNOREd, not patched).
- **Set DISTUTILS_EXT=1 in any distutils-r1 ebuild compiling extension modules (setuptools ext, cython, cffi); from EAPI 9 the missing setting is fatal, not just a QA notice.** (13) - evidence: 8946c7a eclass/distutils-r1 (QA notice became die); c9cabbe dev-python/python-augeas.
- **Pytest-plugin packages must declare themselves: `EPYTEST_PLUGINS=( "${PN}" )` plus `EPYTEST_PLUGIN_LOAD_VIA_ENV=1` (also propagates plugins into nested pytest subprocesses).** (14) - evidence: 611c702 dev-python/pytest-import-check; 27addf7 dev-python/pytest-trio; 656a8b7 dev-python/inline-snapshot (subprocess-spawning suite); 0e3909e dev-python/pytest-tornasync (replaces hand-passed -p with internal module path).
- **Never list dev-python/pytest manually in BDEPEND when `distutils_enable_tests pytest` is used - the eclass adds it; conversely, keep the `distutils_enable_tests` call even when defining a custom python_test(), or the pytest BDEPEND and test USE plumbing disappear.** (8) - evidence: 47454fe dev-python/requests-mock (duplicate dep removed); bd7c22b dev-python/tpm2-pytss (missing call broke clean-chroot builds, bug 979004).
- **If the package or its tests import pkg_resources, add an explicit dev-python/pkg-resources[${PYTHON_USEDEP}] dep (RDEPEND if runtime import, test BDEPEND otherwise) - modern setuptools no longer provides it; revbump when adding the runtime dep.** (9) - evidence: c4cda74 dev-python/libsass (runtime ModuleNotFoundError, bug 978189); 846bb49 dev-python/python-lzo (test failure, bug 978315); a2cb418 dev-python/deprecated.
- **Prune dead impls from PYTHON_COMPAT and stale patterns from python_gen_cond_dep before bumping to EAPI 9 - obsolete values are silently ignored in EAPI 7/8 but die in EAPI 9.** (2) - evidence: 5d00c0a eclass/python-utils-r1 (eclass gained the fatal check); 372d7c3 eclass/python-utils-r1 (audit overlays after the tree drops an impl - breakage only surfaces when no supported impl is left).
- **Every dev-python/* dep in a python-r1/python-single-r1 consumer must carry `[${PYTHON_USEDEP}]` (via python_gen_cond_dep for single-impl); depending on another package's bindings needs `[python,${PYTHON_USEDEP}]`. Fixing a missing usedep is a revbump.** - evidence: bd20876 dev-ruby/rbst (bare dev-python/docutils could be installed for the wrong impl).
- **To unpin upper-bounded deps in a PEP517 package, sed the caps out of pyproject.toml in python_prepare_all (revbump: runtime dep range changes); for apps enforcing pip-style pins at runtime, patch the in-source pin list to the ranges the ebuild depends on.** - evidence: 728ad4e dev-python/sphinx (`sed -e 's:,<[0-9.]*::' pyproject.toml`); 303307b dev-embedded/platformio (runtime dependencies.py pins).
- **When pytest itself is bumped a major version, expect known migrations: removed conftest hook signatures (`pytest_report_header(startdir)`), py.path -> pathlib collection hooks, list-wrapping of parametrize argvalues, duplicate parametrization IDs needing `pytest.param(..., id=)`.** (6) - evidence: 36b4ac4 dev-python/html5lib (pytest 9 migrations, bug 976747); 80ce5a2 dev-python/apipkg; f8c9833 dev-python/fritzconnection.
- **New-CPython test breakage has recurring signatures: tests string-matching exception messages, removed unittest camelCase aliases (sed `s:assertEquals:assertEqual:` in src_prepare), removed stdlib APIs (SourceFileLoader.load_module, glob.glob1), site/.pth semantics changes, multiprocessing fork->forkserver flakiness on 3.14+.** (7) - evidence: f34b56e dev-python/extras (assertEquals sed); 16d8f52 dev-util/pkgcheck (load_module port); 7e09f22 dev-python/django (set_start_method("fork")); e121a29 dev-python/python-glanceclient (exception-message match); dd9f003 dev-python/pip + 5184798 dev-python/ensurepip-pip (site/.pth semantics in installers/venv tools).
- **PyO3/maturin packages refusing a brand-new CPython ("interpreter version is newer than PyO3's maximum supported") build fine with `export PYO3_USE_ABI3_FORWARD_COMPATIBILITY=1` - do not hold back the target.** (2) - evidence: 4ab34a0 dev-python/regress; 7f9b3b0 dev-python/jellyfish.
- **When tests fail only because upstream's pytest config escalates warnings to errors (`filterwarnings=error`, typical of jaraco.* packages), neutralize at runtime with `epytest -o filterwarnings=` instead of adding deps or patching.** (2) - evidence: d85cb47 dev-python/portend; cf0e354 dev-python/aiohttp (ini filterwarnings pulled optional modules at collection).
- **Scripted/mass COMPAT sweeps must touch only the ebuild version actually tested (usually the newest); accidental enables on old versions get an immediate revert. Keep -9999/live ebuilds and build-variant twins in sync in the same commit.** - evidence: 958a764 dev-python/gast (old 0.6.0 reverted); 45cec44 sys-libs/libsemanage (live ebuild lagged); 0d7736e sys-devel/rust-std (twin drift).
- **When skipping pytest tests via PYTEST_ADDOPTS (e.g. under meson_src_test where EPYTEST_DESELECT is unavailable), combine all exclusions into ONE `-k 'not a and not b'` expression - repeated -k flags silently override each other.** - evidence: 05ef15e dev-python/pygobject.
- **Heavy test-only dep trees (rust-pulling plugins) get a dedicated `test-*` USE flag with has_version branching in python_test; when a test dep lags a new impl, gate it with python_gen_cond_dep windows and remove the gating the moment the dep catches up; each lagging dep gets its own window (conditionals nest fine inside the quoted argument), and a has_version-guarded local EPYTEST_PLUGINS extension loads the plugin only where its dep exists.** (7) - evidence: bd5da15 dev-python/jeepney (test-rust flag); 1466304 dev-python/httpx (trio gating deleted once trio supported 3.15); c29269d dev-python/aiohttp (per-dep windows during 3.15 rollout); 442705e dev-python/httpcore (guarded plugin-array extension).
- **Python used only as a build-time tool is python-any-r1 territory: `python_gen_any_dep` in USE-gated BDEPEND plus a python_check_deps() that returns 0 for unaffected builds - always end python_check_deps with an explicit `return 0`, probing with `|| return 1`, never the incidental status of the last statement.** (2) - evidence: f22b1cc app-admin/conky; 6bc3282 sys-power/power-profiles-daemon.

### Pytest invocation & test environment

- **When upstream pyproject/setup.cfg addopts force coverage or other unwanted plugins, neutralize at invocation with `epytest -o addopts=` (preferred over sedding the config); sed only when the config keys themselves are broken or over-strictly parsed, with `|| die` and an upstream-fix comment.** (4) - evidence: 1a26844 dev-python/ini2toml (-o addopts= over src_prepare sed); 5d3c16c dev-python/expandvars; 506ebe7 dev-python/python-pam (broken keys stripped by sed).
- **Annotate every EPYTEST_DESELECT entry with its cause (upstream issue URL, "Internet", the warning name) so it can be revisited, and deselect - never RESTRICT=test - individual network/sandbox-incompatible tests.** (4) - evidence: bad1d14 dev-python/cffi (network tests, issue linked); 379b950 dev-python/paste (DeprecationWarning named); 817e91a dev-python/mechanicalsoup; 254a793 dev-python/openpyxl.
- **Suites needing live services: patch pytest.skip into the shared fixtures instead of deselecting dozens of tests one by one.** - evidence: b12ba97 dev-python/apscheduler.
- **Host-environment-sensitive suites: pin `LC_ALL=C.UTF-8` for locale-dependent tests (musl locales are partial - collation tests fail there regardless), run GSettings/D-Bus consumers under dbus-run-session (composable with virtx; dbus/dconf in test BDEPEND), neuter unfixable host-dependent tests by underscore-renaming the method via sed, and patch out phone-home defaults in desktop apps.** (4) - evidence: 6638d48 + fca2c67 + 1b6f263 sys-apps/bleachbit; da78f62 app-misc/khard (musl collation).
- **When different parts of a suite need different plugin sets, scope `local EPYTEST_PLUGINS=( ... )` between epytest calls inside python_test instead of juggling `-p no:plugin`.** - evidence: a76968b dev-python/flaky.
- **Extra pytest options go through a python_test() calling `epytest <opts>`; never append arguments to a phase-function call like `distutils-r1_src_test`.** - evidence: 977b141 media-video/yle-dl.
- **Tests that shell out to pip or import setuptools/pkg_resources need setuptools declared as a test dep, and pip invocations must run with `--no-build-isolation` (build backend pre-installed as test dep) so nothing touches the network.** (2) - evidence: 2e0ce21 + 5e38e45 dev-python/argcomplete.
- **has_version checks on python deps must be usedep-qualified - `has_version "dev-python/foo[python_targets_${EPYTHON/./_}(-)]"` - or they misfire on impls the dep was not built for; the `(-)` default keeps the query safe when the flag is absent.** (2) - evidence: 79dccd2 app-admin/pass-import; 7379aff eclass/python-utils-r1.

### Dependencies, keywording & ecosystem propagation

- **When a dependency drops a Python impl, immediately trim that impl from all reverse dependencies' PYTHON_COMPAT instead of waiting for resolver failures.** - evidence: 2268376 dev-python/pycurl-requests.
- **Core-tooling packages: when an older ebuild version still carries keywords the newest lacks (or is kept alive as another package's test dep), extend its PYTHON_COMPAT for new interpreters too - untested is acceptable there - or lagging arches/dependents stay blocked.** (2) - evidence: f62cea5 dev-python/setuptools-scm; 2ccc790 dev-python/setuptools (freethreading targets included).
- **Dekeywording is chain-wide: sweep the entire reverse-dependency graph in one batch under the same Bug: reference; likewise dekeyword any arch where a newly added dep lacks keywords.** (2) - evidence: 1156937 dev-python/jupyterlab-server; f1f62ea net-mail/b4.
- **When a new release of a test runner or host application breaks the package, cap the dep (`<pkg-version`) immediately with an upstream-issue comment instead of waiting for a fix.** (2) - evidence: 880d94d dev-python/flask (pytest capped in test BDEPEND); dec3461 dev-vcs/hg-git (mercurial cap on extension).
- **A test/USE-conditional dep pulling a profile-masked stack (rust etc.) needs that USE flag masked in the corresponding profile package.use.mask in the same commit.** - evidence: 8f3a782 dev-python/opentelemetry-sdk.
- **Package<->plugin dependency cycles: check whether upstream made the plugin optional and drop the parent-to-plugin RDEPEND instead of hacking around with use-conditionals.** - evidence: f3f945f dev-python/poetry.
- **When a dep splits major versions into slots, pin the slot whose API the package actually imports, and audit every live ebuild version, not just the newest.** - evidence: 75d19a1 www-apps/roundup.
- **After any bump or new-impl enable, actually run the test suite and add every newly-imported module to the test? ( ) BDEPEND with [${PYTHON_USEDEP}].** - evidence: 5983482 dev-python/fastapi.
- **When an eclass exports a dep-string/REQUIRED_USE pair (POSTGRES_DEP/POSTGRES_REQ_USE, PYTHON_DEPS/PYTHON_REQUIRED_USE), set both - the dep string alone does not enforce target selection.** - evidence: d35fa11 dev-python/pygresql.
- **Split binding stacks (bindings + their generated runtime/sip module) keep PYTHON_COMPAT identical and bump together; enable package families bottom-up (libs/kernels first, app, then plugins), one commit per package referencing the tracker bug.** (2) - evidence: 8f931f3 dev-python/pyqt6-sip; 8d37bd0 dev-python/spyder.
- **In dep-template strings that are post-processed (python_gen_cond_dep bodies, single-impl PYTHON_USEDEP substitution), escape or single-quote the placeholder when the surrounding string must expand other variables immediately - mixed immediate/deferred expansion is a classic bug.** - evidence: 3ad0072 eclass/distutils-r1.

### Patching & upstream breakage

- **For C-extension breakage on a new CPython, check Fedora rawhide dist-git for a ready-made patch first; a C-API declaration removed from headers but kept in the stable ABI can be forward-declared under a PY_VERSION_HEX guard, and reverting a half-adopted C-API feature (as Fedora does) is a legitimate fix - carry it with provenance URLs and revbump since binaries change.** (2) - evidence: d8ac5c4 dev-python/pyqt6; 27e872e dev-python/dbus-python.
- **numpy-2 C-API: undeclared NPY_* macros mean the NPY_X -> NPY_ARRAY_X rename (IN_ARRAY, ALIGNED, ENSURECOPY, ...); a sed in src_prepare beats carrying a patch.** - evidence: d0dc560 sci-chemistry/MDAnalysis.
- **New setuptools rejecting license classifiers wants the metadata patched to an SPDX license expression (backport the upstream fix), not an old-setuptools pin.** - evidence: 4a3adc6 dev-python/btrfs.
- **Patch/hack hygiene: on every touch re-verify carried seds, patches, and dep-mirroring hacks against current upstream and delete the obsolete ones (citing the upstream change); consolidate multiple patches touching the same subsystem into one minimal patch so bumps rebase cleanly.** (3) - evidence: 541c424 dev-python/pypillowfight; 4e6088e dev-python/pip; 4d7d46a dev-python/babel.
- **A patch exceeding the FILESDIR size limit becomes a compressed SRC_URI distfile eapply'd from WORKDIR; when packaging a subproject of a bigger tarball, point S at the subdirectory and reproduce the tiny build glue the parent build system would have generated.** - evidence: 51dc287 dev-util/gdbus-codegen.
- **When a system dependency's major upgrade breaks a consumer bundling its own copy, unbundle (build against system libs) and backport the upstream compat commit with its URL recorded; revbump.** - evidence: 2295224 dev-python/tables.
- **Namespace-package leftovers (!dev-python/namespace-* blockers, .pth-deleting phase overrides, distutils_write_namespace) are removable legacy once the package uses PEP 420 native namespaces - verify tests pass without and delete.** (2) - evidence: e774c5c dev-python/sphinxcontrib-apidoc; 01cde9a dev-python/pastedeploy.

### Build systems, install phases & cross-compilation

- **Never put non-idempotent ${ED} file moves/removals in python_install (it runs once per impl); do them in python_install_all so they execute exactly once.** - evidence: d7de896 dev-python/dkimpy-milter.
- **distutils_enable_sphinx arguments must match docs/conf.py (html_theme, extensions) exactly - read it when a USE=doc build fails on a missing theme/extension; recommonmark usages migrate to myst-parser.** (2) - evidence: 1b904bf dev-python/python-engineio; f00e2a3 dev-python/pylibacl.
- **sip-build ignores toolchain environment variables; pass flags explicitly as `--qmake-setting 'QMAKE_CFLAGS/CXXFLAGS/LFLAGS += ...'`.** - evidence: 93f199e app-editors/qhexedit2.
- **When an upstream build script pulls a niche pure-parsing dep, patch it to the stdlib equivalent (tomllib for TOML) instead of packaging the dep; when mixing two build-system eclasses, explicitly chain each eclass's phase function in every overridden phase.** - evidence: a5dd465 dev-python/pythonnet.
- **CMake packages that build python bindings without installing them: pin Python_EXECUTABLE to ${PYTHON} and install the built .so yourself with python_moduleinto + python_domodule from ${BUILD_DIR}.** - evidence: 966f837 sys-fs/android-file-transfer-linux.
- **Non-distutils ebuilds wrapping build systems that shell out to python packaging tools (python -m build, pip, installer) must BDEPEND on those tools explicitly - no eclass adds them.** - evidence: f58511a sys-apps/selinux-python.
- **Configure scripts probing for python-config (especially via which): pre-seed with `export PYTHON_CONFIG=$(python_get_PYTHON_CONFIG)` in src_configure; in general export cache/override variables instead of patching probe logic.** - evidence: d744a30 app-editors/bluefish.
- **Any path fed to the compiler or linker (include dirs, lib dirs) must be prefixed with ESYSROOT (BROOT for build-tool assets), never ROOT - ROOT is only for pkg_* phase runtime paths.** - evidence: 5e8eafc app-admin/setools.
- **Completions or other assets only the built program can emit: generate in src_compile via sysroot_try_run_prefixed (cross-safe) and install with the shell-completion eclass helpers.** - evidence: a602fff net-mail/b4.
- **Qt tools executed at build time (qmake, moc, rcc): obtain the path with `qt_get_broot_binary <ver> <tool>`, not by composing qt6_get_bindir, so cross builds pick the build-host binary.** - evidence: 35e1661 dev-python/pyqt6-webengine.
- **A USE flag that only toggles runtime-import Python deps without changing what gets built should be optfeature in pkg_postinst instead.** - evidence: 9bada80 app-admin/setools.
- **A package rename is atomic: profiles/updates `move old new` entry + directory rename + all revdep atom updates in one commit - without the updates entry Portage cannot migrate installed systems.** - evidence: 07d0c5f dev-python/libpass.

## Idioms

Hermetic pytest with plugins, parallelism and reruns (order matters - knobs before the call):
```bash
EPYTEST_PLUGINS=( pytest-mock pytest-timeout )   # =() if none needed
EPYTEST_XDIST=1
EPYTEST_RERUNS=5
distutils_enable_tests pytest
```

Pytest-plugin package testing itself (survives nested pytest subprocesses):
```bash
EPYTEST_PLUGINS=( "${PN}" )
EPYTEST_PLUGIN_LOAD_VIA_ENV=1
distutils_enable_tests pytest
```

Per-interpreter deselects, self-documented:
```bash
python_test() {
	local EPYTEST_DESELECT=()
	case ${EPYTHON} in
		python3.15*)
			EPYTEST_DESELECT+=(
				# https://github.com/upstream/pkg/issues/NNN
				tests/test_foo.py::test_bar
			)
			;;
	esac
	epytest
}
```

Ship on a new impl before tests are trusted (PYTHON_TESTED split):
```bash
PYTHON_TESTED=( python3_{12..14} )
PYTHON_COMPAT=( "${PYTHON_TESTED[@]}" python3_15 )
BDEPEND="test? ( $(python_gen_cond_dep '
	dev-python/pytest[${PYTHON_USEDEP}]
' "${PYTHON_TESTED[@]}") )"
python_test() {
	has "${EPYTHON/./_}" "${PYTHON_TESTED[@]}" || { einfo "Skipping ${EPYTHON}"; return; }
	epytest
}
```

Optional-dep test gating:
```bash
if ! has_version "dev-python/pillow[${PYTHON_USEDEP}]"; then
	EPYTEST_IGNORE+=( tests/test_image_regression.py )  # fails at collection
fi
```

Backported patch with provenance:
```bash
PATCHES=(
	# https://github.com/upstream/pkg/pull/1234
	"${FILESDIR}/${P}-py315.patch"
)
```

Unpin upper bounds in pyproject.toml:
```bash
python_prepare_all() {
	sed -i -e 's:,<[0-9.]*::' pyproject.toml || die
	distutils-r1_python_prepare_all
}
```

PyO3 on a too-new CPython:
```bash
export PYO3_USE_ABI3_FORWARD_COMPATIBILITY=1
```

Usedep-qualified has_version (bare atoms misfire per-impl):
```bash
if has_version "dev-python/pillow[python_targets_${EPYTHON/./_}(-)]"; then
```

Neutralize hostile upstream pytest config at invocation:
```bash
epytest -o addopts= -o filterwarnings=
```

Different plugin sets per epytest call:
```bash
python_test() {
	local EPYTEST_PLUGINS=()
	epytest tests/core
	local EPYTEST_PLUGINS=( pytest-asyncio )
	epytest tests/async
}
```

Free-threading enable (brace range never covers t):
```bash
PYTHON_COMPAT=( python3_{12..15} python3_{14,15}t )
# or compactly when both variants exist for a range:
PYTHON_COMPAT=( python3_12 python3_{13..15}{,t} )
```

## Automatable checks

- **EPYTEST_* set after distutils_enable_tests**: parse ebuild line order; any `EPYTEST_(PLUGINS|RERUNS|TIMEOUT|XDIST)=` assignment on a line after `distutils_enable_tests` is a violation (dep generation already happened). Evidence: 450f590.
- **pytest without hermetic plugins**: `distutils_enable_tests pytest` present but no `EPYTEST_PLUGINS=` anywhere in the ebuild -> flag for autoloading nondeterminism. Evidence: d0452a5, a9bdcf3.
- **Superseded python_test boilerplate**: grep for `PYTEST_DISABLE_PLUGIN_AUTOLOAD` or `epytest -p ` in ebuilds; both are superseded by EPYTEST_PLUGINS. Evidence: f8f8f38, ce15eef.
- **Deprecated PEP517 backend aliases**: `DISTUTILS_USE_PEP517=(flit|poetry|flit_scm|jupyter)$` (exact match, not -core) is a violation; fatal in EAPI 9. Cross-check against `build-backend` in the sdist's pyproject.toml. Evidence: be58ce7, 658a4a9.
- **Dead impls in PYTHON_COMPAT**: any of `python3_11` (or older), unversioned `pypy3`, `pypy3_11`, `python3_13t` still listed -> silently ignored now, fatal at EAPI 9 bump. Evidence: 5d00c0a, 89c4ea3.
- **Stale python_gen_cond_dep lists**: for each `python_gen_cond_dep` call, compare its impl list/pattern against PYTHON_COMPAT: pattern matching every impl (e.g. `'python*'` with no pypy in COMPAT) -> should be unconditional; listed versions missing the newest COMPAT member -> dep silently dropped there. Evidence: b72dd75, be92bfa, 60381f2.
- **Dead EPYTHON branches**: `case ${EPYTHON}` branches or EPYTEST_DESELECT blocks naming impls (pypy3*, python3.NN) absent from PYTHON_COMPAT. Evidence: 92cfb9e, dd415af.
- **Manual pytest dep duplication**: `dev-python/pytest[` inside a `test? (...)` block of an ebuild that also calls `distutils_enable_tests pytest`. Evidence: 47454fe.
- **Custom python_test without distutils_enable_tests**: ebuild defines python_test() and IUSE contains test but no `distutils_enable_tests` call -> missing pytest BDEPEND risk. Evidence: bd7c22b.
- **Stale SETUPTOOLS_SCM_PRETEND_VERSION**: `SETUPTOOLS_SCM_PRETEND_VERSION` exported while SRC_URI uses the pypi eclass/sdist (no .gh.tar.gz / archive URL) -> dead code. Evidence: 5f83c2b, 1f262db.
- **pkg_resources import without dep**: source greps `import pkg_resources` (or `from pkg_resources`) but ebuild has no `dev-python/pkg-resources` dep. Evidence: c4cda74, 846bb49.
- **DISTUTILS_EXT missing**: installed image contains `*.so` python extension modules but ebuild lacks `DISTUTILS_EXT=1` (visible as the eclass QA notice in build logs; fatal from EAPI 9). Evidence: 8946c7a.
- **Bare dev-python dep without usedep**: `dev-python/[a-z0-9-]+` atoms lacking `[${PYTHON_USEDEP}]`/`[${PYTHON_SINGLE_USEDEP}]` in ebuilds inheriting python-r1/python-single-r1/distutils-r1. Evidence: bd20876.
- **Repeated -k in PYTEST_ADDOPTS**: more than one `-k` inside a single PYTEST_ADDOPTS assignment -> earlier expressions silently discarded. Evidence: 05ef15e.
- **Freethreading omission (advisory)**: pure-Python package (no DISTUTILS_EXT) whose COMPAT has python3_14/15 but no `t` variants, while all its RDEPENDs already carry them -> candidate for enablement, not a hard violation. Evidence: b014b8a, 9ffd1ff.
- **Patch provenance**: FILESDIR patches referenced in PATCHES without an adjacent URL comment (https://) on the preceding lines and no URL header inside the patch. Evidence: db06814, d60d5e9.
- **EPYTEST_* with non-pytest runner**: any `EPYTEST_*` assignment in an ebuild whose `distutils_enable_tests` argument is not pytest -> dead knobs. Evidence: 4d9e7e7.
- **Non-idempotent python_install**: `rm`/`mv` operating on `${ED}` paths inside python_install() (runs once per impl) -> belongs in python_install_all. Evidence: d7de896.
- **Bare has_version atom in python_test**: `has_version` on a `dev-python/*` atom without a `python_targets_` usedep inside python_test -> per-impl misfire. Evidence: 79dccd2.
- **Dep-var without REQUIRED_USE twin**: ebuild uses an eclass `*_DEP` variable (POSTGRES_DEP, PYTHON_DEPS) but never references its matching `*_REQ_USE`/`PYTHON_REQUIRED_USE` in REQUIRED_USE. Evidence: d35fa11.
- **ROOT in toolchain paths**: `${ROOT}` composed into -I/-L flags or include/libdir arguments in src_configure/src_compile -> must be ESYSROOT. Evidence: 5e8eafc.
- **Arguments on phase-function calls**: `distutils-r1_src_test` (or another phase function) invoked with trailing arguments -> silently ignored; use python_test() + `epytest <opts>`. Evidence: 977b141.
