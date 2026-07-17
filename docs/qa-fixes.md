# QA classes and their canonical fixes

Distilled from gentoo/gentoo commit lessons. Covers Portage/pkgcheck QA classes and the fix that tree maintainers actually applied: soname/subslot/RPATH, pre-stripped binaries, flag-respect (CFLAGS/LDFLAGS), implicit-function-declaration, CONFIG_CHECK, DOCS/man handling, RESTRICT/PROPERTIES hygiene, and metadata.xml/LICENSE/DESCRIPTION issues. The classic "insecure function (tmpnam/gets)" QA notice had no lessons in the mined set; the nearest class present is implicit-function-declaration. Shas refer to gentoo/gentoo.

## Rules

- **A pkgcheck/repoman warning is a signal, not a mandate — on a package a maintainer actively curates, a purely *cosmetic* "fix" gets reverted. Before touching a QA flag, confirm it changes real behavior/correctness AND matches maintainer intent; the terser or non-standard form is often deliberate. Two reverted on gentoo-zh: (1) `NonConsistentTarUsage` — `cmd | tar -xzC dir` already reads stdin and extracts fine, do NOT rewrite it to `tar -xzf - -C dir`; (2) `EGIT_MIN_CLONE_TYPE` "normalization" — `EGIT_CLONE_TYPE="shallow"` deliberately forces a shallow clone (see the git-r3 clone-type rule in general-hygiene), and rewriting it to `EGIT_MIN_CLONE_TYPE` silently disables that** - evidence: gentoo-zh `e1cefd223` (maintainer Puqns67 reverted "pass '-f -' to tar reading from stdin") and `509c343e0` (Puqns67 restored `EGIT_CLONE_TYPE="shallow"` over the MIN form).
- **Never gate man pages or basic docs behind a USE flag (QA policy PG0305): make the generator (scdoc/asciidoc) an unconditional BDEPEND and hard-enable the build option** (12) - evidence: `8525c42` gui-wm/sway (dropped IUSE=+man, scdoc unconditional, `-Dman-pages=enabled`; same sweep hit 10 more gui-apps and `ec3e612` dracut).
- **Never blanket-RESTRICT a test suite for a few broken tests; skip individually with a bug-comment per entry: `CMAKE_SKIP_TESTS` for ctest, `EPYTEST_DESELECT` for pytest, `rm` the test file in src_prepare for others** (15+) - evidence: `7ac29fa` kde-frameworks/kholidays (one flaky test moved to CMAKE_SKIP_TESTS instead of RESTRICT); `1ba687a` www-servers/nginx (network test rm'd under `use test`); `88c4560` sci-libs/pdal (ctest --exclude-regex for sandbox-blocked download test).
- **When an upstream repo moves orgs/owners, update HOMEPAGE, SRC_URI, metadata.xml remote-id, and any nvchecker/verify config together in one commit - never rely on the redirect** (10) - evidence: `3a13937` dev-python/mkautodoc (account renamed, all three fixed together); `274a8bc` app-editors/micro (org move fixed during bump).
- **Encode a shared library's soname (or the version components deriving it) in the subslot so `:=` consumers rebuild on ABI change; treat even a same-version library file rename as an ABI break** (6) - evidence: `c342413` dev-libs/aml (`SLOT="0/$(ver_cut 1)"` replaced consumer hard-pins); `93d7045` dev-libs/msgpack (rename libmsgpackc→libmsgpack-c got synthetic subslot `0/2-c`); `63c9fbe` ffmpeg (subslot re-derived from new SONAMEs on bump).
- **CMake-4 `cmake_minimum_required < 3.5` QA: patch minimums up to >=3.10 when the code is actually built; set `CMAKE_QA_COMPAT_SKIP=1` (with comment) only when the offending sources are bundled but never configured; prefer a deletion patch for dead files** (4) - evidence: `13a7a9d` net-libs/quiche (patched vendored boringssl minimums); `0c0ebc5` app-emulation/punes (skip var for unbuilt bundle); `e5a9f36` sci-libs/dealii (deletion patch upstream).
- **Implicit-function-declaration QA on configure probes for symbols that cannot exist on the target (other-OS, removed-kernel, unreleased-dep APIs): whitelist the exact symbols in `QA_CONFIG_IMPL_DECL_SKIP` with a why-comment; if the code itself is broken (C23 unprototyped externs), patch real prototypes instead** (3) - evidence: `e28a4db` net-analyzer/net-snmp (ioctlsocket/sysctl whitelisted); `6ca648f` dev-libs/libpcre2; `086dbe7` dev-lang/ghc (K&R externs got real prototypes, not -std downgrade).
- **Go builds passing `-ldflags "-s -w"` produce pre-stripped binaries (stripping QA, broken splitdebug): patch `-s`/`-w` out of the build system, or bypass the wrapper and run `ego build` with your own -ldflags** (3) - evidence: `6b2d63e` sci-ml/ollama (FILESDIR patch drops -s -w from cmake Go ldflags, bug 978763); `274a8bc` app-editors/micro; `0e9c7e1` ollama rework.
- **"Files built without respecting CFLAGS/LDFLAGS" on pure Rust/Go binaries: whitelist the exact installed paths via `QA_FLAGS_IGNORED` - do not try to inject CFLAGS** (3) - evidence: `92ddcc7` sys-process/rust-parallel (`QA_FLAGS_IGNORED="usr/bin/${PN}"`); `819e1cb` sys-devel/wild; `812393b` gnome-extra/gnome-commander.
- **Sync `RUST_MIN_VER` with the new release's Cargo.toml `rust-version` on every cargo bump - the eclass QA-warns on mismatch** (3) - evidence: `6ca2ba0` dev-util/maturin; `c75e972` app-admin/vaultwarden.
- **Never use `<<<`, `<()`, pipes, or anything that forks/writes files in ebuild global scope (including helper functions called there) - it breaks or sandbox-violates metadata generation; split strings with IFS + array expansion** (3) - evidence: `de7131f` media-video/handbrake (herestring in global-scope SRC_URI helper, bug 978942); `ae1cf90` nginx.eclass (global eqawarn heredoc printed empty warning); `ae0802a` cargo.eclass (`read <<<` needs `|| die`).
- **Missing SONAME / build-dir RPATH on a compiled cdylib is fixed, not suppressed: `patchelf --remove-rpath`, install as `libfoo.so.X.Y.Z` via newlib.so with manual symlinks, BDEPEND on dev-util/patchelf - no QA_SONAME/QA_FLAGS_IGNORED papering** - evidence: `13a7a9d` net-libs/quiche (replaced QA suppressions with real fix, revbump).
- **Unresolved-soname/RPATH QA on a bundled component of a prebuilt app: either `patchelf --set-rpath '$ORIGIN/...'` so its libs resolve in-tree and add the real system RDEPENDs, or delete the component and point the app at system equivalents; combine with `QA_PREBUILT` and `RESTRICT="splitdebug"`** - evidence: `f9a2b99` dev-util/intellij-idea (bundled Xvfb, both options behind a USE flag); `0a40502` app-containers/incus (QA_PREBUILT for every Go binary).
- **`QA_PRESTRIPPED` is legitimate only for binaries upstream ships pre-stripped (vendor blobs); for anything built from source, give stripping back to portage (`--disable-stripping`, patch the strip call out)** - evidence: `255becc` www-apps/grafana-bin (QA_PREBUILT/QA_PRESTRIPPED on blobs); `a4b65a2` dev-lang/rust (shipped rust-objcopy appended to QA_PRESTRIPPED); `a1cbb4f` app-admin/sysstat (`--disable-stripping`, Makefile patched to respect CPPFLAGS instead of hardcoding -O2).
- **Every DEPEND/RDEPEND atom on a library that defines a subslot must carry `:=`, including atoms inside USE conditionals; audit all linked deps, not just the obvious ones** - evidence: `f7d4d47` app-misc/nnn (`pcre? ( dev-libs/libpcre2:= )` was missing the operator while ncurses/readline had it).
- **Before adding a library dep from a runtime-breakage report, confirm the package's own ELF objects list it (`scanelf -n`); transitive breakage is fixed by `:=` on the direct consumer, not by copying the dep** - evidence: `a7426ce` media-sound/ardour (bogus direct mbedtls dep removed; libwebsockets:= is the real carrier).
- **When CONFIG_CHECK must reflect the running kernel (container builds, test-only checks), set KERNEL_DIR to a nonexistent path before `check_extra_config` to force linux-info into runtime-only (/proc/config.gz) mode** - evidence: `7a96a8a` dev-debug/bpftrace (bug 977516).
- **Overriding a phase whose eclass default installs docs silently loses them: call `einstalldocs` inside the override, and call the eclass phase implementation (never bare `default`) in eclass-driven multi-build packages** - evidence: `270eea3` net-mail/b4 (docs vanished after completions were added to python_install_all); `c21d552` dev-db/pg_track_settings (plain `default` skipped per-slot install).
- **Install docs by explicit list, not `dodoc -r dir/.`; re-verify all install globs against the new tarball on every bump - especially license/notice files whose installation is a bindist compliance requirement** - evidence: `fe84ecd` mail-mta/exim; `f96c060` sys-kernel/linux-firmware (LICEN[CS]E.* glob went dead after upstream moved to LICENSES/, bug 978064).
- **Direct-ld QA (`ld -r` partial linking) breaks cross toolchains and LTO: patch to `$(CC) -r` so the compiler driver picks the right linker and plugins** - evidence: `fe84ecd` mail-mta/exim (dkim module Makefile).
- **"QA Notice: Unrecognized configure options" means a USE flag is silently a no-op: verify every `use_enable/use_with` second (renaming) argument against `./configure --help`** - evidence: `ad78494` sys-devel/gettext (USE=xattr passed --enable-attr; real switch is --enable-xattr).
- **Any ebuild calling `udev_dorules`/`udev_newrules` must call `udev_reload` in both pkg_postinst and pkg_postrm, and the fix warrants a revbump** - evidence: `e4bdac9` dev-util/android-sdk-cmdline-tools (rules were inert until reboot).
- **Every `${FILESDIR}/x` reference (including inside phase commands) must have a committed file; when borrowing an idiom from another package, bring its files/ assets along** - evidence: `4f6aaf5` net-analyzer/sslscan (emerge died on missing gentoo.config, bug 978075).
- **Mirror the toolchain minimums the build declares: go.mod's `go X.Y.Z` directive becomes `BDEPEND=">=dev-lang/go-X.Y.Z"`** - evidence: `2e08677` www-apps/hugo (QA notice quoted the go.mod version).
- **Installing a pruned copy of an upstream tree leaves dangling symlinks (broken-symlink QA): run `find -L "${ED}<dir>/" -type l -delete || die` after copying** - evidence: `d37bac4` kernel-build.eclass.
- **distutils-r1 packages that build any compiled extension (setuptools ext, cffi, cython) must set `DISTUTILS_EXT=1`; from EAPI 9 the missing setting is fatal, not a QA notice** (2) - evidence: `8946c7a` distutils-r1.eclass (QA warning became EAPI-gated die); `c9cabbe` dev-python/python-augeas.
- **DESCRIPTION style (pkgcheck BadDescription): no leading article, no trailing period, no package-name repetition** (2) - evidence: `a2a4a1e` sys-boot/limine (trailing period); `4b57a5a` kde-frameworks/kwidgetsaddons (leading "An", plus remote-id/bugs-to added for machine-usable upstream identity).
- **When a dependency loses an arch keyword (or a keywording request times out), dekeyword that arch from all live versions of every reverse dependency (ekeyword-scripted) rather than shipping unsolvable deptrees** (2) - evidence: `8c05d98` kde-apps/ksirk; `62d6c6c` kde-apps/libkdegames (~loong sweep after kdnssd timeout).
- **`REQUIRED_USE="|| ( a b )"` must be satisfiable with default USE: default-enable one member (`+a`); same when demanding exactly-one-of a set** (2) - evidence: `cefe1a5` x11-misc/mate-notification-daemon (IUSE gained +X); `e30ef77` app-doc/kicad-doc (+l10n_en).
- **Keep skel.ebuild variable order (DESCRIPTION/HOMEPAGE/SRC_URI, then LICENSE/SLOT/KEYWORDS); pkgcheck VariableOrderWrong; fix without revbump** (2) - evidence: `82762f4` dev-libs/spsdeclib; `cefe1a5` mate-notification-daemon.
- **RESTRICT=test is correct only when effectively the whole suite needs an unavailable environment - then set it with a one-line reason comment instead of maintaining an exhaustive skip list; and treat inherited unconditional RESTRICT=test as debt to retry on every bump** - evidence: `3593f13` kde-frameworks/kdav (skip list collapsed into documented RESTRICT); `3cd6400` dev-haskell/hspec-contrib (stale RESTRICT converted back to `RESTRICT="!test? ( test )"` with real test deps).
- **Test-only PROPERTIES must be USE-conditional: `PROPERTIES="test? ( test_network )"` when adding IUSE=test** - evidence: `24dadb3` dev-python/truststore.
- **Metadata must be deterministic: never make *DEPEND (or any metadata variable) conditional on environment variables or state outside the ebuild source; USE flags are the only sanctioned conditional** - evidence: `3a2e787` java-utils-2.eclass (deps inside `is-java-strict` reverted).
- **Run `pkgcheck scan` plus a full portage build before pushing a new package; in ::gentoo unaddressed QA issues get the package reverted wholesale** - evidence: `2b3d247` dev-python/zensical (QA team reverted the add).
- **Port every QA fix to the -9999 live ebuild in the same series, or the next bump regresses** - evidence: `0a4f9ef` net-libs/quiche (live ebuild still carried the just-removed QA suppressions).
- **When a dep's USE flag is being added/removed across versions, suffix it with `(+)`/`(-)` USE-defaults so the atom stays satisfiable through the transition** - evidence: `eb38f50` kernel-install.eclass (`[-unknown-license(-)]` after linux-firmware dropped the flag).
- **A configure log showing a bare flag as "command not found" means an empty toolchain variable ($CPP/$CC/$LD) is being executed: inherit toolchain-funcs and `tc-export` the missing variable** - evidence: `f936d2d` x11-libs/gtk+ (bug 922298).
- **cmake.eclass "unused variable" QA: pass a `-D` option only in the branch where the CMake code actually reads it; kill automagic lookups with `-DCMAKE_DISABLE_FIND_PACKAGE_X=ON`** - evidence: `9e1237c` x11-themes/qtcurve.
- **When a QA warning is a confirmed false positive with no suppression mechanism, record the exact message and reasoning as an ebuild comment** - evidence: `70c3cb5` media-libs/gst-plugins-ugly (IUSE=orc warning documented as FP).
- **Upstream builds that unconditionally install a generically-named demo binary (`example`) into /usr/bin are a collision QA risk: gate behind an off-default flag and rename with a package prefix** - evidence: `423a1e6` dev-haskell/fsnotify (CABAL_CHBINS rename).
- **Prune metadata.xml `<flag>` entries (and Manifest DIST lines) that no remaining ebuild version references when dropping old versions** - evidence: `6f0c03f` dev-libs/modsecurity.
- **The nonzero-uid QA notice on intentionally non-root tools: install real binaries in /usr/libexec and expose /bin/sh exec wrappers in /usr/bin (not symlinks)** - evidence: `eeb699e` sys-process/fcron (bug 925512).

## Idioms

Whitelist impossible configure probes (implicit-function-declaration QA):
```bash
QA_CONFIG_IMPL_DECL_SKIP=(
	# only exists on Windows
	ioctlsocket
	# removed from Linux since 5.5
	sysctl
)
```
(e28a4db)

Real fix for an unversioned Rust cdylib instead of QA_SONAME suppression:
```bash
patchelf --remove-rpath "$(cargo_target_dir)"/libquiche.so || die
newlib.so "$(cargo_target_dir)"/libquiche.so libquiche.so.0.0.0
ln -s libquiche.so.0.0.0 "${ED}"/usr/$(get_libdir)/libquiche.so.0 || die
ln -s libquiche.so.0 "${ED}"/usr/$(get_libdir)/libquiche.so || die
```
(13a7a9d; dev-util/patchelf in BDEPEND)

Make a bundled prebuilt component's sonames resolve in-tree:
```bash
patchelf --set-rpath '$ORIGIN/../lib' "${S}"/path/bin/{Xvfb,xkbcomp} || die
patchelf --set-rpath '$ORIGIN' "${S}"/path/lib/lib*.so* || die
# plus real RDEPENDs, QA_PREBUILT="opt/${PN}/*", RESTRICT="splitdebug"
```
(f9a2b99)

Rust/Go binary QA suppressions (built-from-source flags check only):
```bash
QA_FLAGS_IGNORED="usr/bin/${PN}"
# only if upstream truly ships it stripped:
QA_PRESTRIPPED="usr/bin/${PN}"
```
(92ddcc7, 812393b)

Force CONFIG_CHECK against the running kernel only:
```bash
pkg_pretend() {
	CONFIG_CHECK="~BPF ~BPF_SYSCALL"
	if use test; then
		# force linux-info to check only the running kernel (bug 977516)
		KERNEL_DIR="linux-info-runtime-checks-only"
	fi
	check_extra_config
}
```
(7a96a8a)

Keep docs when overriding an install phase:
```bash
python_install_all() {
	einstalldocs
	newbashcomp bash.completion b4
	newzshcomp zsh.completion _b4
}
```
(270eea3)

udev rules need a reload hook pair:
```bash
pkg_postinst() { udev_reload; }
pkg_postrm() { udev_reload; }
```
(e4bdac9)

Delete dangling symlinks after installing a pruned tree:
```bash
find -L "${ED}${my_dir}/" -type l -delete || die
```
(d37bac4)

Primary license first, per-component comment block:
```bash
# mu: GPL-3+
# + tl: CC0-1.0
# + variant-lite: Boost-1.0
LICENSE="GPL-3+ BSD Boost-1.0 CC0-1.0 MIT"
```
(a3e2b68)

Subslot tracks soname; synthetic value for a rename:
```bash
SLOT="0/$(ver_cut 1)"     # soname follows major (c342413)
SLOT="0/2-c"              # one-off: lib file renamed at same version (93d7045)
```

## Automatable checks

- **man/doc USE flag (PG0305)**: grep ebuilds for `man` in IUSE plus `man? (` around scdoc/asciidoc/help2man/pandoc in BDEPEND, or `$(meson_feature man`/`$(use_enable man`; any hit is a violation - `8525c42`.
- **Missing := on subslotted deps**: parse *DEPEND atoms (including inside USE conditionals) against a list of subslot-defining packages (ncurses, readline, libpcre2, openssl, icu, ffmpeg, ...); atom without `:=`/explicit subslot = violation; `qa-vdb` from app-portage/iwdevtools does this post-install - `f7d4d47`, `a4b65a2`.
- **udev without reload**: ebuild calls `udev_dorules|udev_newrules` but pkg_postinst or pkg_postrm lacks `udev_reload` - `e4bdac9`.
- **FILESDIR references**: extract every `${FILESDIR}/<name>` and verify the file exists under files/ - `4f6aaf5`.
- **go.mod vs BDEPEND**: compare `go X.Y[.Z]` directive in the distfile's go.mod against `>=dev-lang/go-` bound in BDEPEND; missing or lower bound = violation - `2e08677`.
- **RUST_MIN_VER vs Cargo.toml**: compare `rust-version` in the crate's Cargo.toml with the ebuild's RUST_MIN_VER - `6ca2ba0`.
- **Go pre-strip**: grep upstream build files (Makefile, *.cmake, goreleaser) for `-ldflags` strings containing `-s` or `-w`; if the ebuild uses the upstream wrapper without a patch removing them = violation - `6b2d63e`, `274a8bc`.
- **DESCRIPTION style**: regex `^DESCRIPTION="(A|An|The) |.*\."$` or containing ${PN}; pkgcheck BadDescription covers it - `a2a4a1e`, `4b57a5a`.
- **Variable order**: KEYWORDS assigned before LICENSE/SLOT (pkgcheck VariableOrderWrong) - `82762f4`.
- **REQUIRED_USE satisfiability**: for `REQUIRED_USE="|| ( ... )"`, check at least one member appears in IUSE with `+` default - `cefe1a5`.
- **Blanket RESTRICT=test debt**: `RESTRICT="test"` (unconditional) without a reason comment on the same/preceding line, or alongside commented-out test deps - `3cd6400`, `3593f13`.
- **Unconditional test_network**: `PROPERTIES="test_network"` not wrapped in `test? ( )` when IUSE has test - `24dadb3`.
- **Global-scope forking**: grep ebuild top level (outside phase functions) for `<<<`, `<(`, or pipelines in variable assignments/helper calls - `de7131f`.
- **Stale remote-id/SRC_URI**: HEAD-request the GitHub/GitLab repo URL from remote-id and SRC_URI; an HTTP 301 to a different owner/repo = stale (rate-limit false positives need per-URL re-verify) - `3a13937`, `ee96ffc`.
- **Stale metadata.xml flags**: `<flag name="x">` entries where no remaining ebuild has x in IUSE - `6f0c03f`.
- **cmake_minimum_required < 3.10**: grep unpacked sources of cmake-inheriting packages; if the file is configured by the build = patch needed; bundled-unbuilt = CMAKE_QA_COMPAT_SKIP candidate - `e30ef77`, `0c0ebc5`.
- **use_enable/use_with renamed options**: for calls with a second argument, verify the option exists in `./configure --help` output; also grep build logs for "Unrecognized configure options" - `ad78494`.
- **Dangling symlinks in image**: `find -L "${ED}" -type l` after src_install (portage QA already warns; overlay CI can gate on it) - `d37bac4`.
- **DISTUTILS_EXT**: distutils-r1 ebuild whose installed image contains `*$(get_modname)` under site-packages but no `DISTUTILS_EXT=1` - fatal in EAPI 9 - `8946c7a`, `c9cabbe`.
- **DependencyMissingKeywords**: pkgcheck scan; a package keyworded ~arch whose dep tree lacks that keyword = dekeyword the reverse deps - `8c05d98`.
