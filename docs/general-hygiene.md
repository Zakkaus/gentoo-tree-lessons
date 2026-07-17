# Gentoo lessons: general ebuild hygiene

Cross-cutting hygiene rules mined from gentoo/gentoo commits: DESCRIPTION/HOMEPAGE style, KEYWORDS handling (bump resets, dekeyword sweeps, stabilization mechanics), metadata.xml upkeep, LICENSE ordering, skel.ebuild conventions, revbump policy, and pre-commit discipline. Shas refer to the gentoo/gentoo repo. Ecosystem-specific rules (Python compat windows, cargo, prebuilt soname fixing) live in their own docs; this one covers what applies to every ebuild, plus residue from ecosystems without a dedicated doc (haskell-cabal, elisp, init scripts) in their own subsections below.

## Rules

### Core ebuild hygiene

- **A freshly copied ebuild (version bump, rename, or snapshot) must carry only ~arch keywords — run `ekeyword ~all` before committing** (13+) - evidence: `c8460e7` app-text/qpdfview (new snapshot committed with stable x86, needed a follow-up demotion); `4a41400` www-apache/modsecurity-crs (new version landed stable amd64/x86, de-stabilized two days later by another dev); `c548fa4` sys-kernel/gentoo-sources (untested release inherited stable keywords from the copied ebuild); `4559693` media-video/vlc (a _pre snapshot carried stable keywords); `193f10b` mail-client/mutt-2 (git-rename bump risked keeping stale stable keywords). Sole exception: a security release whose ebuild is byte-identical to the current stable one may inherit stable keywords directly - `2f643be` net-vpn/openvpn.
- **When a package loses an arch keyword, dekeyword the entire reverse-dependency chain in the same batch, referencing one tracker bug** (50+, mostly two sweeps) - evidence: `62d6c6c` kde-apps/libkdegames (kdnssd lost ~loong; ~38 kde-apps dekeyworded one commit each); `dd47aca` dev-cpp/cpp-httplib (dropped 32-bit support; indilib, kstars, openrgb swept transitively); `b436cec` dev-python/nuitka (test-only BDEPEND chain gates keywords too - document the chain in the commit message); `e228755` virtual/httpd-php (a virtual's KEYWORDS must stay a subset of its providers').
- **Upstream repo moved or renamed: update HOMEPAGE, SRC_URI, metadata.xml remote-id, and any version-check config together in one commit; never rely on the redirect** (10) - evidence: `3a13937` dev-python/mkautodoc (account renamed, all three fixed together); `ee96ffc` dev-python/x-wr-timezone; `73b535a` dev-python/paho-mqtt; `9fa22fa` dev-python/shtab. Counter-rule: provenance/verification variables (PYPI_VERIFY_REPO and similar) must keep pointing at the repo that built the currently packaged release - `b2b0671` dev-python/shtab (mass sed broke pypi provenance verification).
- **DESCRIPTION is a short sentence fragment: no trailing period, no leading article (A/An/The), no repeat of the package name** (5) - evidence: `a2a4a1e` sys-boot/limine (pkgcheck BadDescription, trailing period); `6feec05` sci-ml/ollama (same); `4b57a5a` kde-frameworks/kwidgetsaddons (leading article stripped); `c2fd68a` dev-util/hxtools (DESCRIPTION started with "A ...").
- **Revbump when installed files or the runtime dep graph change; skip it for metadata-only edits (KEYWORDS, DESCRIPTION, copyright year, message strings, test-only patches)** (6+) - evidence: `91f374f` dev-libs/intel-compute-runtime (dep-bound fix without revbump never reaches installed users - the converse trap); `8f84db1` dev-util/android-sdk-cmdline-tools (ewarn spelling fix, no revbump); `4b96894` dev-python/resolvelib (test-only patch, no revbump); `a2a4a1e` sys-boot/limine (DESCRIPTION fix, no revbump).
- **Keep the skel.ebuild variable order (DESCRIPTION, HOMEPAGE, SRC_URI, S, LICENSE, SLOT, KEYWORDS, IUSE, deps); pkgcheck flags VariableOrderWrong** (4) - evidence: `82762f4` dev-libs/spsdeclib (KEYWORDS before LICENSE/SLOT); `cefe1a5` x11-misc/mate-notification-daemon (SRC_URI before DESCRIPTION); `0460cae` dev-libs/msgpack (S= moved next to SRC_URI).
- **Per-arch stabilization: one keyword-flip commit per arch, subject "Stabilize <ver> <arch>, #<bug>"; drop the vulnerable version only after all arches flipped** (6) - evidence: `5c627fa` dev-libs/modsecurity (3.0.15 flipped arm64/amd64/x86 in separate commits, 3.0.14-r2 dropped afterwards); `55e30c5` net-misc/asterisk (security bump tagged `Bug:` not `Closes:` so the tracker stays open through stabilization).
- **When dropping old ebuild versions or USE flags, prune everything they referenced: metadata.xml `<flag>` entries, Manifest DIST lines, dead conditional branches** (4) - evidence: `6f0c03f` dev-libs/modsecurity (stale `<flag>` left after last user gone); `3b60bf3` app-emulation/wine-staging (capi flag stripped, metadata.xml cleaned in the same commit); `92cfb9e` dev-python/ensurepip-pip (dead `case ${EPYTHON} in pypy3*)` block left after pypy3 dropped).
- **Destabilize a regressed/superseded stable version by prefixing its stable keywords with ~ instead of removing the ebuild** (4) - evidence: `f2c6ed0` sys-kernel/gentoo-sources (one-line KEYWORDS rewrite, ebuild kept); `b0ceb83` same pattern.
- **Never let a stable keyword outrun its dependencies: if deps are only ~arch, drop back to ~arch; if a raised dep bound is unkeyworded somewhere, comment out KEYWORDS with the reason** (2) - evidence: `ed6cc76` dev-util/include-what-you-use (stable amd64 with ~arch-only LLVM 22 deps, demoted); `ffa628d` dev-python/scipy (KEYWORDS commented out with "due to dev-libs/boost being not keyworded").
- **Run `pkgcheck scan` before pushing: it catches missing FILESDIR files, misspelled variable expansions, variable order, BadDescription** (4) - evidence: `d3995e0` dev-libs/libpeas (PATCHES referenced a patch never committed, broke every user); `9d32de6` dev-lang/ghc (same, every emerge died); `e6869b4` gui-libs/wlroots (`${REPEND}` typo silently emptied DEPEND); `2b3d247` dev-python/zensical (new package reverted wholesale by QA over unaddressed pkgcheck issues).
- **Audit the staged diffstat before committing: stray hunks from other in-progress work commit cleanly and silently** (2) - evidence: `397cc99` net-vpn/tinc (bump commit included a privoxy Manifest DIST entry); `4cfe7e8` eclass/cargo.eclass (personal debug einfo leaked into an unrelated commit).
- **Prebuilt (-bin) packages: KEYWORDS="-* <arches upstream actually ships>"** (3) - evidence: `cfc72a0` media-gfx/brscan5 (missing -*, plus deps on libs the blobs never link); `4fd355e` app-admin/bitwarden-cli-bin (per-arch artifacts, -* whitelist); `cad81d1` sys-libs/musl (arch-specific revbump used KEYWORDS="-* ~riscv" so other arches skip a libc rebuild).
- **Write upstream org/repo names literally in SRC_URI and HOMEPAGE; use variables only for version components** (2) - evidence: `2759f03` dev-libs/miniz (`${PN}` inside the github path made the URL non-greppable); `b78c053` app-admin/sysstat (same polish).
- **LICENSE lists the package's primary license first; document per-component licenses in a comment, do not sort alphabetically** - evidence: `a3e2b68` net-mail/mu (GPL-3+ was buried mid-list).
- **Never set eclass-reserved variables (EGIT_*, etc.) in ebuilds that do not inherit that eclass; use a neutral name like COMMIT for pinned snapshots** - evidence: `5c64ede` dev-embedded/ponyprog (EGIT_COMMIT without git-r3).
- **Keep -9999 live ebuilds in sync with the newest release ebuild during sweeps (compat vars, EAPI, structure)** (3) - evidence: `45cec44` sys-libs/libsemanage (live ebuild kept a dropped python target); `6d5687e` app-emacs/elpher (live ebuild drifted to a dead-end SRC_URI); `1a7ea9d` sys-apps/policycoreutils (new ~riscv keyword added inside the 9999 ebuild's conditional KEYWORDS block too so future release copies inherit it; forwarded across the SELinux set in dependency order).
- **metadata.xml needs a machine-usable upstream identity: remote-id plus a product-scoped bugs-to URL** - evidence: `4b57a5a` kde-frameworks/kwidgetsaddons.
- **Before dropping an old version, grep the tree for reverse-dep pins on it; re-add as a revision if a revdep still needs it** - evidence: `ce011e4` app-editors/qhexedit2 (<0.9.0 pin by ponyprog left unsatisfiable).
- **REQUIRED_USE="|| ( a b )" must have one of the options default-enabled (+a in IUSE)** (2) - evidence: `cefe1a5` x11-misc/mate-notification-daemon (unsatisfiable with default USE); `e30ef77` app-doc/kicad-doc (exactly-one flag set with no default).
- **Refresh the copyright header year whenever touching an ebuild** (10+, always folded into other edits) - evidence: `82762f4` dev-libs/spsdeclib; `b6ae96d` dev-python/zope-hookable and the whole py3.15 rotation batch.

### Bash & phase-function pitfalls

- **A custom src_prepare alongside PATCHES=() must call `default` (or `eapply "${PATCHES[@]}"`); calling only eapply_user silently skips every patch with no error** - evidence: `b8845ed` sec-policy/selinux-base-policy (patches listed but never applied, package built fine without the fixes it claimed to carry).
- **Never use heredocs or herestrings in ebuild global scope (or helpers called from it): bash backs them with a temp file the metadata-generation sandbox forbids; feed `read` via `< <(printf %s ...)` instead** - evidence: `690c4a1` sci-physics/geant-data (global-scope `<<<` broke sandboxed metadata generation; note `read -d ''` returns nonzero at EOF, so no `|| die`).
- **Backslash-escape a literal `~` in a parameter-expansion replacement — `MY_P=${P/_rc2/\~rc2}` — because unescaped it undergoes tilde expansion in global scope** - evidence: `a4105cc` media-libs/hamlib (corrupted SRC_URI/S when translating _rc suffixes to upstream ~rc naming).
- **Declare every loop and temporary variable `local` in ebuild/eclass functions; apply the same fix to the live ebuild so it propagates** - evidence: `37e52ee` sys-apps/selinux-python (python_test loop var leaked into global shell state).
- **Mass-prefixing an option onto a bash array must use the `--opt=value` form in a quoted expansion (`"${arr[@]/#/--load=}"`); an unquoted `'-l '` prefix relies on word splitting and breaks on whitespace paths** - evidence: `967dd17` app-emacs/emacs-jabber.
- **Install shell completions with shell-completion.eclass helpers (dozshcomp/dobashcomp/dofishcomp), not hardcoded `insinto /usr/share/zsh/site-functions`** - evidence: `1c17325` app-shells/gentoo-zsh-completions.

### Dependencies & USE flags

- **A USE-dep on a flag some versions of the target lack needs an assumed default: `flag(+)` or `flag(-)`** - evidence: `0cc8a2f` postgres extensions (25 ebuilds used postgresql[server]; the Gentoo-added flag is absent in 9999 where the server is unconditional, making the dep unresolvable — fixed as `server(+)`).
- **Delete a USE flag that permits a configuration upstream considers broken; hard-enable the feature instead of shipping a default-on toggle** - evidence: `86726e8` dev-vcs/darcs (USE=-threaded produced a misbehaving binary; flag removed, --flag=threaded forced).
- **A new optional daemon with its own acct-user gets one USE flag gating the acct-user dep, the meson/configure feature, and its library needs via REQUIRED_USE; revbump since the default install changes** - evidence: `1b71f90` sys-apps/systemd (IMDS component made optional behind USE=imds).
- **Capabilities provided by runtime plugins (gdk-pixbuf loaders, gstreamer plugins) are optfeature suggestions in pkg_postinst, not RDEPEND; an elog-only edit needs no revbump** - evidence: `5db7b08` app-misc/rox-filer (WebP thumbnails via gui-libs/gdk-pixbuf-loader-webp).
- **One upstream archive with per-locale variants: derive `l10n_` flags from a PLOCALES array (`IUSE="${PLOCALES[*]/#/+l10n_}"`), require one via REQUIRED_USE, select per-flag file lists in src_prepare and handle shared components exactly once** - evidence: `2cf82f2` app-dicts/myspell-en.
- **A script calling `7z` (not `7zz`) needs `>=app-arch/7zip-24.09[symlink(+)]`; bare app-arch/7zip does not install the p7zip-compatible names** - evidence: `d348e66` net-misc/rabbitmq-server.

### Services & init scripts

- **Daemons whose files are touched by out-of-service tooling (logrotate `su`, chown'd state dirs) need a static acct-user/acct-group in the systemd unit, not DynamicUser; keep unprivileged port binding via CapabilityBoundingSet + AmbientCapabilities CAP_NET_BIND_SERVICE** - evidence: `ab0e225` net-dns/dnscrypt-proxy (logrotate could not match the transient UID; changed unit shipped under a new files/-r1 name plus revbump).
- **OpenRC scripts: prefer declarative command/command_args over hand-rolled start()/stop(); validate config keyed on RC_CMD (start_pre when != restart, stop_pre when = restart) so restart cannot kill a running service with a broken config; no 'need net' for loopback-only daemons** - evidence: `6be2aab` mail-filter/postgrey (reload via start-stop-daemon --signal HUP; document rc_need="net" for non-loopback binds).
- **Detect the running init system via /proc/1/comm, not distro identity; a low-risk straight-to-stable fix lands as a new revision with stable keywords while the old revision stays as rollback** - evidence: `6231e2e` app-admin/puppet (OpenRC service provider confined to non-systemd boots).

### Sources, patches & sandbox

- **Upstream replaced a published tarball in place: never just refresh the Manifest hash; re-fetch under a renamed distfile (`SRC_URI=... -> ${P}-rN.tar.gz`) and revbump** - evidence: `be3f166` sci-mathematics/planarity (re-rolled release artifact under the same filename).
- **Backport unreleased upstream fixes as FILESDIR patches carrying provenance (PR/commit URL or cherry-picked-from line) in the header; revbump when installed content changes; scope the patch to versions actually tested** (4) - evidence: `2393224` app-forensics/lynis (open upstream PR shipped as files/ patch, -r1); `422a01b` sec-policy/selinux-base-policy (upstream commits cherry-picked with provenance lines; optional cross-module policy calls wrapped in optional_policy to break an install-order cycle); `f755936` dev-lang/zig (9999 breakage: adopt the new upstream interface, carry the regression patch headed by the pending PR URL); `6726cbf` dev-lang/ghc (sphinx-9 docs fix backported, deliberately scoped to the one tested version).
- **A build tool that might find its own installed copy must have detection disabled explicitly (--with-alex=false etc.) so the build is self-contained and reproducible** - evidence: `cc8d93f` dev-haskell/alex (also: doc?-conditional second SRC_URI pinning a git commit for doc sources missing from the release tarball).
- **Package a sub-project that only ships inside a larger release tarball by reusing the parent DIST and setting S=${WORKDIR}/<parent>/<subdir> (plus eclass file-location overrides) instead of re-rolling a tarball** - evidence: `40e44a5` dev-haskell/hadrian (built from the ghc source tarball with CABAL_FILE override).
- **Configure-time hardware probing that trips the sandbox: addpredict the smallest sufficient path, widen to the parent dir only if probes keep moving, and guard it with the triggering USE flag** - evidence: `84f557a` xfce-base/xfdesktop (probes moved beyond /dev/dri; addpredict /dev under USE=video only).
- **Eclasses tracking a toolchain whose cache/fetch layout changes across versions: branch on ver_test of the slot, document per-version paths inline, and make removed helpers die naming their replacement** - evidence: `76d93ad` eclass/zig (0.16 fetch regression vs 0.17 ZIG_LOCAL_PKG_DIR).
- **git-r3 clone type: the effective type is `max(EGIT_CLONE_TYPE, EGIT_MIN_CLONE_TYPE)` over `shallow < single < single+tags < mirror`. `EGIT_CLONE_TYPE` (user var, default `single`) sets the ACTUAL type; `EGIT_MIN_CLONE_TYPE` (default `shallow`) is only a floor. So to FORCE a shallow clone (save bandwidth/disk on a heavy-history repo) an ebuild must set `EGIT_CLONE_TYPE="shallow"` — that is the only mechanism, and it works. Setting `EGIT_MIN_CLONE_TYPE=shallow` is a no-op (already the default), and "cleaning up" `EGIT_CLONE_TYPE="shallow"` → `EGIT_MIN_CLONE_TYPE="shallow"` SILENTLY DISABLES the forcing (clone reverts to the user default `single`). Do NOT make that change. Setting `EGIT_CLONE_TYPE` overrides the user's preference (non-standard) but is a deliberate, functional choice; only raise `EGIT_MIN_CLONE_TYPE` (to `single`/`single+tags`/`mirror`) when the build genuinely needs history/tags/all-refs** - evidence: git-r3.eclass `: "${EGIT_CLONE_TYPE:=single}"` (L77), `: "${EGIT_MIN_CLONE_TYPE:=shallow}"` (L94). gentoo-zh app-i18n/rime-ice-9999: a "fix" of `EGIT_CLONE_TYPE="shallow"` → `EGIT_MIN_CLONE_TYPE="shallow"` was **reverted**, then the maintainer (Puqns67) committed the MIN→`EGIT_CLONE_TYPE` change directly (gentoo-zh `509c343e0`) — real-world confirmation that the shallow-forcing is intentional and the "normalization" was wrong. It turned intentional shallow-forcing into a no-op.

### Tests

- **When only specific test files or one test-suite are broken (sandbox, network), delete/overwrite those files in src_prepare (`rm/cp ... || die`) or patch the suite off (`buildable: False`, `when False $ it ...`) instead of RESTRICT=test, so the rest keeps running** (2) - evidence: `7fc7999` dev-util/shelltestrunner (rm -v broken tests, cp fixed replacements from FILESDIR); `fb5b304` dev-haskell/http-client (network suite disabled, offline suite kept under FEATURES=test).
- **Multi-implementation test failures from an old interpreter's numeric limits: patch the tests to skip only the unrepresentable assertions per-implementation, not the implementation or the whole suite** - evidence: `9d56ca0` dev-lua/lgi (0xffffffff asserts skipped for plain Lua 5.1; bug and upstream issue linked in the patch header).

### Haskell (haskell-cabal eclass)

- **Pick up relaxed dependency bounds published as Hackage metadata revisions with CABAL_HACKAGE_REVISION=N (the eclass fetches -revN.cabal as an extra DIST entry) instead of sed-ing or patching the .cabal; revision-only changes need no revbump since the tarball is unchanged** (3) - evidence: `a824112` dev-haskell/sop-core (replaced manual SRC_URI + CABAL_CHDEPS hacks); `9fe675e` dev-haskell/tar (bumped 6 -> 11 in place); `40b9116` dev-haskell/errors (only Manifest changes alongside).
- **Relax remaining over-tight .cabal bounds declaratively with CABAL_CHDEPS ('exact old text' 'new text') pairs; the exact-match requirement makes stale entries die loudly on the next bump; patch the .cabal only for structural dependency changes** (3) - evidence: `90dbdc6` dev-haskell/resolv; `77fd341` dev-haskell/http-api-data; `22606b1` dev-haskell/hackage-security (revision + CHDEPS + a small patch combined; flag disabled explicitly with --flag=-Cabal-syntax).
- **'base' bounds map one-to-one to GHC releases: when loosening a base lower bound, move >=dev-lang/ghc to the matching version in the same commit** - evidence: `a2c5a42` dev-haskell/servant (base 4.15.1.0 = ghc 9.0.2).
- **Replace hand-rolled MY_PN/MY_P/SRC_URI/S plumbing with CABAL_PN (upstream name differing in case) and let the eclass derive the rest** - evidence: `ee4dd18` dev-haskell/only.
- **GHC-bundled core libraries: list the bundling GHC versions in CABAL_CORE_LIB_GHC_PV so the eclass registers the shipped copy instead of rebuilding; add `nocabaldep` to CABAL_FEATURES to break Cabal dependency cycles** (2) - evidence: `e322908` dev-haskell/haddock-library; `aed75c6` dev-haskell/mtl (plus lower and upper ghc bounds in RDEPEND).
- **A Simple-build-type package failing while compiling its shipped Setup.hs: run cabal-mksetup after haskell-cabal_src_prepare to regenerate a canonical minimal one** - evidence: `d3fd7e8` dev-haskell/primitive.
- **Bare `doctest [...]` runners resolve against the ambient package db and break when unrelated packages are installed; migrate the suite to cabal-doctest and export GHC_BOOTSTRAP_PACKAGES+=( cabal-doctest ) under USE=test** (2) - evidence: `5b967b1` dev-haskell/foldl; `a7a4519` dev-haskell/mwc-random.
- **A freshly built Haskell tool that cannot find its not-yet-installed data files in src_test: set the Paths_* override `<pkgname>_datadir=${S}/data` in the test environment instead of installing first or skipping tests** - evidence: `e0013ca` dev-haskell/happy (same trick in dev-haskell/alex).
- **Gate threaded/smp cabal flags on `ghc-supports-smp` from ghc-package.eclass instead of hardcoding, so unregisterised arches still build** - evidence: `1e7227a` dev-haskell/typed-process.
- **build-type Custom packages break on new Cabal API changes even when the library is fine: carry the upstream compat patch guarded by `#if MIN_VERSION_Cabal(...)`; tools Setup.hs needs go in GHC_BOOTSTRAP_PACKAGES, not just BDEPEND** - evidence: `47fc41e` dev-haskell/pango (Cabal 3.14 SymbolicPath change).
- **Resurrecting an old Haskell package: expect the Semigroup-Monoid migration — move mappend's body to a new `instance Semigroup` and keep mempty in the Monoid instance** - evidence: `ffcdd1c` dev-haskell/tracetree.
- **.cabal compiler-version conditionals selecting dep sets Gentoo does not package: patch the conditional to force the supported branch (`if impl(ghc >= 9.8)` -> `if true`) instead of packaging legacy libraries** - evidence: `a577c20` dev-vcs/darcs.
- **Upstream example executables: gate behind a manual cabal flag mapped to IUSE=examples and rename generic binary names with CABAL_CHBINS to avoid /usr/bin collisions** - evidence: `b697251` dev-haskell/isocline ('example' binary installed unconditionally).

### Emacs (elisp eclass)

- **New app-emacs packages follow the elisp template: EAPI=9 + inherit elisp, NEED_EMACS floor, SITEFILE=50${PN}-gentoo.el with a two-line files/ site file, elisp-make-autoload-file in src_compile, elisp-test-ert over tests/*.el, GitHub tarball renamed `-> ${P}.gh.tar.gz`, release/9999 split via a PV conditional** (3) - evidence: `561b573` app-emacs/agent-shell; `cee3181` app-emacs/emacs-wttrin; `253965e` app-emacs/unison-ts-mode (ts-modes also need the tree-sitter grammar in both RDEPEND and BDEPEND).
- **Elisp library deps belong in BDEPEND (byte-compilation) folded into RDEPEND via ${BDEPEND}; declare the minimum Emacs with NEED_EMACS before inherit and trim KEYWORDS to the new dep's keyword set** - evidence: `029a745` app-emacs/gnuplot-mode (upstream started using compat-31 APIs).
- **Editor/interpreter feature requirements: express as USE-deps AND verify in pkg_setup against the actual ${EMACS} via `--eval '(princ PREDICATE)'`; accumulate all missing features and die once with the full USE-flag list** (2) - evidence: `fb59e1c` app-emacs/emacs-jabber (USE-dep alone cannot catch a manually built Emacs); `7ff9ad8` same package (die-per-iteration forced fix-and-retry loops).

## Idioms

Reset keywords after copying an ebuild for a bump:
```bash
cp foo-1.2.3.ebuild foo-1.3.0.ebuild
ekeyword ~all foo-1.3.0.ebuild
```

Prebuilt-blob keyword whitelist (`cfc72a0`):
```bash
KEYWORDS="-* ~amd64"
```

Commented-out KEYWORDS when a dep is unkeyworded (`ffa628d`):
```bash
# due to dev-libs/boost being not keyworded
# KEYWORDS="~amd64 ~arm ~arm64 ..."
```

metadata.xml machine-usable upstream identity (`4b57a5a`):
```xml
<upstream>
	<bugs-to>https://bugs.kde.org/enter_bug.cgi?product=frameworks-kwidgetsaddons</bugs-to>
	<remote-id type="kde-invent">frameworks/kwidgetsaddons</remote-id>
</upstream>
```

LICENSE with primary license first and component provenance comment (`a3e2b68`):
```bash
# mu: GPL-3+
# + tl: CC0-1.0
# + variant-lite: Boost-1.0
LICENSE="GPL-3+ BSD Boost-1.0 CC0-1.0 MIT"
```

Pinned-snapshot SRC_URI without eclass-reserved names (`5c64ede`):
```bash
COMMIT="5a4ef795b297ed1eaf6b4d4e71b3ce7a1bb63481"
SRC_URI="https://github.com/lancos/ponyprog/archive/${COMMIT}.tar.gz -> ${P}.tar.gz"
S="${WORKDIR}/${PN}-${COMMIT}"
```

Stray-hunk pre-commit check (`397cc99`):
```bash
git diff --cached --stat | grep -v "^ ${CATEGORY}/${PN}/"  # should be empty
```

Global-scope `read` without a herestring (`690c4a1`):
```bash
read -rd '' FILENAME VERSION ENVVAR < <(printf %s "${DATASETS[$DATASET]}")
# read -d '' returns nonzero at EOF: no || die
```

OpenRC restart-safe config validation (`6be2aab`):
```bash
start_pre() {
	if [ "${RC_CMD}" != "restart" ] ; then
		checkconfig || return $?
	fi
}
stop_pre() {
	if [ "${RC_CMD}" = "restart" ] ; then
		checkconfig || return $?
	fi
}
```

systemd static service user keeping privileged-port binding (`ab0e225`):
```ini
[Service]
User=dnscrypt-proxy
Group=dnscrypt-proxy
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
AmbientCapabilities=CAP_NET_BIND_SERVICE
```

Re-rolled upstream tarball under a new DIST name (`be3f166`):
```bash
SRC_URI="https://github.com/.../${P}.tar.gz -> ${P}-r2.tar.gz"
```

Quoted array option-prefix expansion (`967dd17`):
```bash
elisp-test-ert tests -L lisp "${tests[@]/#/--load=}"
```

Hackage bounds toolbox (`a824112`, `90dbdc6`):
```bash
CABAL_HACKAGE_REVISION=5  # fetch upstream's revised .cabal as an extra DIST entry
CABAL_CHDEPS=(
	'base               >= 4.5 && <4.15' 'base               >= 4.5'  # exact old text; dies if stale
)
```

## Automatable checks

- **BadDescription**: grep `DESCRIPTION=` for a trailing `."`, a leading `"A `/`"An `/`"The `, the package name as first word, or length > 80. Violation on any match. Evidence: `a2a4a1e`, `4b57a5a`, `c2fd68a`.
- **Stable keyword on a new ebuild**: for every ebuild file added in a commit (not renamed-in-place stabilizations), parse `KEYWORDS=`; any token not starting with `~` or `-` is a violation. Evidence: `c8460e7`, `4a41400`, `c548fa4`.
- **Variable order**: parse top-level assignments; order must follow skel.ebuild (DESCRIPTION < HOMEPAGE < SRC_URI < S < LICENSE < SLOT < KEYWORDS < IUSE < REQUIRED_USE < RESTRICT < deps). Any inversion is a violation. Evidence: `82762f4`, `cefe1a5`.
- **Redirecting HOMEPAGE/SRC_URI**: HEAD-request each URL; a 301/302 to a different host or path (beyond http->https) means the ebuild plus metadata.xml remote-id need updating. Evidence: `6b05342`, `ee96ffc`, `3a13937`.
- **${PN} inside a forge owner/repo path**: grep SRC_URI/HOMEPAGE for `github.com/[^/"]*/\$\{?PN` or `${PN}` in the org segment. Violation: repo name should be literal. Evidence: `2759f03`.
- **Missing FILESDIR file**: extract every `"${FILESDIR}"/...` reference and stat the file in files/. Missing file is a violation (pkgcheck also reports this). Evidence: `d3995e0`, `9d32de6`.
- **Undefined variable expansion in dep blocks**: collect `${NAME}` uses inside *DEPEND/SRC_URI and check each NAME is either assigned in the ebuild or a known PMS/eclass variable. Unknown name (e.g. `${REPEND}`) is a violation. Evidence: `e6869b4`.
- **Stale metadata.xml flags**: every `<flag name="X">` must appear in some live ebuild's IUSE; orphans are violations. Evidence: `6f0c03f`, `3b60bf3`.
- **EGIT_* without git-r3**: grep for `EGIT_` assignments in ebuilds whose inherit line lacks git-r3. Violation. Evidence: `5c64ede`.
- **-bin package without -\* keyword whitelist**: for packages installing prebuilt blobs (PN ends in -bin, or QA_PREBUILT set), KEYWORDS must start with `-*`. Evidence: `cfc72a0`, `4fd355e`.
- **Keyword graph consistency**: for each keyworded arch, every dep atom must be satisfiable by a package keyworded on that arch (pkgcheck's VisibleVcsPkg/NonsolvableDeps class); virtuals' KEYWORDS must be a subset of their providers'. Evidence: `62d6c6c`, `dd47aca`, `e228755`, `ed6cc76`.
- **Live-ebuild drift**: diff -9999 ebuild's PYTHON_COMPAT/EAPI/inherit list against the newest release ebuild; unexplained divergence is a violation. Evidence: `45cec44`, `6d5687e`.
- **Copyright year**: modified ebuilds whose header year is older than the current year. Evidence: `82762f4` and the py3.15 rotation batch.
- **REQUIRED_USE || group without default**: parse `REQUIRED_USE="|| ( ... )"`; violation when no member flag is `+flag` in IUSE or profile-defaulted. Evidence: `cefe1a5`, `e30ef77`.
- **Stray hunks in a package commit**: in CI, diffstat of a commit whose subject names `cat/pkg` must only touch that directory (plus profiles/ for pkgmoves). Evidence: `397cc99`.
- **PATCHES dropped by custom src_prepare**: ebuild sets PATCHES= and defines src_prepare whose body contains neither `default` nor `eapply "${PATCHES[@]}"`. Violation: patches are silently never applied. Evidence: `b8845ed`.
- **Heredoc/herestring in global scope**: grep ebuild code outside function bodies for `<<<` or `<<` redirections. Violation: breaks sandboxed metadata generation. Evidence: `690c4a1`.
- **Unescaped tilde in a replacement**: grep global-scope assignments for `${VAR/.../~...}` where the `~` opening the replacement is not backslash-escaped. Violation: tilde expansion corrupts the value. Evidence: `a4105cc`.
- **Non-local loop variables**: parse ebuild/eclass function bodies; any `for VAR in` where VAR has no `local` declaration in that function is a violation. Evidence: `37e52ee`.
- **Hardcoded completion install paths**: grep for `insinto` targeting /usr/share/zsh/site-functions, /usr/share/bash-completion, or /usr/share/fish/vendor_completions.d; should use shell-completion.eclass helpers. Evidence: `1c17325`.
- **Bare USE-dep on a version-absent flag**: for each `pkg[flag]` dep, if any visible version of pkg lacks flag in IUSE, the dep needs a `(+)`/`(-)` default. Evidence: `0cc8a2f`.
