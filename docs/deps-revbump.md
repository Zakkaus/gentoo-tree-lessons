# Dependency correctness & revbump policy (slot/subslot, :=, USE deps, || groups, *DEPEND placement, when -rN is required)

Distilled from gentoo/gentoo commits (2025-2026 window). Covers when a dependency change forces a revision bump and when it must be skipped, subslot/:= slot-operator hygiene, version bounds and pinning, || ( ) alternative groups, USE-dependency syntax, and the BDEPEND/DEPEND/RDEPEND/PDEPEND split. Shas refer to the gentoo/gentoo repo.

## Rules

- **Any *DEPEND change on a release ebuild that alters how installed systems resolve dependencies requires a revbump; a metadata-only edit never reaches already-installed users** (recurred 17x). Evidence: `91f374f` dev-libs/intel-compute-runtime (raised a `>=` dep bound after a bug report — without `-rN` installed users never re-resolve it); also `890b6da` containerd (dep moved into RDEPEND), `1bdf599` ppsspp (`>=media-video/ffmpeg-5:=` added, ebuild renamed to `-r1`), `4e10f46` selinux-python (dependency string gained `[python,${PYTHON_USEDEP}]`), `d753e13` julia-bin (RDEPEND || group rewritten), `44ea270` netifrc (systemd/OpenRC RDEPEND split), `a052e7c` incus, `175830c` ggml, `c4cda74` libsass, `8fbc169` agent-shell, `987e250` zbar (`[X?]` forwarding is a dep-behavior change), `728ad4e` sphinx (runtime dep range unpinned via sed), `6fa68eb` screengrab, `f99d3b0` evolution-ews, `f3297db` pkgcheck.
- **Skip the revbump when nothing installed can be wrong: test-only patches/deps, build-failure-only fixes, build-time-only dep relaxations, pkg_pretend/setup-only tweaks, removal of a dep on a package that left the tree** (recurred 15x). Litmus from `0be220e` sphinxcontrib-jsmath: revbump iff installed files or runtime dep resolution change. Evidence: `4b96894` resolvelib (test-fix patch, no -rN), `1a6c7ce` pyrate-limiter (test? BDEPEND addition), `fce49bc` systemd (build-failure patch — nobody can have a broken install of a version that did not build), `f92eebc` ansifilter, `b63bf6c` sequoia-sop (LLVM_COMPAT widening = build-time dep relaxation), `a0cfca8` aflplusplus (LLVM slot dropped in place), `17399bb` tar (CHECKREQS constant, pretend/setup only), `df39073` openjdk (USE-conditional PDEPEND on a removed package deleted), `7fce08a` data-default-instances-containers (dep change on an already-broken ebuild).
- **Encode a shared library's soname/ABI in a version-derived subslot — `SLOT="0/$(ver_cut 1)"` or the actual soname — and re-derive it on every bump; never hardcode the subslot literal** (recurred 8x). Evidence: `c342413` dev-libs/aml; also `247a238` uhd (`0/$(ver_cut 1-3)`), `1a2a810` libresidfp (update the scheme when upstream changes soname derivation), `217a8e7` giflib, `63c9fbe` ffmpeg (re-audit SONAMEs on bump), `40fb544` qxlsx, `774f68e` cmark-gfm (`SLOT="0/${MY_PV}"`, never a literal), `93d7045` msgpack (library rename at same version = ABI break, synthetic subslot `2-c`).
- **Every DEPEND/RDEPEND atom on a shared library whose package defines a subslot must carry `:=`, including atoms hidden inside USE conditionals — audit all linked deps, not just the obvious ones** (recurred 5x). Evidence: `f7d4d47` app-misc/nnn (`pcre? ( dev-libs/libpcre2:= )`); also `0890f85` pylibmc (`virtual/zlib:=`), `722675b` pjproject, `850c8e3` sidplayfp, `a4b65a2` rust (iwdevtools audits slot-operator correctness on bumps).
- **Test-only dependencies go in DEPEND/BDEPEND under `test? ( ... )`, never RDEPEND; linked test frameworks (gtest, catch) are DEPEND, not BDEPEND, for cross-compile correctness** (recurred 5x). Evidence: `b30bbd3` app-arch/dump (`test? ( dev-cpp/catch:= )` in DEPEND); also `b064471` gerbera (gtest DEPEND not BDEPEND), `90b072d` mlt, `5b16ecc` rich-click (missing test import → test? BDEPEND, not deselection), `a98e379` pycurl, `6c5e0df` dropbear (test-invoked external tools).
- **Anything installed from files/ (initscripts, logrotate, configs, vendored build files) that changes must be renamed with an `-rN` suffix and the ebuild revbumped, or existing installs keep the stale copy** (recurred 5x). Evidence: `ff49537` knot-resolver ("always revbump when anything installed from files/ changes"); also `019aadf` dnscrypt-proxy (logrotate config renamed -r1), `0a60b7e` power-profiles-daemon (initd renamed -r1 + revbump), `22e6d23` kea, `32fe275` znc-clientbuffer.
- **When a dependency's new major version breaks the package and no fix exists, cap it with `<cat/pkg-X.Y:=` in every affected ebuild — preemptively when the break is already known — and drop lower bounds every in-tree version satisfies** (recurred 5x). Evidence: `e8f4170` postfix (`<dev-db/lmdb-1.0.0:=` instead of waiting for breakage reports); also `591191d` openmw (preemptive `<mygui-3.5.0:=`), `d310825` tpm2-pytss (backport + raise floor to patched version), `0e525b0` sunshine (CUDA/Clang bounds raised together), `d643599` gnu-regexp (`<virtual/jdk-26:*` cap in DEPEND with bug comment, RDEPEND floor untouched).
- **Live (-9999) ebuilds take the same dep fix without a revision change — mirror every release-ebuild dep fix into the live ebuild in the same commit or it rots** (recurred 5x). Evidence: `a122bef` jgrf (release gets -r1, live gets the edit in place); also `a052e7c` incus, `f3297db` pkgcheck, `aff10eb` prusaslicer, `74e7865` nextinspace.
- **When a bug reveals the real minimum version of a dependency, express it as a `>=` bound in the ebuild (usually with `:=`) — never as documentation or a warning** (recurred 4x). Evidence: `6b25ff1` kmscon (raise the bound instead of "upgrade first" docs); also `1bdf599` ppsspp, `91f374f` intel-compute-runtime, `f99d3b0` evolution-ews (lockstep suite: intra-suite min deps bumped to the same version).
- **Things the installed package needs at runtime — acct-user/acct-group for owned files, sec-policy/selinux-*, invoked helper programs — belong in RDEPEND, not DEPEND/BDEPEND** (recurred 4x). Evidence: `890b6da` containerd (selinux policy moved BDEPEND→RDEPEND + revbump); also `184045f` gpsd (runtime helpers), `3c5e4ec` openldap (ownership is applied in the target root), `6e6f2f9` acct-user.eclass (derive the RDEPEND in the eclass instead of trusting each ebuild).
- **|| ( ) groups: the resolver picks the first satisfiable entry, so list the preferred/maintained provider first; reorder when preferences change (revbump if the dep set changes materially)** (recurred 3x). Evidence: `f98fad7` slade; also `1f4acf7` ruby-utils.eclass, `d753e13` julia-bin (replacement listed first during last-rite migration).
- **|| ( ) groups must reflect reality: replace the group with the concrete atom (incl. USE deps) when only one provider actually works; collapse ||-of-version-windows into one continuous range when no real versions exist in the gaps** (recurred 3x). Evidence: `a052e7c` incus (`|| ( iptables nftables[json] )` → `nftables[json]` + revbump); also `180e0da` microstache, `19812f2` nothunks (genuine unions spelled `|| ( ( >=a <b ) ( >=c <d ) )` with a bare `pkg:=` alongside for subslot rebuilds).
- **Man-page/basic-doc toolchains are unconditional BDEPEND — never gate man pages behind a USE flag (QA PG0305)** (recurred 3x). Evidence: `ec3e612` dracut; also `8525c42` sway (scdoc), `d30b461` kmscon (depend on the real toolchain: docbook-xsl + libxslt).
- **For packages with (or about to get) multiple slots, spell `:<slot>=` rather than bare `:=` so the dep cannot silently bind to a different slot; any consumer of Qt private headers needs `dev-qt/qtbase:6=` with a comment naming the header** (recurred 3x). Evidence: `ba44592` qt6-build.eclass; also `e06d7bc` photoqt, `d80fcb3` obs-studio (rebuilt on every qtbase release).
- **Depending on another package's Python bindings requires `[python,${PYTHON_USEDEP}]` — both flags, never `[python]` alone; any dev-python/* atom in a python-r1/python-single-r1 ebuild must carry `[${PYTHON_USEDEP}]` (via python_gen_cond_dep for single-r1)** (recurred 3x). Evidence: `4e10f46` selinux-python (+ revbump); also `bd20876` rbst, `c4cda74` libsass (runtime pkg_resources import → explicit dev-python/pkg-resources RDEPEND).
- **Prefer backporting the upstream fix over pinning/holding back the dependency; patch over-strict upstream pins (gemspec/pyproject caps) instead of blocking the dep upgrade** (recurred 3x). Evidence: `f832bfe` twisted ("do not pin the old dependency version unless no fix exists"); also `aff10eb` prusaslicer, `40113a8` json-schema (gemspec constraint patched, revbump).
- **Slot-selecting toolchain eclasses (zig, LLVM, ...): every toolchain atom must be pinned to the eclass slot variable (`:${ZIG_SLOT}`), including inside || groups — an unslotted `>=` dep is a latent build failure once a newer slot appears** (recurred 2x). Evidence: `725643b` ghostty; also `ac2b24c` ghostty-terminfo.
- **Header-only packages: no `:=` on the header-only dep itself (use a `>=` bound for API minimums — a -9999 dep also satisfies it); instead the consumer carries `:=` deps on the header-only lib's transitive shared libs, since the header-only package cannot trigger rebuilds** (recurred 2x). Evidence: `aa30340` vecx-jg (`media-libs/jg:1=` → `>=media-libs/jg-2.0.0`); also `90220a5` telegram-desktop (`sys-apps/hwloc:=` on the consumer, with comment).
- **Before adding a library dep from a runtime-breakage report, confirm the package's own ELF objects list it in NEEDED (`scanelf -n`); transitive breakage is fixed by `:=` on the direct consumer, not by copying the dep. For prebuilt packages, depend only on what the binaries actually link or invoke** (recurred 2x). Evidence: `a7426ce` ardour (mbedtls dep dropped, libwebsockets got `:=`); also `cfc72a0` brscan5 (udev rules → virtual/udev, not virtual/libudev).
- **USE-dep operators: `[flag=]` when the package must be compiled with the same feature state as the library (Qt X/wayland being the classic case); `[flag?]` to forward an optional backend; `cat/pkg[flag]` + revbump when the package malfunctions without a dep's optional feature** (recurred 3x). Evidence: `e81d4f6` virtualbox (`dev-qt/qtbase:6[X=,wayland=,widgets]`); also `987e250` zbar, `a122bef` jgrf (`libsdl3[opengl]` → `[opengl,udev]` + -r1), `c5fe235` commons-validator.
- **A BDEPEND may only be USE-conditional if the tool is provably invoked only under that USE — when a missing-tool failure appears in a clean chroot, check git history for a dep that migrated into a conditional block** (recurred 2x). Evidence: `7084d24` glibmm (perl moved out of gtk-doc? group); also `523a058` wine-staging (arch-conditional, not USE-conditional).
- **BDEPEND holds build-host tools only — never `${RDEPEND}`; libraries ride in `DEPEND="${RDEPEND}"`. Whenever the build system calls pkg-config (PKG_CHECK_MODULES/pkg_check_modules/dependency()), BDEPEND=virtual/pkgconfig is mandatory** (recurred 2x). Evidence: `c2fd68a` hxtools; also `799149d` exfatprogs (explicitly noted as a scriptable pre-commit check).
- **Pin an upstream version while still accepting ebuild revisions with `~cat/pkg-ver`, never `=cat/pkg-ver`; never write `>=cat/pkg-${PV}` cross-package deps for "kept in step" families without verifying the sibling released that version — run a resolver check right after the bump**. Evidence: `c47e4ff` and `82b7f1a` virtual/perl-IO-Compress (unsatisfiable `>=...-${PV}` dep shipped).
- **When a library revbump changes its provided classpath/dependency set such that consumers must rebuild together, add `!<consumer-old-version` blockers in RDEPEND**. Evidence: `23c8b09` dev-java/mchange-commons.
- **When consumers must be rebuilt against a provider without creating a dep cycle (kernels vs out-of-tree modules), use a versioned PDEPEND on the shared virtual**. Evidence: `e1117de` gentoo-kernel-modprep (`PDEPEND=">=virtual/dist-kernel-${PV}"`).
- **Before dropping an old version, grep the tree for reverse-dep pins on it; if one exists, keep or re-add the version rather than leaving the revdep unsatisfiable**. Evidence: `ce011e4` qhexedit2.
- **On every version bump, re-audit the ebuild's *DEPEND against upstream's currently declared requirements — drop what upstream dropped, add what it grew; every constraint loosened inside build metadata (CABAL_CHDEPS etc.) must be mirrored in *DEPEND or portage and the build tool disagree**. Evidence: `295fd58` acl; `ae1c9c5` pandoc; `f3297db` pkgcheck (chardet → charset-normalizer, revbump).

## Idioms

`:=` on every subslotted lib, including USE-conditional atoms (`f7d4d47`):
```bash
DEPEND="sys-libs/ncurses:=
	pcre? ( dev-libs/libpcre2:= )
	readline? ( sys-libs/readline:= )"
```

Version-derived subslot for ABI (`c342413`, `247a238`):
```bash
SLOT="0/$(ver_cut 1)"      # soname major
SLOT="0/$(ver_cut 1-3)"    # full ABI version
```

New real minimum + slot operator, ebuild renamed to `-rN` (`1bdf599`):
```bash
RDEPEND=">=media-video/ffmpeg-5:="   # was media-video/ffmpeg:= ; mv ${P}.ebuild ${P}-r1.ebuild
```

Upper-bound cap when a new major breaks consumers (`e8f4170`):
```bash
lmdb? ( <dev-db/lmdb-1.0.0:= )
```

Role-split of a USE-gated backend's deps (`175830c`):
```bash
RDEPEND="vulkan? ( media-libs/vulkan-loader )"
DEPEND="${RDEPEND}
	vulkan? ( dev-util/vulkan-headers )"
BDEPEND="vulkan? ( media-libs/shaderc )"
```

BDEPEND purity — tools only, libs via DEPEND (`c2fd68a`, `b30bbd3`):
```bash
DEPEND="${RDEPEND}
	test? ( dev-cpp/catch:= )"
BDEPEND="virtual/pkgconfig"
```

Slotted toolchain pinned inside an || group (`725643b`):
```bash
BDEPEND="
	|| (
		>=dev-lang/zig-bin-0.15.2:${ZIG_SLOT}
		>=dev-lang/zig-0.15.2:${ZIG_SLOT}
	)"
```

Union of version windows plus bare `:=` for subslot rebuilds (`19812f2`):
```bash
|| (
	( >=dev-haskell/text-1.2 <dev-haskell/text-1.3 )
	( >=dev-haskell/text-2 <dev-haskell/text-2.2 )
)
dev-haskell/text:=
```

Lockstep-rebuild blockers on a library revbump (`23c8b09`):
```bash
RDEPEND="${CP_DEPEND}
	!<app-forensics/sleuthkit-4.12.1-r3
	!<dev-java/c3p0-0.9.5.5-r3:0"
```

Qt private headers → subslot dep with comment (`e06d7bc`):
```bash
# slot op: uses Qt::GuiPrivate for rhi/qrhi.h
dev-qt/qtbase:6=[gui,widgets]
```

## Automatable checks

- **Missing `:=` on subslotted deps**: for every dep atom (including inside USE conditionals), resolve the target package's SLOT; if it contains `/` (defines a subslot) and the atom has no `:=`/`:N=` and is not a header-only/BDEPEND-only tool, flag. Evidence: `f7d4d47`, `0890f85`.
- **Dep change without revbump**: in a commit diff, a changed `*DEPEND`/`REQUIRED_USE` line in an existing non-9999 ebuild whose filename did not gain `-rN` is a violation — except when the change is confined to `test? ( )` groups, BDEPEND-only relaxations, or PYTHON_COMPAT/LLVM_COMPAT widening. Evidence: `91f374f`, `890b6da`, `0be220e`.
- **files/ edit without revbump**: commit modifies `files/*` referenced by an existing release ebuild without renaming the file to `-rN` and revbumping the ebuild. Grep the diff for `files/` paths, cross-check ebuild renames in the same commit. Evidence: `ff49537`, `019aadf`.
- **go.mod floor drift**: parse the `go`/`toolchain` directive from the package's go.mod (in DIST) and compare against the `>=dev-lang/go-` floor in BDEPEND; missing or lower floor is a violation. Evidence: `9c887d7`, `bbdf70d`.
- **pkg-config used, virtual/pkgconfig missing**: grep unpacked sources for `PKG_CHECK_MODULES|pkg_check_modules|dependency\(` and require `virtual/pkgconfig` in BDEPEND. Evidence: `799149d`.
- **`${RDEPEND}` inside BDEPEND**: grep ebuilds for `BDEPEND="[^"]*\${RDEPEND}`; always a violation. Evidence: `c2fd68a`.
- **`test? (` inside RDEPEND**: grep RDEPEND blocks for `test?`; always a violation. Evidence: `b30bbd3`.
- **dev-python atom without PYTHON_USEDEP**: in ebuilds inheriting python-r1/python-single-r1/distutils-r1, any `dev-python/*` dep atom lacking `[${PYTHON_USEDEP}]` (or not wrapped in python_gen_cond_dep) is a violation. Evidence: `bd20876`, `4e10f46`.
- **Unslotted atom for a slot-selecting eclass toolchain**: if the ebuild sets `ZIG_SLOT`/`LLVM_COMPAT`-style variables, every atom on that toolchain package (incl. inside `|| ( )`) must contain `:${VAR}` or an eclass-generated slot. Evidence: `725643b`, `ac2b24c`.
- **Exact `=` pins and `${PV}` cross-package deps**: grep for `=cat/pkg-[0-9]` without a trailing `*` (suggest `~`), and for `>=.*-\${PV}` atoms across package boundaries — run a resolver check (`pkgcheck scan` / dependency resolution) after any bump of such families. Evidence: `c47e4ff`, `82b7f1a`.
- **Hardcoded subslot literal equal to a version**: `SLOT="0/[0-9]` where the subslot string matches `${PV}` or a prefix of it — should be derived via `$(ver_cut ...)`/`${PV}`. Evidence: `774f68e`.
- **Man-page toolchain behind USE**: `asciidoc|asciidoctor|scdoc|docbook-xsl` atoms found only inside `doc? ( )`/`man? ( )` conditionals in BDEPEND. Evidence: `ec3e612`, `8525c42`.
- **Runtime packages in build-only deps**: `sec-policy/selinux-*`, `acct-user/*`, `acct-group/*` atoms present in DEPEND/BDEPEND but absent from RDEPEND. Evidence: `890b6da`, `3c5e4ec`.
- **|| group leading with a dead provider**: first alternative in a `|| ( )` group is a masked/last-rited/removed package — the resolver picks the first satisfiable entry, so ordering is load-bearing. Evidence: `f98fad7`, `d753e13`.
