# Eclass migrations

How eclass changes propagate to consumers, mined from gentoo/gentoo commits: adding EAPI 9 support to eclasses, banning/deprecating eclass functions per-EAPI, eclass renames/merges (qmake-utils→qt-utils, bash-completion-r1→shell-completion, linux-mod→linux-mod-r1), new mandatory eclass variables, and inherit/phase-override hygiene. Covers both the eclass-author side (how ::gentoo does it) and the consumer side (what an overlay must sweep when EAPIs bump or eclasses deprecate API), plus general eclass robustness: phase/cwd hygiene, cross-compilation path variables, SLOT/versioning/distfile discipline. Shas refer to gentoo/gentoo.

## Rules

### Consumer-side migrations

- **When the tree splits or renames an eclass with a compatible API, migrate by swapping the inherit line and verifying every eclass function the ebuild calls exists in the successor** (8) - evidence: `0db7dda` sci-electronics/qelectrotech (pure `qmake-utils`→`qt-utils` inherit swap, zero other changes); also `c87891596` dev-python/pyside, `3764bbc` accounts-qt, `d9bcaee` accounts-qml, `695a84e` pinentry, `cbb0203` qtkeychain, `5a2a4eb` mkvtoolnix, `4f66216` gwenhywfar. Do it before bumping to an EAPI where the old functions are banned.
- **Qt host tools executed during build must resolve under BROOT, never via `qtX_get_bindir`/hand-built `libdir/qt6/bin` paths** (7) - evidence: `d9bcaee` accounts-qml (`$(qt6_get_libdir)/qt6/bin/qdoc` → `$(qt_get_broot_binary 6 qdoc)`). New-style qt-utils dir helpers return *unprefixed* paths: the caller prepends `${BROOT}` for build-tool lookup, `${EPREFIX}` for installed paths (`695a84e` pinentry); argument validation is centralized in one FUNCNAME-reporting internal helper (`00f1c0f`). `qt_get_broot_binary` itself probes bindir+libexecdir in priority order with a single scoped-PATH `type -P` call instead of testing paths one by one (`68dad83`). Never nest die-capable helpers inside `usex` arguments - the inner command always runs even when the flag is off (`022b66e` uriparser, bug 979154); guard with a plain `if use X`.
- **On every EAPI bump, sweep the ebuild for eclass API that dies in the new EAPI** (6) - the recurring EAPI-9 items:
  - `makeopts_jobs`/`makeopts_loadavg` → `get_makeopts_jobs`/`get_makeopts_loadavg` (no args needed; reads MAKEOPTS+GNUMAKEFLAGS+MAKEFLAGS) - evidence: `90e9f9f` dune.eclass, `09ef592` distutils-r1.
  - `make_desktop_entry` positional name/icon args → `-n`/`-i` flags - evidence: `86137a6` atari800, `c7fda20` tkcvs.
  - `DISTUTILS_USE_PEP517` legacy spellings → backend package names (`flit`→`flit-core`, `poetry`→`poetry-core`, `flit_scm`→`flit-scm`, `jupyter`→`jupyter-packaging`) - evidence: `be58ce7` distutils-r1, `5c06ffb` cssselect2.
  - Missing `DISTUTILS_EXT=1` on packages installing compiled extension modules: QA warning in EAPI 7/8, fatal in EAPI 9 - evidence: `8946c7a` distutils-r1.
  - Dead implementations in `PYTHON_COMPAT` (python3_11 and older, bare pypy3, python3_13t): silently ignored in EAPI 7/8, `die` in EAPI 9 - evidence: `5d00c0a` python-utils-r1.
- **Audit overlay inherits against ::gentoo eclasses marked `@DEPRECATED`/`@DEAD` and migrate to the named successor before deletion** (3) - evidence: `39b122a` + `b7c38ce` linux-mod.eclass last-rited (successor linux-mod-r1, bug 908692); overlay ebuilds still inheriting it break with unknown-eclass at removal.
- **Replace deprecated no-op aliases when documented, even if they still "work"** (2) - evidence: `940c892` virtualgl and `939e595` amdgpu-pro-opencl (`multilib_parallel_foreach_abi` → `multilib_foreach_abi`; the parallel variant has been a misleading serial alias for years, bug 979259). No revbump needed when output is identical.
- **Audit USE-conditional branches for removed eclass functions when bumping EAPI** - evidence: `8202bb4` xl2tpd (EAPI-8 ebuild still had `use poll && epatch ...`; default-USE testing never executed it). Fix with `eapply` + revbump.
- **When an eclass grows automatic dependency generation, delete the manual deps it obsoletes** (3) - evidence: `5e00a46` acct-user/vdradmin (hand-written `DEPEND+=" acct-group/foo"` duplicated what `acct-user_add_deps` now emits from `ACCT_USER_GROUPS`); also `4ab3696` acct-user/nobody, `6e6f2f9` acct-user.eclass.
- **Never override an eclass-exported phase with `default` plus extra steps** (2) - evidence: `1c70196` dev-haskell/generically (`src_prepare() { default; cabal-mksetup; }` silently skipped `haskell-cabal_src_prepare`, bug 968626); `c21d55c` pg_track_settings (plain `default` in src_install skipped per-slot install, bug 976778). Call `eclassname_src_phase` explicitly, or delete the override entirely when it merely re-implements the eclass default (`beac3a2` pg_background).
- **When two inherited eclasses export the same phase, define that phase in the ebuild and call both explicitly** - evidence: `b16b5e3` dev-python/vcsgraph (cargo + pypi both export src_unpack; inherit order silently dropped one, bug 978092).
- **Refresh dormant packages in one combined maintenance revbump** - evidence: `fa55396` caribou (EAPI 7→8, PYTHON_COMPAT refresh, dead blocker dropped, `.la` pruned, all in one -r9). EAPI bumps and build-tool-path fixes that cannot change the installed image may go in place without a revbump (`3764bbc` accounts-qt).
- **Packages in Portage's own dependency chain must not exceed the EAPI the latest released Portage supports** - evidence: `2cf5ebc` skel.ebuild (comment added when skeleton moved to EAPI 9).
- **When an X.org package's new release switches autotools→meson, swap `xorg-3` for `xorg-meson` and drop autotools-only variables** - evidence: `8f7f5f2` x11-apps/xset (`XORG_CONFIGURE_OPTIONS` no longer exists).
- **When an eclass documents helper variables (`FOO_REQ_USE`, `FOO_DEP`) instead of exporting metadata itself, every consumer must assign them explicitly, after the inherit line** - evidence: `2ddb4b0` dev-db/repmgr (postgres-multi consumers were emergeable with zero postgres_targets flags, tracker bug 978223; fix is `REQUIRED_USE="${POSTGRES_REQ_USE}"` - and the inherit had to move above the assignment, since the variable only exists after inherit).
- **Migrating off `tc-ld-disable-gold`: test with lld/mold and drop the call entirely; substitute `tc-ld-force-bfd` only if the package genuinely needs bfd** - evidence: `e06f3f6` toolchain-funcs (most gold-era failures were gold-specific bugs, not modern-linker incompatibilities; the @DEPRECATED tag now says so).

### Eclass-author side (how ::gentoo phases changes in)

- **To add a new EAPI to an eclass: audit against the EAPI changelist, then update `@SUPPORTED_EAPIS` and the `case ${EAPI}` guard together** (4) - evidence: `59722c2` gear.kde.org.eclass; also `a71d7e7` plasma.kde.org, `c6b9933` xorg-meson, `601b1d1` optfeature. Current skeleton puts the inclusion guard *above* the EAPI check so the check runs once inside the guard.
- **Phase out eclass functions per-EAPI, never globally: silent in old EAPIs, eqawarn naming the replacement in the next, `die` for banned ones** (4) - evidence: `787364f` multiprocessing.eclass (`has "${EAPI}" 7 8 || die "...banned in EAPI ${EAPI}, use get_makeopts_jobs"`, body moved to `_internal` helper); `cd16902` qt-utils (one FUNCNAME-dispatching guard serves all deprecated wrappers); `e738837` qmake-utils (wrap legacy function definitions in `if [[ ${EAPI} == 8 ]]`). Do NOT add `@DEPRECATED` eclassdoc tags while many current-EAPI consumers remain - pkgcheck CI flags every consumer at once (`7ca40ae` multiprocessing.eclass reverted its tags, kept the EAPI-9 runtime ban).
- **Eclassdoc deprecation markers are machine-readable and format-checked** (5) - `@DEPRECATED` requires a value: the replacement name or literal `none` (`b6ee374` qt-utils: bare tag fails eclassdoc; `ddff06e` java-osgi: `@DEPRECATED: none`). Tag order is fixed: `@FUNCTION`, `@USAGE`, `@DEPRECATED`, `@DESCRIPTION` - the eclass-manpages build acts as the lint (`deda2c3` multiprocessing). Mark consumer-less eclasses `@DEAD` before deleting (`ad48101` qt5-build, `b7c38ce` linux-mod).
- **Merge eclass A into successor B without a breakage window: inline A's functions into B first, then reduce A to `inherit B` + `@PROVIDES: B`** (4) - evidence: `4b99041` bash-completion-r1 became a 5-line wrapper over shell-completion; `016b49f` shell-completion (ordering); `42d72c4` qmake-utils kept `@PROVIDES` when qt6 helpers moved out. Precondition: B's supported-EAPI set must be a superset of A's or the inherit chain dies on old-EAPI consumers (`3973afc` shell-completion gained EAPI 7 first).
- **Flip eclass behavior defaults only at an EAPI boundary, with paired opt-in/opt-out variables** (4) - evidence: `1454aa9` greadme (EAPI 8: autoformat on, `GREADME_DISABLE_AUTOFORMAT` opt-out; EAPI 9: off, `GREADME_AUTOFORMAT` opt-in); `936180e` go-module (flag capture moved from src_unpack to src_configure, `EXPORT_FUNCTIONS src_configure` only for EAPI 9+); `de37656` shell-completion; `fb3500a` qmake-utils (BROOT vs EPREFIX gated on EAPI). Transitional `--eapiN` opt-in flags must become the unconditional default (and the flag a `die`) once EAPI N is real - `be17010` desktop.eclass shipped the new behavior gated on a flag nobody could still pass.
- **To make a new eclass variable mandatory without breaking existing consumers: eqawarn in current EAPIs, `die` from the next EAPI onward** (3) - evidence: `fa7cc03` rpm.eclass (`RPM_COMPRESS_TYPE` required from EAPI 9); same enforcement ladder in `8946c7a` (DISTUTILS_EXT) and `5d00c0a` (PYTHON_COMPAT pruning). Deprecated variable *values* get an EAPI-gated rewrite shim instead of removal (`be58ce7` DISTUTILS_USE_PEP517).
- **Variables that shape metadata must be `@PRE_INHERIT`, processed by a `_set_globals` function that is `unset -f` after use** (2) - evidence: `035e309` rpm.eclass (RPM_COMPRESS_TYPE → USE-conditional BDEPEND, plus runtime QA check that the declared value matches the actual rpm payload); `1ddf0ff` gstreamer-meson (`GST_PLUGINS_MULTILIB` gates the multilib-minimal inherit, the `[${MULTILIB_USEDEP}]` suffix, and which phases get EXPORT_FUNCTIONS, with `die` on unknown values).
- **Validate eclass input variables at inherit time; give sanity checks documented opt-outs; never `readonly` public variables** - evidence: `d95d565` zig-utils (type/value check in `_set_globals` beats a downstream invalid-atom error); `c5dc07c` kernel-2 (`K_NO_VERSION_CHECK` opt-out instead of weakening the check globally); `534d050` qt6-build (readonly is irreversible and against tree convention). When splitting one user variable into two, default the new to the old: `: "${NEW:=${OLD}}"` (`f88a8c9` kernel-build).
- **`eapi9-*` compat shims (eapi9-pipestatus, eapi9-ver-rs) are for old EAPIs only - inherit them conditionally** (4) - evidence: `a0ca880` cvs.eclass (`case ${EAPI} in 7|8) inherit eapi9-pipestatus ;; 9) ;; esac`); `0be812d` kde.org (fallthrough `8) inherit eapi9-pipestatus ;&`); `1454aa9` greadme. When a refactor removes the last use of an inherited eclass, drop the inherit yourself - pkgcheck's UnusedInherits misses conditional/indirect users (`dda55cc` qt-utils kept a dead eapi9-pipestatus inherit). Often the shim is avoidable outright: a plain command takes `|| die` directly, and gratuitous pipelines force pipestatus machinery - `type -P name | head -n 1` had a dead `head` since `type -P` already prints one match (`30961de` qt-utils).
- **Detect sibling eclasses with `has <name> ${INHERITED}`, never their private `_FOO_ECLASS` guard variables; for OPTIONAL-mode eclasses also check the activation marker** (4) - evidence: `0949359` ecm.eclass, also `09493e9` (guard variables are @INTERNAL and break on skeleton changes; `${INHERITED}` is the PMS-supported record); `114e7d3` kde.org (branch phases on inherited cargo/git-r3 instead of forcing per-ebuild overrides); `ee0a1af` kde.org (inherited-cargo check alone broke `CARGO_OPTIONAL=1` consumers - must also test `${CARGO}`).
- **When dropping legacy support from an eclass, die loudly on the legacy trigger value and keep no-op exported phases only for the EAPIs that had them** (2) - evidence: `5afc1d0` ecm-common (`ver_test ${KFMIN} -lt 5.240 && die "KF5 is unsupported!"`; `EXPORT_FUNCTIONS pkg_setup` kept for EAPI 8 only); `0a1aabc` ecm.eclass.
- **Shared eclass/phase code testing a USE flag not all consumers declare must guard with `in_iuse`** - evidence: `48c28b3` wine.eclass (`use opengl` broke wine-proton which lacks the flag; use `! in_iuse flag || use flag`).
- **Publish a `*_USEDEP` output variable when many consumers must apply the same USE constraints to dependencies** - evidence: `9673f3e` selinux-policy-2 (`SELINUX_POLICY_USEDEP="selinux_policy_types_targeted(-)?,..."` mirrors the PYTHON_USEDEP idiom; kills hand-rolled per-flag RDEPEND loops that drift).
- **Keep reusable helpers in a non-phase-exporting `*-utils` eclass so standalone ebuilds can call them; before rewriting a shared symlink, verify this package owns it** - evidence: `8ddf2dc` dist-kernel-utils (symlink helpers moved out of phase-exporting kernel-install; check `has ${symlink_ver} ${REPLACING_VERSIONS}` / `has_version -r` before touching /usr/src/linux, else leave it alone).
- **When a new upstream release series raises its build-tool minimum, gate the BDEPEND on PV inside the eclass instead of editing every consumer** - evidence: `a57ab35` gstreamer-meson (`[[ ${PV} =~ 1.26.* ]] && BDEPEND=">=dev-build/meson-1.4"`, citing the release notes).
- **Centralize temporary resolver workarounds in the eclass, commented with the bug number, so cleanup is one deletion** - evidence: `004b88c` qt6-build (subslot-binding `RDEPEND="dev-qt/qtbase:6="` from the eclass gives portage the rebuild-ordering edge during Qt upgrades, bug 921333).
- **Grep CMakeLists.txt for an option before passing `-DNAME=OFF` across many consumers; pass `=ON` unconditionally when the feature is requested** (2) - evidence: `724fd98` ecm.eclass (ENABLE_PCH/WARNINGS_AS_ERRORS disabled only where declared, avoiding 'Manually-specified variables were not used' noise); `948357f` (asymmetric gating for BUILD_QCH: always ON under USE=doc so a vanished option fails visibly, OFF only if grep finds it).
- **Select Qt6 in ECM/KDE CMake via a `BUILD_WITH_QT6=ON` cache preload, not `-DQT_MAJOR_VERSION=6`** - evidence: `3a300cf` ecm.eclass (QT_MAJOR_VERSION is legacy and not honored everywhere; QtVersionOption.cmake defines the supported switch).

### Phase & shell hygiene

- **Write destructive phase code idempotently - pkg_preinst and friends may run twice (quickpkg)** - evidence: `755583f` dist-kernel-utils (unconditional rm of module symlinks died on re-run, bug 977187; guard with `[[ -L path ]]` before rm+dosym so the phase no-ops the second time).
- **Never rely on the current directory in phase code** (4) - wrap conditional directory changes in `pushd ... >/dev/null || die`/`popd` so code after the branch runs from a known cwd (`0fb0075` selinux-policy-2, bug 979024); pin cwd explicitly around `eapply_user` so user patches always apply from one documented root (`4cb0ad9`, bugs 794043/979024); keep live (-9999) and release branches convergent on the same end state (`1a6d900`); create files/symlinks with absolute `${S}`/`${WORKDIR}` anchors, never cwd-relative (`d1ee705` zig.eclass - zig resolved the link relative to --build-file, not cwd).
- **Helpers meant to work under `nonfatal` must save `$?` right after the real command and `return $rc` after cleanup** - evidence: `c084bb9` cmake.eclass (trailing `popd >/dev/null || die` returned 0 under nonfatal, reporting failed builds as success).
- **No `<<<` herestrings or heredocs in global-scope eclass/ebuild code - bash backs them with a temp file, violating the metadata-generation sandbox** (2) - evidence: `9d46871` kernel-2 (scoped-IFS unquoted expansion instead); `55db1fb` sec-keys (`mapfile -td ',' arr < <(printf %s "$str")`, bug 978941).
- **Never die on grep's exit status when scanning output for optional markers - validate only the producer via `PIPESTATUS[0]`** - evidence: `822c5ed` rpm.eclass (blanket pipestatus-die broke valid gzip/uncompressed rpms, bug 973157; no-match is a legitimate branch).
- **`keepdir`/.keep only for directories that must genuinely survive unmerge - mountpoints need no protection, Portage cannot remove a mounted filesystem** - evidence: `15b35d9` mount-boot (touch-.keep hack in pkg_prerm deleted as redundant).
- **hwdb-installing packages call `udev_hwdb_update` from both pkg_postinst and pkg_postrm; postinst helpers run the tool with `--root "${ROOT}"` and guard on tool presence, never skip because ROOT is set** (2) - evidence: `564d70f` udev.eclass (`systemd-hwdb update`, not deprecated `udevadm hwdb`); `4a385aa` (dropped `[[ -n ${ROOT} ]] && return`, which left chroot/cross installs with stale hwdb.bin; use `type systemd-hwdb &>/dev/null || return 0`).

### Cross-compilation correctness

- **Build-time inputs from installed dependencies resolve under ESYSROOT; EROOT/ED are install destinations only, EPREFIX only the literal prefix component** - evidence: `b860055` selinux-policy-2 (`SHAREDIR="${ESYSROOT}"/usr/share/selinux` instead of EPREFIX, bug 964031).
- **A "run this for the build machine" wrapper must reset sysroot variables too, not just CC/CHOST/flags** - evidence: `7042b40` toolchain-funcs (tc-env_build now sets `ESYSROOT=${BROOT}` and `SYSROOT=`; stale target values made sysroot-aware logic mis-detect cross builds).
- **Setting CMAKE_SYSTEM_NAME unconditionally requires setting CMAKE_CROSSCOMPILING explicitly** - evidence: `747db21` cmake.eclass (CMake treats a manual CMAKE_SYSTEM_NAME as "this is a cross build", bug 975603; emit TRUE/FALSE from `tc-is-cross-compiler`).
- **Never guess the target dynamic-linker path - compile a trivial test program with the target toolchain and read its `.interp` section via objcopy** - evidence: `7b83a56` sysroot.eclass (the ld.so-symlink heuristic only finds the default ABI's loader; multilib x86 needs /lib/ld-linux.so.2).
- **qemu-user exec wrappers are Linux-only: bail out gracefully with a distinct return code for foreign-kernel CHOSTs** - evidence: `257a31f` sysroot.eclass (`[[ ${CHOST} != *-linux-* ]]` → einfo + `return 2`; Hurd/BSD targets can never execute under qemu-user).
- **tc-export toolchain variables in (or before) the phase where their first consumer runs** - evidence: `9fce4db` apache-2 (PKG_CONFIG exported only in src_configure, but the pcre2-config wrapper was generated in src_prepare and captured the wrong pkg-config when cross-compiling, bug 932162).
- **When several setup helpers export CC/CXX, run the one with the strict requirement last, and always export CC and CXX as a consistent pair** (2) - evidence: `1477a7c` toolchain.eclass (D bootstrap clobbered Ada's load-bearing CC; Ada now runs last, D tolerates mismatch via its GDC override variable); `d9c17da` (the `-specs=${T}/ada.spec` override applied to CXX too, not just CC).

### Versioning, SLOT & distfiles

- **Never derive SRC_URI or upstream artifact names from `${PVR}` - `-rN` is reserved for ebuild revisions; encode upstream patch levels as `_pN`** (2) - evidence: `d92368f` selinux-policy-2 (BASEPOL defaulted to PVR, so a plain revbump broke fetching; `${PV/_p/-r}` translation plus an internal `$(ver_cut 1-2)` upstream-PV variable); `d6805ba` (new distfiles named after `${P}` directly; legacy translation kept only behind a `ver_test -lt` cutover instead of renaming old distfiles).
- **SLOT expresses parallel-installability only (subslot for ABI), never an update channel** - evidence: `ff1887e` nginx (stable/mainline/live slots that all blocked each other collapsed to `0/${PV}`; retiring bogus slots requires profiles/updates slotmove lines plus a revbump of every affected ebuild so the metadata propagates).
- **Gentoo project artifacts moved from dev.gentoo.org/~dev/dist/ to distfiles.gentoo.org/pub/proj/\<project\>/** - evidence: `2b19226` llvm.org.eclass (patchset/manpage tarballs; check the pub/proj path when a devspace URL dies).
- **Package families sharing one upstream source keep distro patches in a versioned side tarball selected by a single variable** - evidence: `87c413c` llvm (a fix is one `LLVM_PATCHSET=${PV}-rN` bump per ebuild instead of N patch files; build-fix-only patchset bumps go in place without revbumps).
- **Sparse monorepo checkouts: a missing-file error after a bump means extend the component list, not patch the reference out** (2) - evidence: `0544891` llvm (utils/docs added to LLVM_COMPONENTS when upstream CMake started referencing it); `0bfe82d` (mlir/utils/pygments; test-only paths go in LLVM_TEST_COMPONENTS).

## Idioms

EAPI-9-era eclass skeleton - inclusion guard wraps the EAPI check (`59722c2`):
```bash
if [[ -z ${_FOO_ECLASS} ]]; then
_FOO_ECLASS=1

case ${EAPI} in
	8|9) ;;
	*) die "${ECLASS}: EAPI ${EAPI:-0} not supported" ;;
esac
```

Ban a legacy function from the next EAPI while old consumers keep working (`787364f`):
```bash
makeopts_jobs() {
	if ! has "${EAPI}" 7 8; then
		die "Calling makeopts_jobs is banned in EAPI ${EAPI}, use get_makeopts_jobs instead"
	fi
	_makeopts_jobs "$@"
}
```

One FUNCNAME-dispatching guard for a whole family of deprecated wrappers (`cd16902`):
```bash
_qt_eapi9_banned_deprecated_func() {
	[[ ${EAPI} == 8 ]] && return
	case ${FUNCNAME[1]} in
		qt6_get_libdir) die "${FUNCNAME[1]} is banned in EAPI ${EAPI}" ;;
		qt6_get_*) eqawarn "QA Notice: ${FUNCNAME[1]} is deprecated, use ..." ;;
	esac
}
```

Compat shim inherited only for old EAPIs (`a0ca880`):
```bash
case ${EAPI} in
	7|8) inherit eapi9-pipestatus ;;
	9) ;;
	*) die "${ECLASS}: EAPI ${EAPI:-0} not supported" ;;
esac
```

New-variable enforcement ladder: warn now, die next EAPI (`fa7cc03`):
```bash
if [[ -z ${RPM_COMPRESS_TYPE} ]]; then
	if [[ ${EAPI} == [78] ]]; then
		eqawarn "QA Notice: RPM_COMPRESS_TYPE unset, required from EAPI 9"
	else
		die "RPM_COMPRESS_TYPE= must be defined starting with EAPI 9"
	fi
fi
```

Deprecated eclass reduced to a `@PROVIDES` wrapper (`4b99041`):
```bash
# @SUPPORTED_EAPIS: 7 8
# @PROVIDES: shell-completion
if [[ -z ${_BASH_COMPLETION_R1_ECLASS} ]]; then
_BASH_COMPLETION_R1_ECLASS=1
inherit shell-completion
fi
```

Pre-inherit variable processed once and cleaned up (`035e309`):
```bash
# ebuild, before inherit:
RPM_COMPRESS_TYPE="zstd"
inherit rpm
# eclass:
_rpm_set_globals() { ... BDEPEND=">=app-arch/rpm-4.19.0[${rpmuse%,}]" ... }
_rpm_set_globals
unset -f _rpm_set_globals
```

Eclassdoc deprecation block, correct tag order (`deda2c3`, `b6ee374`):
```bash
# @FUNCTION: makeopts_jobs
# @USAGE: [${MAKEOPTS}] [inf]
# @DEPRECATED: get_makeopts_jobs
# @DESCRIPTION:
```

nonfatal-safe helper: preserve the real command's exit status past cleanup (`c084bb9`):
```bash
"${build_tool[@]}" ... 
local rc=$? # save build tool's exit code in case of running under nonfatal
popd > /dev/null || die
return $rc
```

Metadata-safe string splitting - no herestrings/heredocs at global scope (`9d46871`, `55db1fb`):
```bash
# instead of: IFS="." read -r -a ARR <<< "${VAR}"
local IFS=.; ARR=(${VAR}); unset IFS
# or, with an explicit delimiter:
mapfile -td ',' arr < <(printf %s "${str}")
```

Grep-guarded CMake -D flag - only disable options the project declares (`724fd98`, `948357f`):
```bash
if grep -Eq "option.*ENABLE_PCH" CMakeLists.txt; then
	echo "-DENABLE_PCH=OFF"
fi
```

Exact per-ABI dynamic-linker discovery via .interp (`7b83a56`):
```bash
echo 'int main(void){return 0;}' > "${test}.c"
$(tc-getCC) ${CFLAGS} ${CPPFLAGS} ${LDFLAGS} -o "${test}" "${test}.c" || die
read -d '' -r DLINKER < <($(tc-getOBJCOPY) -O binary -j .interp -- "${test}" /dev/stdout)
[[ -f ${MYEROOT}${DLINKER} && -x ${MYEROOT}${DLINKER} ]] || DLINKER=
```

## Automatable checks

Feeds a QA-scan of gentoo-zh. "Ebuilds" = `*.ebuild` in the overlay.

- **Deprecated/dead eclass inherits**: parse `inherit` lines from all ebuilds; for each inherited eclass, grep its ::gentoo file header for `^# @DEAD` or `^# @DEPRECATED:`. Any hit is a violation (report the named replacement). Evidence: `b7c38ce`, `39b122a`.
- **Banned multiprocessing helpers**: `grep -RP '(?<!get_)makeopts_(jobs|loadavg)' --include='*.ebuild' --include='*.eclass'`. Any hit dies at runtime in EAPI 9; fix is the `get_` prefix. Evidence: `90e9f9f`.
- **Deprecated multilib alias**: `grep -r multilib_parallel_foreach_abi`. Any hit → replace with `multilib_foreach_abi`. Evidence: `940c892`.
- **Removed functions in any code path** (including USE-conditional branches CI never runs): `grep -rE '\b(epatch|epause|ebeep|versionator|user_add)\b' --include='*.ebuild'`. Any hit in an EAPI>=7 ebuild is a violation. Evidence: `8202bb4`.
- **Old DISTUTILS_USE_PEP517 spellings**: `grep -rE 'DISTUTILS_USE_PEP517=(flit|flit_scm|jupyter|poetry)\s*$'`. Violation (fatal from EAPI 9); map to flit-core/flit-scm/jupyter-packaging/poetry-core. Evidence: `be58ce7`, `5c06ffb`.
- **Dead PYTHON_COMPAT implementations**: `grep -rE 'PYTHON_COMPAT=.*(python3_(9|10|11)\b|pypy3\b(?!_)|python3_13t)'`. Violation in any ebuild about to go EAPI 9 (fatal there), cleanup-worthy everywhere. Evidence: `5d00c0a`.
- **Positional make_desktop_entry in EAPI-9 ebuilds**: for ebuilds with `EAPI=9`, flag `make_desktop_entry` calls with more than one non-flag argument (need `-n`/`-i`). Evidence: `86137a6`, `c7fda20`.
- **Banned/deprecated Qt helpers**: `grep -rE '\b(qt5_get_[a-z]+|eqmake5|qt6_get_(libdir|bindir|libexecdir|mkspecsdir))\b' --include='*.ebuild'`. qt5_* are banned in EAPI 9; qt6_get_* are deprecated → `qt_get_*` / `qt_get_broot_binary`. Also flag `inherit .*qmake-utils` where the ebuild calls no `eqmake`/qmake function (should be qt-utils). Evidence: `cd16902`, `c87891596`, `0db7dda`.
- **rpm inherit without RPM_COMPRESS_TYPE**: ebuilds with `inherit .*\brpm\b` and no `RPM_COMPRESS_TYPE=` before the inherit line. eqawarn today, fatal in EAPI 9. Evidence: `fa7cc03`, `035e309`.
- **eapi9-* shims in EAPI 9**: ebuilds/eclasses with `EAPI=9` (or eclass case including 9 unconditionally) that inherit `eapi9-pipestatus`/`eapi9-ver-rs`. Violation: shim must be conditional on EAPI 7/8 or dropped. Evidence: `a0ca880`, `dda55cc`.
- **Own-eclass EAPI list drift** (for overlay eclasses): parse `# @SUPPORTED_EAPIS:` and the `case ${EAPI}` allowlist; mismatch is a violation. Also flag bare `# @DEPRECATED` with no argument. Evidence: `c6b9933`, `b6ee374`.
- **Manual acct deps duplicating the eclass**: acct-user ebuilds containing both `acct-user_add_deps` and `[RB]?DEPEND\+=" *acct-group/`. Violation: delete the manual appends. Evidence: `5e00a46`.
- **Duplicate exported phases**: ebuilds inheriting both `cargo` and (`pypi` or `distutils-r1` with PEP517 unpack) without defining `src_unpack` → flag for explicit phase definition. Evidence: `b16b5e3`.
- **`default` shadowing an eclass phase**: ebuilds inheriting a phase-exporting eclass (haskell-cabal, postgres-multi, kde.org, ...) whose phase override calls `default` and never calls `<eclass>_src_<phase>`. Heuristic, but every hit found a real bug in the sample. Evidence: `1c70196`, `c21d55c`.
- **Private eclass-guard probing**: `grep -rE '\[\[ -[nz] \$\{_[A-Z0-9_]+_ECLASS\}' --include='*.eclass'` where the guard is not the file's own inclusion guard. Violation: use `has <eclass> ${INHERITED}`. Evidence: `09493e9`.
- **Global-scope herestrings/heredocs**: flag `<<<` or `<<` appearing before the first function definition in any overlay eclass/ebuild (temp-file creation breaks the sandboxed metadata phase). Evidence: `9d46871`, `55db1fb`.
- **PVR in fetch metadata**: `grep -rE 'SRC_URI=.*\$\{?PVR' --include='*.ebuild' --include='*.eclass'` (or any helper deriving distfile names from PVR). Violation: encode the extra level as `_pN` in PV. Evidence: `d92368f`, `d6805ba`.
- **postgres eclass consumers without REQUIRED_USE**: ebuilds inheriting `postgres-multi`/`postgres` with no `REQUIRED_USE=.*POSTGRES_REQ_USE`. Violation: emergeable with an empty target set. Evidence: `2ddb4b0`.
- **Legacy Qt6 selector**: `grep -r 'QT_MAJOR_VERSION' --include='*.ebuild'` in ECM/KDE-style packages. Replace with a `BUILD_WITH_QT6=ON` cache preload (ecm.eclass does this itself now). Evidence: `3a300cf`.
- **Deprecated hwdb command**: `grep -rn 'udevadm hwdb' --include='*.ebuild'`. Replace with `udev_hwdb_update` (systemd-hwdb update --root), called from both pkg_postinst and pkg_postrm. Evidence: `564d70f`, `4a385aa`.
