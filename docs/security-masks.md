# Security handling: CVE bumps, stabilization, masks & last-rites

Distilled from ~57 mined gentoo/gentoo commit lessons. Covers: how security version bumps and CVE patch backports are done in ::gentoo, security-stabilization workflow signals (per-arch keyword flips, straight-to-stable exception, vulnerable-version cleanup), and last-rites/mask handling from the consumer side (deprecated deps, dead eclasses). Coverage note: no lesson explicitly touched GLSA filing or writing profiles/package.mask entries themselves (only two low-value gcc time64 profile-mask commits, fef60d2/1b0b011); last-rites practice here is observed from the package-consumer side.

## Rules

- **A security/point release within the same upstream branch is a byte-identical ebuild copy: `cp` the previous ebuild, regenerate Manifest, and verify `git diff --no-index old new` is empty — any drift in a hurried bump is a bug** (12+ occurrences) - evidence: `68aa194` www-client/firefox (152.0.6 added as exact copy of 152.0.5, only Manifest changed; same pattern in `0f1ddde` c-ares, `b27120e`/`322369e` asterisk, `6028ab1` unbound, `57607c1` haveged, `a831544` postfix, `a8d8ac9` radvd, `cc758be` elixir, `8293e8c` thunderbird, `931f0f0`/`60e1ef9` pdns).
- **CVE backports ship as FILESDIR patches named `${PN}-${PV}-CVE-<id>.patch` (or the upstream advisory ID), with the Gentoo bug URL and upstream commit/advisory URL as the first lines of the patch, added to PATCHES, plus a revbump** (8 occurrences) - evidence: `3386a95` app-text/evince (CVE fixed in upstream git only, shipped as -r1 + provenance-headed patch); also `8b26a74` libssh2 (one patch per CVE), `50ca7ea` mysql (upstream commits verbatim), `ddef20e` gst-plugins-good (advisory-ID names, SA-2026-00xx). Anti-pattern: `b0bc09f` dev-ml/opam-common shipped `fix-dotinstall-escape.patch` with no version/CVE name and no header — an audit dead end.
- **Security backports that change installed code always warrant a revbump; the only sanctioned skip is a version that has never been stabilized and gets stabilized immediately with the patches included** - evidence: `ddef20e` gst-plugins-good (patched ~arch 1.26.11 in place, stabilized right after); `5aeba4c` clamav ("CVE fixes always warrant a revbump").
- **Add the fixed version alongside the vulnerable one; reference the security bug with `Bug:` (not `Closes:`) so it stays open through stabilization; drop the vulnerable version only after all arches have flipped** (3 occurrences) - evidence: `55e30c5` net-misc/asterisk (22.10.1 added next to 22.10.0, Bug: trailer); `fb4c35f` modsecurity (3.0.14-r2 removed only after 3.0.15 stabilized everywhere).
- **Security stabilization lands as one keyword-flip commit per architecture (ekeyword-generated), subject `Stabilize <ver> <arch>, #<bug>`** (4 occurrences) - evidence: `5c627fa` dev-libs/modsecurity (arm64/amd64/x86 flipped in separate commits: `148e587`, `428b740`; same pattern `492f22b` modsecurity-crs, which stabilized legacy 3.3.x and current 4.x branches in parallel for one bug).
- **Bump hygiene: reset KEYWORDS to ~arch on a new version — except the straight-to-stable security exception: when the new ebuild is byte-identical to the current stable one, it may inherit stable keywords directly, as there is no packaging risk to test** - evidence: `2f643be` net-vpn/openvpn (2.6.20 committed with stable keywords copied from stable 2.6.17-r2); `2878899` qemu (standard ~arch reset on a security bump).
- **Backport CVE fixes to every still-keyworded branch instead of forcing users into a version jump; reuse one patch file across branches/versions where it applies, naming it after the lowest applicable version, and revbump each affected ebuild** (4 occurrences) - evidence: `7cc329a` dev-lang/elixir (1.20.1-only fixes backported to 1.16/1.17/1.18/1.19); `46052a5` elixir (1.16.3-r1 reuses the 1.18.4-named patches); `fb50d31` dev-qt/qtsvg (one patch shared by 6.10.3-r1 and 6.11.0-r1); `156fbf3` nginx (CVE fixed on both stable and mainline branches in one commit series).
- **When backports accumulate (LTS branch, multi-commit fix sets), roll them into a versioned/dated patchset tarball fetched via SRC_URI and point PATCHES at the unpacked directory — FILESDIR has size limits and bloats the mirrored repo; record the backported commit list in the commit message** (2 occurrences) - evidence: `5aeba4c` clamav (12 patches → clamav-0.103-patches-20260702.tar.xz); `d29d4fe` musl (7 fixes → distfiles.gentoo.org/pub/proj/musl/ tarball, PATCHES entry is a directory).
- **Keep multi-commit upstream fixes for one CVE together in a single patch file with the format-patch metadata and `(cherry picked from ...)` lines intact; a required security revbump is also the moment to fold in pending low-risk cleanups** - evidence: `6f5d886` sys-auth/sssd (fix + follow-up commit concatenated into one patch, -r1).
- **A security bump that crosses an upstream minor branch is NOT a rename: audit the whole ebuild — drop patches upstream merged, respin-and-rename version-specific patches, remove USE flags/tools for features upstream deleted** - evidence: `6891157` mail-mta/exim (4.98→4.99: one patch upstreamed, one respun, radius USE flag and convert4r3/4 tools removed).
- **When one advisory set spans several split packages, commit per-package with per-package `Bug:` trailers (multiple trailers when patches cover several tracker bugs)** (3 occurrences) - evidence: `4b68df0` gst-plugins-bad (same PR as `ddef20e` gst-plugins-good and `3bcbc1b` gst-plugins-base, each with own commit and Bug: lines).
- **When a security fix lands in a package's engine/companion dependency, raise the dependency floor in the dependent package so users cannot mix fixed data with a vulnerable engine** - evidence: `b458eeb` www-apache/modsecurity-crs (RDEPEND floor raised to >=mod_security-2.9.14 in the same PR as the engine fix).
- **After security-driven keyword drops, sync any virtual/meta-package pointing at the package: a virtual's KEYWORDS must stay a subset of its providers' or it becomes unsatisfiable** - evidence: `e228755` virtual/httpd-php (kept ~keywords on five arches where dev-lang/php:8.5 had just been unkeyworded for a security issue).
- **Tests failing only under FEATURES=network-sandbox block security stablereqs: `rm` exactly the offending test files in src_prepare under `use test` with a bug-reference comment and `|| die`, never RESTRICT the whole suite** (3 occurrences) - evidence: `f92f11b`/`1ba687a` www-servers/nginx (tunnel_next_upstream.t); `0dde187` dev-libs/modsecurity (two remote-fetching test fixtures).
- **When a dependency is being last-rited, switch consumers to `|| ( replacement[compat-flag(+)] old-pkg )` with the maintained replacement FIRST (the resolver picks the first satisfiable entry), and revbump because *DEPEND changed; also migrate elog/optfeature strings that recommend the dying package** (5 occurrences) - evidence: `d753e13` dev-lang/julia-bin (p7zip → `|| ( >=app-arch/7zip-24.09[symlink(+)] app-arch/p7zip )`); `f98fad7` games-util/slade (reordered so 7zip precedes p7zip); `16c0ae9` xarchiver / `0e829e5` lxqt-archiver / `8f01f28` engrampa (message-only migrations — DEPEND greps miss these).
- **Track `@DEPRECATED`/`@DEAD` markers on ::gentoo eclasses the overlay inherits and migrate consumers before deletion; the marker is machine-readable (pkgcheck flags consumers) and removal follows a grace period** (4 occurrences) - evidence: `b7c38ce`/`39b122a` linux-mod.eclass last-rited (successor linux-mod-r1, overlay consumers break with unknown-eclass on removal); `ad48101` qt5-build @DEAD; `ddff06e` java-osgi `@DEPRECATED: none`.
- **When a security advisory hits a sibling/forked project, check whether your fork shares the bug and backport with the advisory URL in the patch header — do not wait for the fork's upstream** - evidence: `102a701` net-analyzer/nagios-plugins (suid check_icmp overflow from the monitoring-plugins oss-security advisory backported to the diverged fork).
- **Out-of-band security hotfix builds with non-PMS version strings (`+`, CI build ids) map to a legal `_pN` PV; carry the literal upstream string in REAL_PV/REAL_PVR variables for SRC_URI and S, with a comment explaining why** - evidence: `255becc` www-apps/grafana-bin (`12.4.3+security-02_25720634919` → 12.4.3_p2).

## Idioms

Byte-identical security bump with drift check (`68aa194`):
```sh
cp foo-1.2.3.ebuild foo-1.2.4.ebuild
pkgdev manifest
git diff --no-index foo-1.2.{3,4}.ebuild   # must be empty
```

CVE backport patch with provenance header (`3386a95`):
```sh
PATCHES=(
	# bug #975515
	"${FILESDIR}"/${PN}-48.1-CVE-2026-46529.patch
)
# first lines inside the patch file:
# https://bugs.gentoo.org/975515
# https://gitlab.gnome.org/GNOME/evince/-/commit/970c219e...
```

Patchset tarball for multi-commit backports; PATCHES entries may be directories (`d29d4fe`):
```sh
SRC_URI="... https://distfiles.gentoo.org/pub/proj/musl/${P}-patches.tar.xz"
PATCHES=(
	"${FILESDIR}"/${PN}-getifaddrs-qemu-workaround.patch
	"${WORKDIR}"/${P}-patches
)
```

Last-rited dep replacement, maintained provider first (`d753e13`):
```sh
RDEPEND="
	|| (
		>=app-arch/7zip-24.09[symlink(+)]
		app-arch/p7zip
	)
"
```

Drop only the network-needing test, keep the suite (`f92f11b`):
```sh
src_prepare() {
	default
	if use test ; then
		# Fails with network-sandbox (bug #976129)
		rm "${S}"/tests/tunnel_next_upstream.t || die
	fi
}
```

Non-PMS security hotfix version mapping (`255becc`):
```sh
# upstream calls this 12.4.3+security-02; '+' is illegal in PV, hence _p2
REAL_PV="12.4.3+security-02"
REAL_PVR="${REAL_PV}_25720634919"
SRC_URI="amd64? ( ${BASE_URL}/grafana_${REAL_PVR}_linux_amd64.tar.gz )"
S="${WORKDIR}"/grafana-${REAL_PV}
```

## Automatable checks

- **Deprecated/dead eclass inherits**: for each eclass inherited by overlay ebuilds, grep the ::gentoo eclass header for `^# @DEAD` or `^# @DEPRECATED:`; any hit on an inherited eclass is a violation (migrate to the named successor before deletion). Evidence: b7c38ce, 39b122a.
- **Patch provenance headers**: for every `files/*.patch` referenced from PATCHES/eapply, the first ~10 lines must contain a `bugs.gentoo.org` URL or an upstream commit/advisory URL, and the filename should carry `${PN}`+version (and CVE/advisory ID when security-motivated). Missing both = violation. Evidence: b0bc09f (anti-pattern), 3386a95, ddef20e.
- **Point-bump logic drift**: on a version bump commit where the commit message cites a security bug, `git diff --no-index` the new ebuild against the previous version; non-empty diff beyond KEYWORDS is a flag for review. Evidence: 68aa194.
- **Patch added without revbump**: a commit that adds entries to PATCHES in an existing ebuild file (no `-rN` rename) where that ebuild has any non-~ KEYWORDS = violation (revbump required so installed systems rebuild). Evidence: ddef20e (states the only exception), 50ca7ea, 5aeba4c.
- **KEYWORDS not reset on bump**: new version's KEYWORDS contain stable (non-~) entries AND the ebuild differs from the previous stable ebuild = violation; identical-to-stable is the only sanctioned straight-to-stable case. Evidence: 2f643be, 2878899.
- **Last-rited packages in deps**: grep overlay `*DEPEND` atoms against ::gentoo `profiles/package.mask` removal entries; any match = violation. Additionally flag `|| ( ... )` groups where a masked/deprecated provider is listed before a maintained one. Evidence: d753e13, f98fad7.
- **Last-rited packages in messages**: grep `elog`/`einfo`/`optfeature` string arguments for category/PN of masked-for-removal packages — dep-only scans miss these. Evidence: 8f01f28, 16c0ae9, 0e829e5.
- **Virtual keyword strandedness**: for each virtual/meta ebuild, KEYWORDS must be a subset of the union its providers carry per arch; excess keywords = violation. Evidence: e228755.
- **Stale engine floors**: for data/rules packages with a versioned `>=` dep on an engine, compare the floor against the newest engine version cited in a security bug; floor below a security-fixed version = flag. Evidence: b458eeb.
- **FILESDIR bloat**: more than ~10 patch files (or large total size) under a package's `files/` = flag to convert to a SRC_URI patchset tarball. Evidence: 5aeba4c, d29d4fe.
