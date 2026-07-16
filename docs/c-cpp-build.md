# C/C++ build system lessons (cmake/meson/autotools, gcc/clang fallout, musl, LTO, C23)

Distilled from gentoo/gentoo commits (2025-2026 window). Covers build-system fixes for cmake/meson/autotools/raw-Makefile packages, new-GCC/Clang version breakage (missing includes, C23, stricter diagnostics), musl/glibc divergence, LTO and static-archive handling, forced-flags/-Werror hygiene, and cross-compile toolchain plumbing; subsections below the core rules add src_test practice, patch/bump management, USE-flag and dependency policy, install/runtime integration, GPU/LLVM packaging, and shell hygiene. Shas refer to the gentoo/gentoo repo.

## Rules

- **When a package breaks on a new GCC/libstdc++/Clang (or gcc+musl) with "X was not declared" / "PATH_MAX undeclared" / "(u)intNN_t undeclared", the fix is almost always a missing direct `#include` that used to arrive transitively — ship a minimal include-only patch with bug + upstream commit URLs in the header, never pin the old compiler** (recurred 8x). Evidence: `f92eebc` ansifilter (gcc-17, `<sstream>`); also `aef3dc9` gerbera (gcc-17/clang-22: `<cstring>`, `<string>`, fmt/format.h), `31f17f4` qtwebengine (gcc-16+musl: `<climits>` for PATH_MAX, `<cstdint>`), `3f4bda9` qtwebengine GN, `f079499` devilutionx (gtest update dropped transitive `<iomanip>`), `aff10eb` prusaslicer (catch2 header split), `4b2f91e` soapyuhd (boost stopped providing lexical_cast.hpp), `2423dff` konversation (USE=-crypt removed the QCA headers that pulled `<QThread>`).
- **A patch that only fixes a build failure needs no revbump — nobody has a broken install of something that never built; revbump only when the fix changes runtime behavior or installed files** (recurred 6x). Evidence: `f92eebc` ansifilter (explicit rationale); also `fce49bc` systemd (gcc-BPF fix into existing -r1), `ea80fbc` siril, `71be8e5` strawberry, `46a7aa4` caffe2, `d49bdd6` cmake (deliberate no-revbump when pruning files split into a companion package — fine only without collision/runtime breakage, document why). Counter-case: `b8bff05` libcuefile — clang-22 rejected `if (0 < i <= n)`, and splitting it into `(0 < i) && (i <= n)` changes runtime results, so revbump.
- **CMake 4 fallout ("Compatibility with CMake < 3.5 has been removed"): patch `cmake_minimum_required` up — preferring the range form upstream adopted (e.g. `3.0...3.10`); if the offending CMakeLists is in an unbuilt subtree (examples, bundled deps) just `rm` it; if cmake.eclass QA fires on bundled sources the build never configures, set `CMAKE_QA_COMPAT_SKIP=1` above the inherit** (recurred 6x). Evidence: `796e1fd` libldac (range form matching upstream); also `b8bff05` libcuefile (plus CMP0115 explicit source extensions), `13a7a9d` quiche (vendored boringssl), `e30ef77` kicad-doc, `22ae82c` msgpack (rm unused example CMakeLists), `0c0ebc5` punes (QA-skip for unbuilt bundled sources).
- **Hand-rolled Makefile/SCons builds hardcode `cc`/`gcc`: override on the emake command line with `CC="$(tc-getCC)"`, or `tc-export CC CXX AR RANLIB` when the build reads the environment (in `$(shell ...)`, helper scripts, or SCons detect.py — command-line VAR=value does not survive those); replace `sdl-config`-style tools with `${PKG_CONFIG}`** (recurred 7x). Evidence: `b6e256f` emacs-jabber (`emake CC="$(tc-getCC)"` beats the Makefile's assignment); also `12a4e50` dietlibc ($CC empty in make subshells — tc-export, not emake args), `7c612bc` godot (SCons dropped AR handling; tc-export + patch detect.py to read os.environ), `6e24cbb` gst-plugins-sndio (BSD Makefile: tc-export CC, override BSD_INSTALL_*), `e82ef01` gfan (patch CC/CXX to `?=` and inject CPPFLAGS/CXXFLAGS/LDFLAGS into rules), `ebebddf` tomenet (sdl-config → `$(shell ${PKG_CONFIG} --cflags sdl2)`), `666220a` jgrf (build the feature VAR=value list once in src_configure and reuse in every emake — only toolchain/DESTDIR vars belong per-phase).
- **When upstream's build system force-adds optimization/hardening/LTO flags (-O2, -D_FORTIFY_SOURCE, -fstack-protector, -flto, add_global_arguments), carry a respect-flags patch deleting those blocks so toolchain defaults and user flags govern — the distro toolchain already sets hardening at possibly stronger levels** (recurred 4x). Evidence: `e6dc5e5` leancrypto (meson add_global_arguments forced -flto=auto/-fcf-protection, bugs 975182/975614); also `a1cbb4f` sysstat (Makefile.in dropped CPPFLAGS, hardcoded -O2), `8e14d7e` ttyrec (homegrown configure probes and injects flags), `ebebddf` tomenet (redefined _FORTIFY_SOURCE=2 clashing with toolchain).
- **When unbundling vendored libraries, physically `rm -r` the bundled directory in src_prepare so any silent fallback becomes a hard build failure — never trust the build system's use-system-lib switch alone** (recurred 8x). Evidence: `2fd6c23` digraphs (configure silently fell back to bundled planarity-4 and the "port" was never tested); also `1502983` godot (builtin_* switches unreliable — rm + pass the switch), `850c8e3` sidplayfp (rm libs/fmt + --with-system-fmt), `c727d29` jq (rm vendored oniguruma pre-eautoreconf, MINPV sync comment), `59256b1` cereal (rm + sed include paths to system headers), `e204840` godot (also sed detect scripts for slotted .pc names like mbedtls-3.pc), `fc22aa0` telegram-desktop (explicit keep-list of bundled dirs, rm everything else, re-audit the list on every bump), `e245084` scribus (a bundled lib you must keep: build it STATIC and strip its install() rules to avoid collisions — refresh that patch on live syncs).
- **Configure misdetection (automagic deps, broken cross run-tests, environment pollution, musl quirks): export the exact autoconf/libtool cache variable (`ac_cv_*`, `lt_cv_*`, project `*_cv_*`) before econf instead of patching configure** (recurred 5x). Evidence: `948ec1f` dovecot (cross: pre-seed i_cv_epoll_works etc. under tc-is-cross-compiler, arch values from toolchain-funcs); also `e541efc` openvswitch (`ac_cv_header_valgrind_valgrind_h=$(usex valgrind)` kills automagic), `c7d26cd` verbiste (musl: `gt_cv_func_gnugettext1_libc=yes`), `aca68af` toolchain.eclass (stray /usr/lib64 library broke a libtool probe — lt_cv_ override), `96f91f7` nvc (probe succeeds but glibc's fpurge is semantically broken — drop it from AC_CHECK_FUNCS / force the fallback path).
- **When the implicit-function-declaration QA notice fires on configure probes for symbols that genuinely cannot exist on the target (other-OS APIs, removed kernel calls, MSVC builtins), whitelist them in `QA_CONFIG_IMPL_DECL_SKIP=( sym )` with a per-symbol comment — patch nothing** (recurred 4x). Evidence: `e28a4db` net-snmp (ioctlsocket is Windows-only, sysctl removed since kernel 5.5); also `6ca648f` libpcre2 (`__assume` is MSVC-only), `31ca3c4` memcached (htonll), `63615fe` charliecloud (probed function newer than any released version of the dep — expected to fail today).
- **Any ebuild installing static libraries must inherit `dot-a`: `use static-libs && lto-guarantee-fat` in src_configure and `strip-lto-bytecode` in src_install, so LTO builds ship machine code instead of compiler-version-locked GIMPLE bytecode** (recurred 3x). Evidence: `1db142e` acl; also `4d10c7f` attr, `e541efc` openvswitch.
- **Strip hardcoded `-Werror` from upstream build files (patch Makefile.am, sed Makefile.in after eautoreconf, or turn off the upstream warning toggle like `-DFIX_WARNINGS=OFF`) — every new compiler release adds warnings and will break the build** (recurred 3x). Evidence: `67dca78` tpm2-openssl (drop -Werror from COMMON_CFLAGS); also `2e2dfb3` zfs (sed Makefile.in post-eautoreconf so it survives regeneration), `e27fa27` indilib (disable the CMake toggle in mycmakeargs with a bug comment).
- **A patch touching configure.ac or m4/ only takes effect with `inherit autotools` + `eautoreconf`; conversely, patching the generated Makefile.in with the same hunk as Makefile.am avoids pulling in eautoreconf entirely; after eautoreconf on gettext packages, fix po/Makefile.in.in's stale `@mkdir_p@` to `@MKDIR_P@`** (recurred 5x). Evidence: `ea0bccb` libkdumpfile (binutils-2.46 patch touched m4/tools.m4 → eautoreconf added); also `f8c5ea5` rtorrent (riscv arch-case in scripts/common.m4), `ab28660` libxcb (identical hunks in .am and .in, no eautoreconf), `102a701` nagios-plugins (mkdir_p gotcha), `3a5e870` nghttp2 (conditional inherits: autotools belongs in the 9999 branch that actually runs eautoreconf, not the release branch).
- **CMake builds that download at build time (FetchContent/ExternalProject with GIT_REPOSITORY) fail under the network sandbox: add the pinned dependency tarball to SRC_URI and point the build at it — `-DFETCHCONTENT_SOURCE_DIR_<NAME>=path`, or patch the declaration to a local SOURCE_DIR, or neutralize with `DOWNLOAD_COMMAND true` + symlink into `_deps/<name>-src`** (recurred 3x). Evidence: `0e9c7e1` ollama (FETCHCONTENT_SOURCE_DIR_LLAMA_CPP); also `5424de5` libsquish (patch FetchContent_Declare to a -D cache var), `ae4a5cf` ollama (DOWNLOAD_COMMAND true + symlink).
- **Never rely on an upstream CMake option default: pass explicit ON/OFF in both USE branches (defaults flip between releases), and kill automagic probes the ebuild has no flag for — `-DCMAKE_DISABLE_FIND_PACKAGE_X=ON` or the project's own `_USE_*=OFF` toggle** (recurred 7x). Evidence: `96d99dd` ettercap (upstream flipped ENABLE_GTK default to ON, USE=-gtk still built GTK); also `9e1237c` qtcurve (find_package(Git) picked up an undeclared dep), `bef0575` umfpack (`-DSUITESPARSE_USE_CUDA=OFF` — build depended on whether nvcc existed), `044bfbf` dolphin (`-DCMAKE_DISABLE_FIND_PACKAGE_Git=ON` for reproducibility), `f29b5d7` upower (meson analog: diff meson_options.txt on bump — new default-on installed_tests shipped test binaries), `fe0ed79` android-tools (internal convenience libs became installed .so's — pass -DBUILD_SHARED_LIBS=OFF explicitly), `09eef99` qt6-build.eclass (Qt 6.11 default-on SBOM generation turned off centrally in the shared eclass: -DQT_GENERATE_SBOM=OFF).
- **musl build failures map to known fixes: `sys/cdefs.h: No such file` → delete the include (glibc-internal header); `sys/queue.h` → `elibc_musl? ( sys-libs/queue-standalone )`; fts_open/fts_read → `sys-libs/fts-standalone`; ucontext functions → `sys-libs/libucontext`; and match musl triplets with `*-musl*`, not `*-musleabi*`** (recurred 6x). Evidence: `ea80fbc` siril; also `46c53b1` aml, `413b84e` exfatprogs, `e9bc72e` systemd, `9d32de6` ghc (llvm-target m4 glob missed plain *-musl*), `35b6bd7` systemd (express musl-only minimum features as `elibc_musl? ( >=sys-libs/musl-X )` and retire patched-musl -rN pins once an upstream release covers them).
- **gcc-15/C23 fallout: patch real prototypes/headers at the exact declaration site (K&R `extern void *malloc();` → full prototype or `#include <stdlib.h>`) instead of downgrading -std; when a -std workaround is unavoidable, prefer `-std=gnuXX` over `-std=cXX` (avoids feature-test-macro clashes) and tag it `# TODO: drop when > VERSION` + bug URL so bumps remove it** (recurred 4x). Evidence: `086dbe7` ghc; also `ebebddf` tomenet, `44f6da6` jq (stale `append-cflags -std=gnu17` found via its TODO on bump), `8d94a9d` arprec (same principle for C++: drop `register`, fix C++11 narrowing, one minimal patch per diagnostic instead of forcing an old -std or -Wno flags).
- **Newer Clang turns latent bugs into hard errors — chained comparisons (`0 < i <= n`), non-const comparison operators used by sort, C23-const `strchr` returns under glibc-2.43: fix the code minimally (split the comparison, add `const`), and revbump when the fix changes behavior** (recurred 3x). Evidence: `b8bff05` libcuefile; also `78570ec` quimup (operator< missing const), `6ca648f` libpcre2 (glibc-2.43 const-return string functions).
- **Configure-script bashisms (`test x == y`) break under POSIX sh: either patch the generated configure directly (safer than regenerating a bundled sub-library) or run `CONFIG_SHELL="${BROOT}/bin/bash" econf`, linking the upstream fix so the workaround can be dropped** (recurred 3x). Evidence: `6d71f6d` ghc (one-char `==` → `=` in bundled terminfo configure); also `77bd26f` exfatprogs, `0dde187` modsecurity.
- **Cross builds failing with bare `gcc: No such file or directory` while building helper tools: export/pass `CC_FOR_BUILD="$(tc-getBUILD_CC)"` (works as an econf VAR=value argument too); if a clang-built host helper segfaults, append `-fno-strict-aliasing` to HOSTCFLAGS** (recurred 3x). Evidence: `90d1bd0` bash; also `5cbe769` libassuan, `7fb8218` perl (miniperl strict-aliasing UB under clang).
- **`filter-lto` when LTO genuinely cannot work — mixed C++/Rust toolchain links or a documented upstream LTO bug — always with an ewarn/bug comment; do not filter as a first resort** (recurred 2x). Evidence: `82e00a0` dnsdist (bug 963128, mixed toolchains); `2aa7108` libxcrypt (bug 852917).
- **Header/library search paths and build-system hint variables added by ebuilds must be rooted at `${ESYSROOT}`, never `${EPREFIX}` or /usr, or cross builds compile against build-host headers** (recurred 2x). Evidence: `3c5e4ec` openldap (`append-cflags -I"${ESYSROOT}"/usr/include/iodbc`, acct-* moved to RDEPEND); `71afb2d` meson.eclass (BOOST_INCLUDEDIR/BOOST_LIBRARYDIR).
- **When a dependency's public headers adopt a newer C++ standard, raise the consumer's `CMAKE_CXX_STANDARD` (patch or sed, gated on `has_version` if both dep versions are in tree) rather than hacking CXXFLAGS** (recurred 2x). Evidence: `f000e35` merkaartor (abseil now needs C++20); `83e819d` soapyuhd (uhd headers use C++17, pinned standard was 14).
- **A build failure only with a USE flag disabled means optional-feature sources or declarations are wired wrong: fix the build-system option guard or the too-broad ifdef with an upstreamable patch, and encode genuine inter-feature requirements as REQUIRED_USE; test both USE states** (recurred 3x). Evidence: `c7d1c4d` merkaartor (exiv2 sources compiled with GEOIMAGE=0); also `71be8e5` strawberry (declaration inside `#if HAVE_MOODBAR` used unconditionally), `603e348` sunshine (include dir tied to WAYLAND_FOUND + `REQUIRED_USE="pipewire? ( wayland )"`).
- **Dependency-bump compile fallout beyond includes: code using macros that leaked from a dep's headers (patch to the project's own equivalent), new dep symbols colliding with a consumer's same-prefixed internal functions (rename patch, the library owns its prefix), and stricter header-only releases (temporary `<upper-bound` pin with the error in the commit message)** (recurred 5x). Evidence: `b5e0d30` postgis (gdal stopped leaking MIN); `6731e63` tar (acl-2.4.0 added acl_*_at, tar's static wrappers collided); `c3eb96c` rspamd (`<dev-cpp/doctest-2.5`); `338ce0c` freecad (Qt 6.11 dropped legacy Qt${N}X_LIBRARIES CMake result vars — backport the upstream imported-target fix with PR + bug URLs in the patch header); `c6fb64e` rspamd (follow-up: scope such pins to exactly the broken versions and lift them per version as upstream fixes confirm, linking with a `Fixes:` tag).
- **Parallel-make failures: fix the missing prerequisite in Makefile.am when feasible; otherwise `emake -j1` with a `# bug #NNNN` comment — never a bare silent -j1** (recurred 2x). Evidence: `d0025dd` neard (added `$(local_headers)` prerequisite, "never MAKEOPTS=-j1"); `a7c6e16` xmlrpc-c (race not worth patching, commented -j1).
- **Patch custom Makefile link rules for toolchain correctness: user LDFLAGS must precede the object list and `-l` libraries follow it (or --as-needed discards them), and bare `ld -r` partial links must become `$(CC) -r` so cross prefixes and LTO plugins are used**. Evidence: `84e2b59` exim (as-needed link failure, patch re-spun each bump); `fe84ecd` exim (`ld -r` → `$(CC) -r`, bug 976375).
- **Raw-Makefile installs on Prefix: pass `DESTDIR="${D}"` and embed `${EPREFIX}` in each path variable — combining `${ED}` with EPREFIX-bearing paths double-prefixes**. Evidence: `0a0be8d` libtommath.
- **Compiler version gates written as `(__GNUC__ >= m && __GNUC_MINOR__ >= n)` break on every new major with minor 0; rewrite as `__GNUC__ > m || (__GNUC__ == m && __GNUC_MINOR__ >= n)`**. Evidence: `0e95653` zopfli (bundled lodepng misdetected restrict on GCC 17.0).
- **Treat `__attribute__((const/pure))` on functions reading lazy-init/cached state as a latent miscompile — newer GCC legitimately CSEs the calls away; remove the attribute**. Evidence: `cc9bf25` mesa (llvmpipe SIGFPE, util_get_cpu_caps CSE'd before init).
- **Forcing a specific `_FORTIFY_SOURCE` level needs `-D_GENTOO_NO_FORTIFY_SOURCE` alongside the -U/-D pair — Gentoo's Clang driver injects fortify itself and ignores a plain -U**. Evidence: `f982c02` systemd-utils (bug 971773).
- **Cross link pulling host /usr/lib libraries ("incompatible with elf_ARCH" from lld): the shipped libtool relinks with -rpath /usr/lib — `inherit libtool` + `elibtoolize` in src_prepare, no eautoreconf needed**. Evidence: `ac5f7ea` ngtcp2 (bug 978993).
- **ld.lld rejects version scripts naming undefined `_init`/`_fini` ("assignment of 'local' to symbol failed"): patch the local: stanza out of the .sym files**. Evidence: `6b667c6` libpcre2 (bug 973026).
- **When a backported patch touches code generators/templates whose output ships pregenerated in the tarball, enable the build's maintainer/regeneration mode (`-Dmaintainer-mode=true`) or the patch silently does nothing**. Evidence: `67f70a9` glibmm.
- **Verify every `use_enable`/`use_with` second (option-renaming) argument against `./configure --help` — autoconf silently ignores unknown --enable-* switches, so a wrong name makes the USE flag a no-op, visible only as the "Unrecognized configure options" QA notice**. Evidence: `ad78494` gettext (bug 910070: `use_enable xattr attr` vs real switch --enable-xattr).
- **A configure log showing a bare flag executed as a command (`-DHAVE_CONFIG_H: command not found`) means an empty toolchain variable — `tc-export CPP` (or CC/LD) before econf**. Evidence: `f936d2d` gtk+ (bug 922298).
- **If the build system calls pkg-config (PKG_CHECK_MODULES / pkg_check_modules / meson dependency()), declare `BDEPEND="virtual/pkgconfig"` — missing it only surfaces on minimal systems**. Evidence: `799149d` exfatprogs.
- **CMake project files living in a tarball subdirectory: set `CMAKE_USE_DIR="${S}/subdir"` and keep S at the source root — never point S at a nested build-system dir, or PATCHES/eapply_user can't touch the real sources**. Evidence: `40fb544` qxlsx; `3649c15` libmediainfo (S at the autotools subdir made source patches unappliable; cd into the build dir per phase instead).
- **When a build executes just-built target binaries (code generators, CHECK_C_SOURCE_RUNS), cross builds need a second native tree: configure/build only the helper tools with `tc-env_build`, point the target build at them by absolute path, and sed RUNS-checks to COMPILES; native-tool deps go in BDEPEND**. Evidence: `6ec3e66` mysql-connector-c.
- **Every mycmakeargs literal must start with `-D` — a missing D (`-BUILD_X=no`) is swallowed silently and the option never takes effect**. Evidence: `98e55e6` conky (bug 979116, USE=nvidia build broke).
- **CMake `install(CODE ...${CMAKE_INSTALL_PREFIX}...)` post-install steps escape DESTDIR staging (sandbox violation / missing files): patch into a POST_BUILD custom command plus a regular install(FILES)**. Evidence: `f676656` spsdeclib.

### Tests & src_test

- **When tests can load the installed copy instead of the just-built one, replicate upstream's test env in src_test: export the package's runtime-lookup vars into BUILD_DIR and prepend BUILD_DIR paths to PATH/LD_LIBRARY_PATH** (recurred 2x). Evidence: `e6cf603` mlt (MLT_REPOSITORY/MLT_DATA into ${BUILD_DIR}/out, bug 978139); `6c94862` clazy (recreate the expected dir layout under BUILD_DIR with symlinks, bug 811723).
- **Skip broken/flaky ctests individually via a CMAKE_SKIP_TESTS array with a per-entry bug-number comment — never RESTRICT the whole suite; `$(usev <arch> 'name')` for arch-only failures, mirror the skip into every in-tree version incl. 9999, prefer an upstreamable SKIPIF/conditional-skip patch over rm-ing test files, and rm outright only for env-independent flakiness** (recurred 9x). Evidence: `457585e` karchive; also `ce7f9f5` kwidgetsaddons, `d0c2fda` plasma-nm (upstream-bug URL comment), `46ca3e2`+`3b0d9cb` kdepim-addons (port the commented list forward on bumps), `5b9a0eb` libksysguard (flaky — same edit in all versions), `aeee647` glslang (usev arm), `090618b` libpeas (unported third-party dep: upstream patch disabling only those tests), `87b1565` php (SKIPIF on GD_BUNDLED beats rm in src_prepare), `843938e` mlir (unpredictable test rm'd in src_prepare with comment).
- **Skip whole categories of ctest tests by label — `myctestargs=( -LE "Fortran" )` — instead of enumerating names; future upstream additions are covered automatically**. Evidence: `be2b3f6` cmake (bug 835014: name list went stale every release).
- **For meson suites with sandbox-hostile subsets, whitelist suites dynamically: parse `meson test --list` into an array, unset a per-USE/per-arch skip list, run `meson_src_test ${!SUITES[@]}`; normalize meson install perms with --install-umask plus fperms**. Evidence: `650b7a4` kea.
- **Out-of-tree test subprojects (a separate meson tree the main build never configures): run meson_src_configure/compile/test a second time with EMESON_SOURCE at the test dir and a distinct BUILD_DIR**. Evidence: `d8a103f` audacious.
- **Tests creating unix sockets fail on long portage paths (AF_UNIX ~108-byte limit) — failures appear/vanish with ${PF} length, e.g. after a mere -rN; export a short TMPDIR under /tmp for src_test**. Evidence: `56bb18b` power-profiles-daemon.
- **A test reading files written by another test races under parallel/unordered harnesses: merge the consumer's assertions into the producer's script — never rely on automake/ctest execution order**. Evidence: `f40b5c9` gengetopt (bug 978553).
- **Tests failing only on musl/busybox/rust-coreutils usually encode GNU assumptions: iconv //IGNORE, charset names, stateful encodings (skip per ICONV_IMPL); multicall `true` copied as a stamp executable (use touch + chmod +x)** (recurred 2x). Evidence: `11c33d5` php (SKIPIF on ICONV_IMPL); `843dfaa` squid (`cp $(TRUE) $@` → touch).
- **When a bump only changes diagnostic/expected output, patch the stored expectation (.ok) files to match instead of disabling the test; branches upstream never tarballs get self-hosted snapshots (distfiles.gentoo.org/pub/dev/) with a subslot branch policy (0/stable vs 0/advanced)** (recurred 2x). Evidence: `670c0e7`+`bef3c60` netpbm (pm_message rewrap).
- **Test suites shelling out to tools with optional features (grep -P) need an explicit `test? ( pkg[useflag] )` BDEPEND — host defaults differ**. Evidence: `a35951d` i3status (sys-apps/grep[pcre], bug 978080).
- **Tests needing large scratch space: inherit check-reqs gated on USE=test (with `RESTRICT="!test? ( test )"`), calling a shared helper from BOTH pkg_pretend and pkg_setup**. Evidence: `b1243f0` tar (10G, bug 978323).
- **If upstream's test target only lints sources (shellcheck, tabs, security greps), neutralize src_test with a commented no-op `:` instead of chasing failures or RESTRICT=test**. Evidence: `e04ae7f` mutt (bug 978743).

### Patch & bump management

- **Backports carry provenance and revbump: upstream commit/PR/bug URLs in the patch header (PR number in the filename too), revbump whenever installed files or runtime behavior change — header-only libs included (consumers must recompile) and even a shipped test-utility binary counts; rewrite patch paths when the release-tarball layout differs from git** (recurred 6x). Evidence: `b115719` postgresql; also `a75335a` curl, `38a1122` pjproject (pr5031 in the filename), `b417054` boost ("paths adapted to dist layout" note in header), `0127311` libmemcached-awesome, `0c90f5d` uhd (USE=test-only link failure still revbumped).
- **On every bump, diff old vs new PATCHES: downstream-only patches are carried forever (mark with a comment), backports are dropped only after confirming the fix is in the release, non-applying patches get a rebased copy under a new version-prefixed filename (old ebuilds keep the old file), and carried patches may have become upstream configure options** (recurred 3x). Evidence: `f6f229a` kde-cli-tools (bump silently dropped the downstream split patch, bug 978033); also `d331c23` qemu, `9a3f6bd` amule (patches → -D options, niche unconditional dep → USE-conditional).
- **A rename-only bump (100% similarity) plus a new version-suffixed files/ patch is a red flag: PATCHES still points at the old patch, which still exists and silently applies wrong content — grep ebuilds for every files/ entry** (recurred 2x). Evidence: `bd3a045`+`6e50efa` openrct2 (bug 979314).
- **Multiple cherry-picks travel as a versioned patchset tarball (${P}-patchset-N via a PATCHSET variable, bump only the suffix), pruned per-ebuild with an upstreamed_patches rm-array in src_prepare when shared across snapshots; host at the official distfiles.gentoo.org/pub/proj/ location, not developer devspaces** (recurred 4x). Evidence: `93e47c5` plasma-workspace; also `a176603`+`e0c53c8` gcc (fully data-driven snapshot ebuilds — a bump is a pure copy), `335274f` toolchain.eclass (dropped TOOLCHAIN_PATCH_DEV devspace cycling).
- **Large or USE-conditional patches go in SRC_URI as Manifest-pinned distfiles applied with `use flag && eapply "${DISTDIR}"/...` — rename the distfile on every content change (-v2); GitHub compare/commit .patch URLs are not byte-stable, so mirror or expect Manifest churn** (recurred 2x). Evidence: `a7950c9` xl2tpd; `2e3b244` calamares.
- **When a dep update changes API or behavior (const-ified returns, new error semantics), backport upstream's version-guarded #if fix (GDAL_VERSION_MAJOR, ZLIB_VERNUM) so one ebuild builds against both dep versions — not an upper-bound cap or a test skip** (recurred 2x). Evidence: `e5d44d6` burp (zlib 1.3.2 EOF semantics, bug 974937); `9274b36` vtk (gdal-3.13 CSLConstList).
- **Externally-triggered breakage (new linux-headers, glibc, a second arch hitting a known failure) must be fixed in every in-tree version incl. 9999 — users build old stable versions against new system packages** (recurred 2x). Evidence: `16becb0` compiler-rt-sanitizers (linux-headers-7.0 broke slots 16-21; one patchset bump fixed six versions); `5b9a0eb` libksysguard.
- **Before deleting an old ebuild version, diff its KEYWORDS against the survivor and carry forward any keyword only the old one had — otherwise an arch silently loses the package**. Evidence: `c025460` plasma-workspace (~loong).
- **After a pkgmove (category move), grep the whole tree/overlay for the old category/pn atom — the same dep often appears in several dep variables of one ebuild**. Evidence: `aa59ab6` mesa (llvm-core/libclc → llvm-runtimes/ in three places).
- **For pkg/pkg-compat pairs, parameterize one ebuild text on `[[ ${PN} == *-compat ]]` so syncing is a verbatim file copy, not a manual merge**. Evidence: `b692aea` ffmpeg-compat (bug 978041).

### USE flags & dependencies

- **Configure options tracking a dependency's version (feature added/removed at version X): gate with has_version in src_configure instead of dropping or pinning — and any compile-time has_version needs `-d` (ESYSROOT/DEPEND domain); bare calls query ROOT and lie under cross, `-b` is for build-host tools only** (recurred 3x). Evidence: `8ae5460` openssh (--with-ssl-engine only for <openssl-4, bug 973058); also `a82a1a1` net-tools (linux-headers-7.1 dropped ROSE UAPI), `073f899` net-tools (the -d fix).
- **A USE feature broken upstream with no fix in sight: delete the flag and hard-disable at configure (revbump if users could have had it on; none needed if default-off); when just one of several backends breaks, flip the IUSE default to a working one and keep the broken one selectable behind `^^` REQUIRED_USE with a slotted := dep** (recurred 3x). Evidence: `1521eb1` asymptote (vulkan, -r1); also `561109c` libzmf (doc, no revbump), `592051c` privoxy (mbedtls → +openssl).
- **Feature coupling: split a hidden sub-feature into its own USE flag once it grows a heavy dep (REQUIRED_USE="sub? ( main )", revbump — the dep graph changed); a feature usable only under one toolkit nests its deps inside that flag's conditional group with an ewarn for the ineffective combination** (recurred 2x). Evidence: `5131d07` handbrake (nvdec grew clang[llvm_targets_NVPTX], bugs 974512/978224); `60aee24` emacs (xwidgets only under gtk).
- **IUSE defaults: default-on a library flag that many reverse deps require (kills user-facing blockers), and never add +flag merely to silence RequiredUseDefaults — set the default in the profile's package.use where the triggering flag is on** (recurred 2x). Evidence: `190c22a` sdl-mixer (+mod +modplug); `1ed2fd4` uriparser (+doc dropped, desktop-profile default instead).
- **When a common dep drops one of its own deps (acl-2.4.0 no longer pulls attr), audit consumers for automagic linking against the now-orphaned lib and convert to explicit USE + use_enable + dependency, with revbump — expect a wave of these**. Evidence: `26b59d8` sed (bug 979209).
- **USE=doc with doxygen diagrams: check Doxyfile for HAVE_DOT — media-gfx/graphviz belongs next to doxygen in the doc? BDEPEND group**. Evidence: `e9b9e1f` hamlib (bug 977903).
- **Packages generating .vapi need dev-lang/vala in BDEPEND and `use vala && vala_setup` at the top of src_configure (vala.eclass exports VALAC for the configure run)**. Evidence: `7851a24` libpeas (also: lua vs luajit meson features selected off LUA_SINGLE_TARGET with usex).
- **When pkgcheck cannot elaborate a dependency expression (e.g. a >= atom combined with ROCM_USEDEP), weaken the atom minimally and state the intended stricter constraint in a comment above it**. Evidence: `2e3de3a` ggml.
- **SIMD-dispatch packages (ggml/llama.cpp family): keep the cpu_flags_x86_* array in 1:1 sync with upstream's full per-extension option list on every bump, and generate IUSE from the array rather than hand-listing**. Evidence: `7fa858d` ggml (missing avx512bw, bug 978738).

### Install & runtime integration

- **Never let a build system detect the init system or install units itself: patch it to configure_file() the unit into BUILD_DIR only, install via systemd_dounit + newinitd, and align unit User=/Group= with the acct-user package**. Evidence: `8ee4a20` 3proxy (also fixed configure-time file(GLOB) over not-yet-built plugin outputs → install(DIRECTORY FILES_MATCHING)).
- **When a bump removes user-visible functionality or moves paths, warn only actually-affected upgraders: eapi9-ver's `ver_replacing -lt <boundary>` in pkg_postinst, combined with the relevant USE flags** (recurred 3x). Evidence: `a138ae5` squid (SMB_LM helper removal); also `8ee4a20` 3proxy, `650b7a4` kea.
- **suid network binaries: prefer file capabilities — fperms ug-s first, then fcaps (with `-m u+s` for a suid fallback when setcap fails); path gotcha: fperms paths start with / (ED-relative), fcaps paths must NOT (it prepends EPREFIX only then)**. Evidence: `de658aa` monitoring-plugins.
- **Installed .pc/foo-config files must carry the real libdir (lib64, not exec_prefix/lib) and no build-time LDFLAGS/CFLAGS: fix the generator to substitute the buildsystem's own install-dir variables, not sed paths in the ebuild** (recurred 2x). Evidence: `3a2bf04` xmlrpc-c (bug 978404, revbump — installed content changed); `ecd4ea7` R (build LDFLAGS leaked into libR.pc).
- **Do not patch a library to install find_package() config files that neither upstream nor other distros ship — it forks the ecosystem; patch consumers to use the upstream pkg-config file instead**. Evidence: `fc51983` cmark-gfm (telegram-desktop moved to the .pc).
- **Portage owns doc compression: patch out upstream man-page pre-compression, Debian packaging blocks, and automagic pandoc/LaTeX doc regeneration; `docompress -x` only for files a program reads at runtime** (recurred 3x). Evidence: `3bd28d2` wxmaxima; also `ecd4ea7` R, `6c94862` clazy (bug 965513).
- **Manual dobin/doins of files upstream's install skips: re-verify build-tree paths and enumerated file lists on every bump with the gating USE flags enabled — they rot silently; revbump when adding runtime files users are missing** (recurred 2x). Evidence: `e376553` bluez (btpclient moved tools/ → client/); `c0d521d` asymptote (base/collections never installed, bug 977914).
- **Harmless configure/build sandbox violations on pseudo-paths (/dev, /proc/self/*): addpredict the exact path in the affected phase, scoped inside the triggering USE conditional, with a bug comment — never sandbox-disable or drop the feature** (recurred 2x). Evidence: `4aa9dc9` kid3 (acoustid probe touches /dev, bug 855281); `c8f1c54` cantor (julia → /proc/self/{mem,fd}).
- **src_install cleanup of files created by a USE-conditional component must be guarded by that same flag (or tolerate absence) — rmdir on nonexistent paths kills the merge for other flag combos**. Evidence: `08e740a` php (fpm-only /var/log rmdir).

### Build-system & toolchain extras

- **Qt6 paths: never hardcode or concatenate qt6_get_*dir with tool names — qt-utils' `qt_get_broot_binary N tool` resolves host tools correctly (moc/rcc/uic/qhelpgenerator live in libexec, lrelease in bin; BROOT-prefixed, cross-correct); install destinations use `qt_get_mkspecsdir/plugindir N` WITH an explicit ${EPREFIX}** (recurred 6x). Evidence: `578718f` freecad (bug 969111, 12-commit sweep); also `9bbb2aa` wireshark, `36ecade` qwt, `8939369` qca (EPREFIX-vs-BROOT distinction), `d881f71` uriparser (pure two-line mechanical migration), `a16cee1` qtkeychain (check whether any eclass *_get_*dir helper includes EPREFIX before passing it as an absolute -D path).
- **When a build system auto-detects an interpreter/slotted-lib version from a hardcoded search list, ignoring the eclass knob: sed/patch the list to exactly the eclass-selected implementation (${ELUA}, ${EPYTHON}) or the unversioned pkg-config name** (recurred 3x). Evidence: `5ab51bf` mod_security (LUA_PKGNAMES → just "lua"); also `7f8ac56`+`c22ccc1` wireshark (FindLua.cmake version list → ${ELUA#lua}; same bump: upstream signs a checksum manifest, use verify-sig_verify_signed_checksums).
- **cmake dying with "manually-specified variables were not used" only on hosts missing an optional tool: look for an early `return()` in a sub-CMakeLists guarding on that tool and patch it out; revbump**. Evidence: `e879bff` uhd (doxygen, bug 977904).
- **Build systems that silently skip targets with unmet requirements (boost's b2): inject per-component language flags instead of raising the global standard, and verify the expected libraries actually landed in the image after every bump**. Evidence: `025158a` boost (libboost_cobalt silently skipped under global -std=c++17, bug 977237).
- **CMake BLAS consumers: set BLA_VENDOR (and the 64-bit index option) from has_version checks on virtual/blas USE flags — FindBLAS autodetection is nondeterministic**. Evidence: `bb719a3` spqr.
- **Vendored libs exposing a preprocessor feature knob: `append-cppflags -DKNOB=0` per affected arch beats patching; when another arch shows the same failure signature, widen the existing use-conditional instead of adding a parallel block**. Evidence: `b6b1dfb` webkit-gtk (SKCMS_HAS_MUSTTAIL=0, riscv then ppc64, bug 970556).
- **Toolchain probes piping source via stdin (`-`) must pass an explicit `-x c`/`-x c++` — the driver cannot deduce the language from a file extension and user flags skew the guess**. Evidence: `e04d5e1` qt6-build.eclass (bug 976305).
- **Bootstrapping with a pinned older compiler: pin CC/CXX (and friends) to the same toolchain version — objects built by a newer g++ reference libstdc++ symbols the bootstrap toolchain's runtime cannot resolve at link**. Evidence: `7b3bd00` toolchain.eclass (gdc-14 vs trunk libstdc++).
- **Packages selecting arch code paths from the configure triplet rather than CFLAGS (glibc sysdeps): derive a more specific --host prefix from `get-flag mcpu/march` via CTARGET_OPT, mirroring the existing sparc handling**. Evidence: `db069c7` glibc (alpha ev6/ev67 assembly never selected).
- **Release tarballs never contain git submodules: pin each submodule SHA in a top-of-ebuild variable, fetch them as GitHub commit tarballs in SRC_URI, and rmdir+symlink into the source tree in src_prepare**. Evidence: `f89a44a` edk2 (six submodules).

### GPU & LLVM specifics

- **Adding a ROCm backend: set ROCM_VERSION before `inherit rocm`, mirror ROCM_REQUIRED_USE/ROCM_USEDEP into REQUIRED_USE and deps, version-match hip/hipBLAS to ROCM_VERSION, revbump (installed image changes)**. Evidence: `b638941` ggml (bug 978853).
- **USE=cuda on CMake packages: inherit cuda, cuda_src_prepare, cuda_add_sandbox + addpredict /dev/char/, and export CUDAHOSTCXX=$(cuda_gccdir) / CUDAHOSTLD=$(tc-getCXX) — nvcc cannot use the default (too-new) host toolchain**. Evidence: `faf5b84` spqr.
- **Enabling a new LLVM slot for a clang-libs consumer: backport the upstream compat patch with `#if LLVM_VERSION_MAJOR > N` guards so one patch serves all of LLVM_COMPAT, widen LLVM_COMPAT in a revbump, keep the unpatched revision behind it**. Evidence: `b0b39ab` cvise (LLVM 21 API churn).
- **Packages supporting exactly one LLVM slot per release: skip llvm-r1/r2 flag plumbing — depend on clang:${SLOT} directly and pass -DLLVM_ROOT="${ESYSROOT}/usr/lib/llvm/${SLOT}" (ESYSROOT for lookups, EPREFIX for the install prefix)** (recurred 2x). Evidence: `a8f1ec8` spirv-llvm-translator (bug 977919); `7df0a8e` libclc.
- **Monorepo-subset packages (LLVM_COMPONENTS/sparse checkout): missing-file errors after a bump mean the component list must grow — don't patch the build system**. Evidence: `ebce85a` clang (mlir/utils/pygments).
- **clang-based standalone tools/plugins locate resources relative to their own binary: install them into $(llvm-config --bindir), and stage the same layout under BUILD_DIR for src_test so the system copy is never tested**. Evidence: `6c94862` clazy ("stddef.h not found" outside clang's bindir).
- **LLVM and forks: pass -DLLVM_UNREACHABLE_OPTIMIZE=OFF so llvm_unreachable aborts deterministically instead of becoming UB in release builds**. Evidence: `663c3a7` llvm (bug 978856).

### Ebuild shell hygiene

- **Every failable command in a phase ends with `|| die` (sed still exits 0 on no-match — verify load-bearing edits afterwards); quote every ${D}/${ED}/${S}/${WORKDIR}-based path; declare loop/scratch vars `local` in phase functions** (recurred 3x). Evidence: `e329073` sslscan; `a2268a7` php; `8dccf44` mozc.
- **EAPI 9 migration: make_desktop_entry positional name/icon args became option flags (-n for name) — grep all call sites when bumping EAPI**. Evidence: `5725c56` pengupop.

## Idioms

Whitelist benign configure implicit-decl probes (`e28a4db`, `6ca648f`):
```bash
QA_CONFIG_IMPL_DECL_SKIP=(
	# only exists on Windows
	ioctlsocket
	# removed from Linux since 5.5
	sysctl
)
```

LTO-safe static archives via dot-a (`1db142e`, `4d10c7f`):
```bash
inherit dot-a
src_configure() {
	use static-libs && lto-guarantee-fat
	econf ...
}
src_install() {
	default
	strip-lto-bytecode
}
```

Build-host compiler for helper tools on clang-only/cross (`90d1bd0`):
```bash
if tc-is-cross-compiler; then
	export CC_FOR_BUILD="$(tc-getBUILD_CC)"
	export CFLAGS_FOR_BUILD="${BUILD_CFLAGS}"
fi
```

Pre-seed autoconf cache for cross run-tests (`948ec1f`):
```bash
if tc-is-cross-compiler; then
	local maxtime=31
	tc-has-64bit-time_t && maxtime=40
	export i_cv_gmtime_max_time_t=${maxtime}
	export i_cv_epoll_works=yes
fi
```

Kill automagic deps via cache vars tied to USE (`e541efc`):
```bash
export ac_cv_header_valgrind_valgrind_h=$(usex valgrind)
export ac_cv_lib_unwind_unw_backtrace=$(usex unwind)
```

Offline FetchContent dependency (`0e9c7e1`):
```bash
src_configure() {
	local mycmakeargs=(
		-DFETCHCONTENT_SOURCE_DIR_LLAMA_CPP="${WORKDIR}/llama.cpp-${LLAMA_TAG}"
	)
	cmake_src_configure
}
```

Raw-Makefile build with toolchain respect (`ebebddf`, `b6e256f`):
```bash
src_compile() {
	tc-export PKG_CONFIG
	emake CC="$(tc-getCC)" GENTOO_CPPFLAGS="${CPPFLAGS}"
}
```

Disable an auto-detected build tool via meson native file (`e6dc5e5`):
```bash
local native_file="${T}"/meson.${CHOST}.${ABI}.ini.local
cat >> "${native_file}" <<-EOF || die
	[binaries]
	doxygen='doxygen-falseified'
EOF
emesonargs+=( --native-file "${native_file}" )
```

Force _FORTIFY_SOURCE=2 under both GCC and Clang (`f982c02`):
```bash
filter-flags -D_FORTIFY_SOURCE=3
append-cppflags -U_FORTIFY_SOURCE -D_GENTOO_NO_FORTIFY_SOURCE -D_FORTIFY_SOURCE=2
```

Prefix-safe raw make install (`0a0be8d`):
```bash
emake DESTDIR="${D}" \
	PREFIX="${EPREFIX}/usr" \
	LIBPATH="${EPREFIX}/usr/$(get_libdir)" \
	INCPATH="${EPREFIX}/usr/include" install
```

Label-based ctest exclusion plus arch-conditional skips (`be2b3f6`, `aeee647`):
```bash
src_test() {
	local myctestargs=( -LE "Fortran" )
	local CMAKE_SKIP_TESTS=(
		# bug #977176
		$(usev arm 'glslang-testsuite')
	)
	cmake_src_test
}
```

Short TMPDIR for unix-socket tests (`56bb18b`):
```bash
src_test() {
	local -x TMPDIR="$(mktemp -d --tmpdir=/tmp ${PF}-XXX || die)"
	nonfatal meson_src_test
	local ret=${?}
	rm -r "${TMPDIR}" || die
	[[ ${ret} != 0 ]] && die "tests failed"
}
```

Disk requirement only when tests run (`b1243f0`):
```bash
inherit check-reqs
RESTRICT="!test? ( test )"
check_space() {
	if use test; then
		local CHECKREQS_DISK_BUILD=10G # bug 978323
		check-reqs_pkg_setup
	fi
}
pkg_pretend() { check_space; }
pkg_setup() { check_space; }
```

Second meson tree for an out-of-tree test subproject (`d8a103f`):
```bash
# src_configure:
if use test; then
	EMESON_SOURCE="${S}"/src/libaudcore/tests \
	BUILD_DIR="${WORKDIR}"/${P}-tests-build \
	meson_src_configure
fi
# src_test:
BUILD_DIR="${WORKDIR}"/${P}-tests-build meson_src_test
```

File capabilities with suid fallback — note the path asymmetry (`de658aa`):
```bash
inherit fcaps
local pd="usr/$(get_libdir)/nagios/plugins"
fperms ug-s /"${pd}"/check_icmp             # leading slash: ED-relative
fcaps -m u+s cap_net_raw "${pd}"/check_icmp # no slash: fcaps prepends EPREFIX
```

CUDA host toolchain for nvcc (`faf5b84`):
```bash
if use cuda; then
	cuda_add_sandbox
	addpredict /dev/char/
	local -x CUDAHOSTCXX="$(cuda_gccdir)"
	local -x CUDAHOSTLD="$(tc-getCXX)"
fi
```

## Automatable checks

- **Malformed mycmakeargs entries**: parse `mycmakeargs=(...)` arrays in ebuilds; any literal not matching `^-D`, `^--`, or `$(...)` (helper/usex expansion) = violation. Evidence: `98e55e6`.
- **CMake 4 compat scan**: in unpacked sources, `grep -ri 'cmake_minimum_required' --include=CMakeLists.txt --include='*.cmake'` and flag versions < 3.5 (fatal under dev-build/cmake-4) — separate buildable subtrees (patch/rm needed) from unbuilt ones (CMAKE_QA_COMPAT_SKIP acceptable). Evidence: `b8bff05`, `22ae82c`, `0c0ebc5`.
- **Hardcoded -Werror**: `grep -rn -- '-Werror' */Makefile.am CMakeLists.txt meson.build` in unpacked sources (excluding -Werror=specific promotions the toolchain controls); hit in released packages = violation per Gentoo policy. Evidence: `67dca78`, `2e2dfb3`.
- **Patch touches autoconf inputs without regeneration**: ebuild PATCHES/eapply touching `configure.ac` or `m4/*.m4` while the ebuild neither inherits autotools nor calls eautoreconf = violation (patch is a no-op). Evidence: `ea0bccb`, `f8c5ea5`.
- **Build-time network fetch**: `grep -rn 'FetchContent_Declare\|ExternalProject_Add' -A3` in sources for GIT_REPOSITORY/URL lines not overridden by the ebuild (-DFETCHCONTENT_SOURCE_DIR_*, DOWNLOAD_COMMAND patch) = violation (sandbox will kill it). Evidence: `5424de5`, `0e9c7e1`.
- **pkg-config macro without BDEPEND**: sources contain `PKG_CHECK_MODULES`/`pkg_check_modules`/meson `dependency(` but the ebuild lacks `virtual/pkgconfig` in BDEPEND = violation. Evidence: `799149d`.
- **Broken GCC version gates**: `grep -rn '__GNUC__.*&&.*__GNUC_MINOR__'` in sources/patches; the `(MAJOR >= m && MINOR >= n)` shape = violation (fails on X.0 of newer majors). Evidence: `0e95653`.
- **Build-log QA notices**: scan emerge logs for `QA Notice: implicit function declaration` (needs QA_CONFIG_IMPL_DECL_SKIP or a real fix — compare symbol list against the ebuild's array) and `Unrecognized configure options` (a use_enable/use_with rename is silently a no-op). Evidence: `e28a4db`, `ad78494`.
- **use_enable/use_with renamed options**: for each `$(use_enable flag optname)` with a second argument, check `--enable-optname`/`--with-optname` exists in the unpacked `configure --help` output; missing = violation. Evidence: `ad78494`.
- **Static libs without dot-a**: ebuild installs `.a` files (image scan or IUSE static-libs) but does not inherit dot-a / call strip-lto-bytecode = warning (broken for LTO builders). Evidence: `1db142e`.
- **Forced global flags in meson**: `grep -n 'add_global_arguments\|add_project_arguments' meson.build` for `-flto`, `-D_FORTIFY_SOURCE`, `-fstack-protector`, `-O[0-9s]`; unpatched hit = violation (overrides user/toolchain flags). Evidence: `e6dc5e5`.
- **configure bashisms**: `grep -n 'test .*==' configure` in unpacked sources (and `echo -e/-ne` in Makefiles); hit = violation on POSIX-sh systems. Evidence: `6d71f6d`, `c7d26cd`.
- **Direct `ld -r` partial links**: `grep -rn '\bld -r\b' Makefile*` in sources; hit = violation (breaks cross prefixes and LTO; must be `$(CC) -r`). Evidence: `fe84ecd`.
- **Stale -std workarounds**: `grep -rn 'append-cflags.*-std=' --include='*.ebuild'`; any hit without a `TODO`/bug-URL comment = warning; at bump time, any hit at all = re-check whether upstream fixed the underlying issue. Evidence: `44f6da6`, `50626fc`.
- **C++ objects built with CFLAGS**: in build logs, compare compile lines for .cpp/.cc files against ${CXXFLAGS}; CXXFLAGS markers absent while CFLAGS present = violation (build system uses the wrong variable). Evidence: `ed7fc1c` gpsd.
- **Missing `|| die`**: grep ebuild phase bodies for bare sed/cp/mv/ln/rm/touch/rmdir lines not ending in `|| die` (and not under nonfatal/assert) = violation. Evidence: `e329073`.
- **Unquoted image paths**: `${D}`/`${ED}`/`${S}`/`${WORKDIR}` expansions outside double quotes in ebuild commands = violation (word-splits on paths with spaces). Evidence: `a2268a7`.
- **Stale/unused files/ patches**: every files/*.patch must be referenced by some ebuild, and each PATCHES entry must resolve to an existing file; an unreferenced new `*-${PV}-*.patch` combined with a rename-only (100%-similarity) ebuild bump = near-certain stale-PATCHES bug. Evidence: `bd3a045`, `6e50efa`.
- **KEYWORDS loss on version removal**: when a commit deletes an ebuild, diff its KEYWORDS against the remaining newest version; any keyword present only in the deleted file = violation (arch silently loses the package). Evidence: `c025460`.
- **pkgmove leftovers**: grep all ebuilds for old category/pn atoms from the profiles updates/ pkgmove list = violation; the same atom often occurs in several dep variables per ebuild. Evidence: `aa59ab6`.
- **Deprecated Qt path helpers**: grep ebuilds for `$(qt6_get_bindir)/` or `$(qt6_get_libexecdir)/` concatenated with a tool name = migrate to qt-utils `qt_get_broot_binary`. Evidence: `578718f`, `9bbb2aa`.
- **Compile-time has_version without -d**: has_version/best_version calls in src_* phases gating configure/compile options without `-d` (or `-b` for build-host tools) = warning; wrong domain under cross-compilation. Evidence: `073f899`.
- **doc? doxygen without graphviz**: ebuild has `doc? ( app-text/doxygen )` while the unpacked Doxyfile sets `HAVE_DOT = YES` and no media-gfx/graphviz dep exists = violation. Evidence: `e9b9e1f`.
- **Non-local loop variables**: `for var in ...` inside phase functions where `var` has no preceding `local` declaration = warning (leaks across phases, collides with eclass globals). Evidence: `8dccf44`.
