# Kernel packages

Dist-kernel machinery, out-of-tree module packaging, CONFIG_CHECK/linux-info, and sys-kernel/* tree maintenance, mined from gentoo/gentoo commits: kernel-build/dist-kernel-utils/kernel-2 eclass fixes, gentoo-kernel(-bin)/gentoo-sources/linux-firmware/linux-headers ebuilds, and linux-mod-r1 consumers (nvidia-drivers, virtualbox-modules, bpftrace). 38 source records, of which ~14 are routine bumps/arch-table entries with no reusable content — coverage is solid on eclass internals and genpatches handling, thinner on initramfs/installkernel (no dracut/ugrd lessons in this sample). Shas refer to gentoo/gentoo.

## Rules

### Dist-kernel config & build (kernel-build, dist-kernel-utils)

- **USE-driven kconfig fragments must emit an explicit off-state: write `# CONFIG_X is not set` lines in the else branch and merge the fragment unconditionally** — absence of an enable fragment does not disable a default inherited from the base config. Evidence: `2c3dfd3` kernel-build (Debian base config kept CONFIG_MODULE_SIG on despite USE=-modules-sign).
- **When the primary defconfig source lacks an architecture, borrow another distro's maintained config fragments pinned by commit SHA in SRC_URI and feed them through `merge_configs`, instead of forcing savedconfig** (2) — evidence: `5070e63` gentoo-kernel (salsa.debian.org kernel-team configs for alpha/arm/loong/m68k/ppc/sparc, `DEBIAN_COMMIT` pin), mirrored in `f5a04a4` vanilla-kernel.
- **Read target-system configuration from ESYSROOT, not BROOT** — BROOT is the build host and only correct for locating executables; `"${BROOT}"/etc/kernel/config.d/*.config` silently ignores the target's drop-ins when cross-building. Evidence: `f8a89f2` kernel-build.eclass (bug 771324).
- **When splitting one user-configured credential into two (secureboot vs measured-boot keys), default the new variables to the old via `: "${NEW:=${OLD}}"`, and validate key/cert paths with openssl in pkg_setup so misconfiguration dies before the expensive build** — evidence: `f88a8c9` kernel-build (bug 973344; pkcs11: URIs handled separately).
- **After installing a pruned copy of an upstream source tree, delete dangling symlinks in one pass: `find -L "${ED}${dir}/" -type l -delete || die`** — stripped-down tools/ orphans scripts/ symlinks and trips the broken-symlink QA check. Evidence: `d37bac4` kernel-build.
- **Detect merged-usr with `[[ -L ${EROOT}/lib && ${EROOT}/lib -ef ${EROOT}/usr/lib ]]` in pkg_preinst and recreate any /lib symlinks under /usr/lib** to avoid collisions; keep the logic in a parameterized helper (dist-kernel_update_lib_symlinks), not welded into one eclass phase. Evidence: `8af1569` dist-kernel-utils.eclass.
- **When renaming a package or changing its localversion suffix, add a temporary migration branch keyed on a `has_version` heuristic** so upgrades from the old naming are treated as in-place updates, not foreign kernels — evidence: `787f664` dist-kernel-utils (gentoo-kernel-bin `-gentoo-dist` → `-gentoo-dist-bin` stopped /usr/src/linux updates; fixed by `! has_version sys-kernel/gentoo-kernel` plus a one-shot `KV_LOCALVERSION=${KV_LOCALVERSION%-bin}` override on the eligibility check).

### Out-of-tree modules (linux-mod-r1)

- **Kernel providers carry `PDEPEND=">=virtual/dist-kernel-${PV}"` — PDEPEND (not RDEPEND) to avoid install-order cycles, and versioned with `${PV}`, never a derived helper variable like `PATCH_PV`** (2) — evidence: `e1117de` gentoo-kernel-modprep (edge needed so linux-mod-r1's dist-kernel machinery schedules module rebuilds), `cc1f450` gentoo-kernel-bin (PATCH_PV made the virtual lag the installed kernel).
- **When a new kernel branch enters the tree, build-test every out-of-tree module ebuild against it and raise `MODULES_KERNEL_MAX` per-version only where confirmed**, ideally before the new gentoo-kernel is keyworded; leave broken versions at the old ceiling. Evidence: `7f7461b` nvidia-drivers (7.0→7.1, one version left behind).
- **Overriding a phase that linux-mod-r1 exports replaces it entirely — call `linux-mod-r1_pkg_postinst` as the first line of your override**; a missed call drops depmod/module-db handling and the fix needs a revbump because installed-system behavior changes. Evidence: `2f95755` virtualbox-modules (bug 977784).
- **linux-mod.eclass is removed; any ebuild still inheriting it breaks with unknown-eclass — migrate to linux-mod-r1** — evidence: `39b122a` (bug 908692). Full deprecated-eclass sweep guidance lives in eclass-migrations.md.

### CONFIG_CHECK / linux-info

- **When kernel-feature checks must reflect the RUNNING kernel (container builds, src_test), set `KERNEL_DIR` to a nonexistent dummy path before `check_extra_config`** — linux-info prefers on-disk sources/config over the running kernel; in containers that config is unrelated to the kernel tests run on. Evidence: `7a96a8a` bpftrace (bug 977516).

### kernel-2 / genpatches sources

- **When an ebuild combines two independently versioned inputs (base tarball + patchset), add an early consistency check that dies naming the variable to fix** — kernel-2's unipatch scans the unpacked genpatches for the OKV incremental patch and dies with "check K_GENPATCHES_VER" instead of a cryptic patch failure later. Evidence: `8296174` kernel-2 (bugs 972596, 970493).
- **Give eclass sanity checks a documented opt-out variable for legitimate edge cases instead of weakening them globally** (2) — X.Y.0 releases have no incremental patch by definition, and brand-new major series aren't in the known-version table; `K_NO_VERSION_CHECK="True"` before `inherit kernel-2` bypasses both. Evidence: `c5dc07c` kernel-2 (opt-out added), `1620fcc` gentoo-sources-7.1.0 (consumer use).
- **Scan directories that may contain subdirectories with `find -print0 | while read -d ''`, not a shell glob** — `for f in ${dir}/*` misses nested files and word-splits; broke the genpatches version check when the tarball unpacked into subdirs. Evidence: `f6c28ea` kernel-2 (bug 974322).
- **To offer an unpatched variant of a patched-sources package, encode patch provenance in the filename convention and filter at prepare time behind a USE flag** — genpatches numbers upstream incremental patches <1500 and distro patches >=1500, so `USE=vanilla` deletes prefix>1499 before applying; no separate vanilla-sources package needed. Evidence: `4ee8afd` kernel-2.
- **List the official Gentoo mirror URL first in generated SRC_URI, keeping devspace/upstream URLs as fallbacks** — genpatches was fetched only from dev.gentoo.org personal webspace, a single fragile origin. Evidence: `34fca4b` kernel-2.
- **Build failures on missing bfd.h/libbfd mean a missing explicit `sys-libs/binutils-libs` dependency** — kernel host tools link libbfd; it only worked by accident via the binutils toolchain package. Evidence: `d3614fa` kernel-2.eclass (bug 970027).

### sys-kernel tree maintenance

- **After copying an ebuild for a version bump, demote every stable keyword to ~arch before committing** — copied KEYWORDS instantly stabilize an untested release; a scripted `ekeyword ~all` in the bump pipeline prevents it. Keyword changes never need a revbump. Evidence: `c548fa4` gentoo-sources-6.12.94.
- **When a stable version is superseded or regressed but should stay available, destabilize it: prefix all stable KEYWORDS with `~` in place, don't remove the ebuild** (4) — evidence: `f2c6ed0`, `ab7953d`, `3258bad`, `b0ceb83` gentoo-sources.
- **Audit ebuild-embedded upstream file lists on every bump/sync; when upstream drops the files, remove the entire dependent machinery (USE flag, LICENSE clause, RESTRICT coupling, blockers), not just the list entries** — hard-coded `rm ... || die` lists break the live ebuild the moment upstream deletes a file, and hand-typed paths rot the same way (LICENCES/LICENSES typo left bindist-required notices uninstalled). Evidence: `d8212e4`, `05047f1` linux-firmware.

## Idioms

Force linux-info to check only the running kernel (`7a96a8a`):
```bash
pkg_pretend() {
	CONFIG_CHECK="~BPF ~BPF_SYSCALL"
	if use test; then
		# force runtime-only checks (bug 977516)
		KERNEL_DIR="linux-info-runtime-checks-only"
	fi
	check_extra_config
}
```

Explicit disable fragment for the USE-off branch, merged unconditionally (`2c3dfd3`):
```bash
else
	cat <<-EOF > "${WORKDIR}/modules-sign.config" || die
		# CONFIG_MODULE_SIG is not set
		# CONFIG_MODULE_SIG_ALL is not set
		# CONFIG_MODULE_SIG_FORCE is not set
	EOF
fi
merge_configs+=( "${WORKDIR}/modules-sign.config" )
```

Dead-symlink sweep after installing a pruned tree (`d37bac4`):
```bash
# with -L, only dangling symlinks still test as type l
find -L "${ED}${kernel_dir}/" -type l -delete || die
```

Merged-usr detection and /lib symlink relocation (`8af1569`):
```bash
if [[ -L ${EROOT}/lib && ${EROOT}/lib -ef ${EROOT}/usr/lib ]]; then
	rm "${ED}/lib/modules/${version}"/{build,source} || die
	dosym "../../../src/linux-${version}" "/usr/lib/modules/${version}/build"
fi
```

Version-locked virtual for module rebuild scheduling (`e1117de`, `cc1f450`):
```bash
PDEPEND="
	>=virtual/dist-kernel-${PV}
"
```

Chained phase override on a linux-mod-r1 consumer (`2f95755`):
```bash
pkg_postinst() {
	linux-mod-r1_pkg_postinst
	if ver_replacing -lt "7.2.10"; then
		ewarn '...'
	fi
}
```

Credential split with backward-compat defaults and early validation (`f88a8c9`):
```bash
: "${MEASUREDBOOT_SIGN_KEY:=${SECUREBOOT_SIGN_KEY}}"
: "${MEASUREDBOOT_SIGN_CERT:=${SECUREBOOT_SIGN_CERT}}"
# pkg_setup:
openssl x509 "${openssl_args[@]}" ||
	die "Measured Boot signing certificate or key not found or not PEM format."
```

NUL-safe recursive scan replacing a top-level-only glob (`f6c28ea`):
```bash
while IFS= read -r -d '' file; do
	filename="${file##*/}"
	[[ ${filename} == *"${OKV}"* ]] && { KV_PATCH_FOUND=yes; break; }
done < <(find "${KPATCH_DIR}" -type f -print0)
```

New kernel major series before kernel-2 knows it (`1620fcc`):
```bash
K_WANT_GENPATCHES="base extras"
K_GENPATCHES_VER="1"
K_NO_VERSION_CHECK="True"
inherit kernel-2
```

## Automatable checks

Feeds a QA-scan of gentoo-zh. "Ebuilds" = `*.ebuild` in the overlay.

- **Dead linux-mod inherit**: `grep -rE 'inherit.*\blinux-mod\b' --include='*.ebuild'` excluding `linux-mod-r1`. Any hit is broken now (eclass removed from ::gentoo). Evidence: `39b122a`.
- **Unchained phase override on linux-mod-r1 consumers**: ebuilds inheriting linux-mod-r1 that define `pkg_postinst()` (or `src_compile`/`src_install`) without a `linux-mod-r1_<phase>` call inside. Violation: eclass work silently dropped. Evidence: `2f95755`.
- **MODULES_KERNEL_MAX lagging the tree**: parse `MODULES_KERNEL_MAX=` from module ebuilds and compare against the highest sys-kernel/gentoo-kernel branch present; flag ceilings below it for re-test/bump (manual build-test before raising). Evidence: `7f7461b`.
- **virtual/dist-kernel dep not versioned with ${PV}**: `grep -rE 'virtual/dist-kernel-\$\{(?!PV\})' --include='*.ebuild'` (PCRE). Any helper variable there lets the virtual lag the kernel. Also flag `[RB]DEPEND` (should be PDEPEND). Evidence: `cc1f450`, `e1117de`.
- **Stable keywords on freshly added ebuilds**: for each `git diff --diff-filter=A`-added `*.ebuild`, flag any `KEYWORDS` token not starting with `~` or `-`. Violation: untested version born stable. Evidence: `c548fa4`.
- **BROOT used for target config paths**: `grep -rE '\$\{BROOT\}/etc/' --include='*.eclass' --include='*.ebuild'`. Target-system config must come from ESYSROOT; BROOT hits are suspect (allowlist genuine build-host tool lookups). Evidence: `f8a89f2`.
- **Dangling symlinks in the installed image**: post-src_install, run `find -L "${ED}" -type l`; any output on packages installing pruned source trees is a violation, fix with the `-delete` sweep. Evidence: `d37bac4`.
- **USE-conditional config fragment without an off-branch**: in kernel-build consumers, an `if use X` block writing a `*.config` fragment with no `else` writing `# CONFIG_... is not set` lines. Heuristic; every hit inherits base-config defaults on USE-off. Evidence: `2c3dfd3`.
