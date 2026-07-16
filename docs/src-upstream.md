# SRC_URI / upstream churn

Lessons mined from gentoo/gentoo commits about the upstream-facing side of ebuilds: repos that move or get renamed, distfiles that vanish or get replaced in place, tag/version scheme mismatches, forge auto-generated tarballs, distfile authentication (verify-sig / PyPI provenance), pinned-commit snapshots, and live (-9999) ebuild upkeep. Shas refer to the gentoo/gentoo repo.

## Rules

- **When an upstream repo moves (org transfer, account rename, host redirect), update HOMEPAGE, SRC_URI, metadata.xml remote-id, and any nvchecker/version-check URLs together in one commit; never rely on forge redirects** (11) - evidence: `ee96ffc` dev-python/x-wr-timezone (GitHub repo moved personal→org, all three references stale); also `73b535a` paho-mqtt, `3a13937` mkautodoc (account renamed), `bddca2c` libdrm (GitLab rename), `6b05342` xorg-meson.eclass (host started redirecting), `274a8bc` micro, `c1e6610` sphinx-multiversion, `f54a81c` hatch-nodejs-version, `bc33609` async-timeout, `42b7c1d` msgspec, `9fa22fa` shtab.
- **Keep the -9999 live ebuild in sync with release ebuilds: port every release-ebuild fix to live in the same commit/series; ideally maintain live as the single template every bump is copied from** (7) - evidence: `5bea6b0` sys-libs/libseccomp (live-as-template policy); also `0a4f9ef` quiche (live kept fixed QA suppressions), `b064471` gerbera, `c51cdb6` qmplay2, `3b7dda3` android-file-transfer-linux, `45cec44` libsemanage (live kept dropped PYTHON_COMPAT), `74e7865` nextinspace.
- **Prefer upstream-published artifacts over forge auto-generated tag tarballs: release-uploaded tarballs for C projects, PyPI sdists (with PYPI_VERIFY_REPO for provenance) for Python - it removes SETUPTOOLS_SCM_PRETEND_VERSION/MY_P/S hacks and adds supply-chain verification** (6) - evidence: `e82d487` dev-python/flatdict (dropped GH tarball + PRETEND_VERSION for pypi+PYPI_VERIFY_REPO); also `1f262db` varlink, `79cc726` pystache, `42ba1e2` executing, `53f8026` astroid, `1ef5bfe` burp (GH archive/ → signed release tarball).
- **To package an untagged commit, version it as X.Y.Z_pYYYYMMDD / _preYYYYMMDD with a pinned COMMIT/GIT_HASH variable, fetch archive/${COMMIT}.tar.gz renamed -> ${P}.gh.tar.gz, set S=${WORKDIR}/${PN}-${COMMIT}, and stamp the version into the tree so nothing invokes git at build time - do not go -9999 or fetch a moving branch** (6) - evidence: `14e0c3c` dev-python/spyder-kernels; also `9d98712` keepassxc (echo ${PV} > .version), `44b8eb7` celestia, `a8ace12` llvm.org.eclass (PV→EGIT_COMMIT table in one shared place), `1108965` racket-mode (PV-conditional COMMIT in shared live/snapshot template).
- **Map non-PV-legal upstream versions to a legal PV mechanically and keep the literal upstream string in a variable: MY_PV/ver_rs for odd tags, DIST_VERSION for CPAN, REAL_PV + _pN for versions with '+'/build ids, 0_p<buildid> for versionless binary drops, ${PV%_p*} for patchset-only _pN bumps** (6) - evidence: `255becc` grafana-bin (12.4.3+security-02_<buildid> → 12.4.3_p2 + REAL_PVR); also `37c29ea` cmark-gfm (ver_rs 3 '.gfm.'), `b1927c9` modsecurity-crs (MY_PV=${PV/_/-}), `e58a386` Module-CPANTS-Analyse (DIST_VERSION=1.03 vs PV 1.30.0), `32e0dc7` android-sdk-cmdline-tools (PV=0_p<buildid> + ver_cut), `061b2ac` dev-lang/python (_pN, tarball from ${PV%_p*}).
- **When upstream ships detached signatures, wire verify-sig at the next bump: VERIFY_SIG_OPENPGP_KEY_PATH before inherit, verify-sig?-guarded .asc/.sig in SRC_URI, BDEPEND on the matching sec-keys package** (4) - evidence: `9f650e4` net-libs/ldns; also `1758128` bleachbit (.sig may live on a different host than the tarball), `295fd58` acl, `1ef5bfe` burp.
- **Never use on-the-fly forge archive endpoints (gitlab /-/archive/, gitweb/cgit snapshot URLs) as SRC_URI - checksums and availability are not guaranteed; mirror a fixed tarball at a durable location, and if you self-generate the tarball, commit the generation script to files/** (4) - evidence: `8c84cc6` eselect-pwsh (gitlab /-/archive/ → dev.gentoo.org mirrored file); also `7e4603f` eselect-dotnet, `6d5687e` elpher (gitweb snapshot URL), `c05dcb7` freepg (files/make-dist-archive.sh).
- **Converse of the sdist preference: when the PyPI sdist omits the test suite, fetch the GitHub tag tarball renamed -> ${P}.gh.tar.gz and leave a comment stating why** (3) - evidence: `42b7c1d` dev-python/msgspec; also `19bd910` websockets, `6587cb9` pytest-tap.
- **On every live-ebuild breakage or version bump, re-audit configure/build switches against upstream's current options - upstream silently removes and renames them** (3) - evidence: `63c9fbe` media-video/ffmpeg (SONAMEs bumped, libnpp/omx switches removed); also `9c09019` ffmpeg (--disable-libcelt gone), `110bab5` ffmpeg (explicit option became autodetection - depend on the preferred provider unconditionally).
- **Put detached-signature URLs inside verify-sig? ( ) in SRC_URI (never fetch them unconditionally) and version-bound the sec-keys keyring dep to a snapshot that contains the actual signing key; when upstream signs with a new key, bump the sec-keys package and raise the >= bound** (3) - evidence: `59b128e` gui-wm/sway; also `ec3ea73` openvpn (bug 979252: keyring lacked the new key).
- **Forge archives unpack to the repo's name, not ${P}: verify the tarball topdir and set S when it differs; Codeberg/Gitea archives are additionally unversioned, so always rename -> ${P}.tar.gz** (2) - evidence: `8287c38` app-emacs/visual-fill-column (Codeberg), `35a994c` gentoo-zsh-completions (topdir was the repo's historical name).
- **When upstream relocates old release tarballs to an archive path, list both URLs for the same distfile in SRC_URI (Portage tries each in order); use '->' to give query-string URLs stable local names** (2) - evidence: `31ca3c4` net-misc/memcached (files/ → files/old/), `48d6b84` mysql (archive CDN + .asc served via query string).
- **When upstream signs a checksum file instead of the tarball, chain verify-sig_verify_detached on the checksum file with verify-sig_verify_unsigned_checksums on the tarball inside src_unpack** (2) - evidence: `dd9164e` net-vpn/tor; also `4ba4f54` tor.
- **Write upstream org/repo names literally in SRC_URI and HOMEPAGE; use variables only for version components - ${PN} in the URL path is non-greppable and breaks silently if PN diverges from the repo name** (2) - evidence: `2759f03` dev-libs/miniz, `0a794d7` packer.
- **When a release tarball ships an empty submodule directory, add a commit-pinned submodule tarball to SRC_URI and swap it in during src_prepare (rmdir the placeholder so it dies loudly if upstream starts shipping content); with many submodules prefer one repacked all-in-one tarball over per-submodule pins** (2) - evidence: `f57b1d5` media-gfx/freecad, `c98424a` dxvk.
- **For Go packages without vendor/, host a vendored-deps tarball as a release asset (gentoo-golang-dist style) rather than a GOMODCACHE deps tarball (~20x smaller, picked up automatically), and regenerate it for the exact version on every bump** (2) - evidence: `eb616d7` net-vpn/headscale, `0ea353d` packer.
- **sec-keys hygiene: list multiple sources per fingerprint (manual,ubuntu,gentoo) for resilience and append with SRC_URI+=; when renaming the installed key file, keep a compat symlink at the old path and revbump - consumers hardcode VERIFY_SIG_OPENPGP_KEY_PATH** (2) - evidence: `5c5de71` openpgp-keys-acl (bug 978419), `b204619` openpgp-keys-openssl.
- **Provenance/verification variables (PYPI_VERIFY_REPO and similar) must keep pointing at the repo that built the currently-packaged release, even after the project moves - never apply a repo-URL mass-sed to lines that anchor artifact verification** - evidence: `b2b0671` dev-python/shtab (sed to tqdm/shtab broke provenance; only HOMEPAGE should move until a release ships from the new repo).
- **When an ebuild with verify-sig overrides src_unpack, call verify-sig_verify_detached yourself before default; guard the inherit/SRC_URI/BDEPEND so the live variant is unaffected** - evidence: `8d9f3c2` app-emulation/qemu.
- **When upstream silently replaces an already-released tarball in place, do a _pN revbump whose SRC_URI renames the fetch to -> ${P}.tar.gz (forcing a distinctly-named fresh download) and reset S with ${PV%_p*}** - evidence: `dd50909` net-misc/turbovnc.
- **When a distfile host dies, migrate to a durable archive mirror; identical content can be renamed in the Manifest by editing the DIST filename while keeping the existing hashes - no revbump needed** - evidence: `738509c` games-fps/ut2004 (bug 979267, also fixed a bogus .tar.tar name).
- **Never set EGIT_* or other eclass-reserved variables in ebuilds that do not inherit that eclass; use a neutral COMMIT/MY_COMMIT for pinned snapshot hashes** - evidence: `5c64ede` dev-embedded/ponyprog.
- **Live-ebuild pins need active maintenance: set EGIT_BRANCH when development moves off the default branch, and bump versioned auxiliary tarballs (patchsets, test data) fetched by the live ebuild on every corresponding release, pruning dead DIST entries** - evidence: `413b84e` exfatprogs (EGIT_BRANCH=exfat-next), `493ebe3` dev-lang/python (9999 pinned stale patchset tarballs).
- **Name files/ patches after the oldest release version that applies them, never ${PN}-9999-*: the live ebuild references the release-named files, so live churn forces a new filename instead of mutating a released ebuild's inputs** - evidence: `4813041` media-gfx/freecad (bug 979123).
- **Neutralize build-time downloaders: when a CMake build fetches sub-projects via ExternalProject/FetchContent, pin the tarball in SRC_URI, replace the download with DOWNLOAD_COMMAND true, and symlink the unpacked source into the expected _deps/<name>-src path after configure** - evidence: `ae4a5cf` sci-ml/ollama.
- **Fetch large test-only distfiles conditionally: test? ( ... ) in SRC_URI plus a use-test-guarded src_unpack** - evidence: `ea27b91` dev-java/bcprov (3 GB test-data tarball).
- **If a pypi-eclass fetch 404s because the PyPI name keeps hyphens (not PEP 503-normalized), set PYPI_NO_NORMALIZE=1 instead of reverting to GitHub tarballs** - evidence: `26a7dd6` dev-python/pygments-github-lexers.
- **Live builds must behave like release builds: neutralize upstream logic that keys on "is this a git checkout" (hook install, git describe versioning), and be aware git-r3 must init with the matching --object-format for sha256-format upstream repos** - evidence: `0caedcd` ecm.eclass, `0477949` git-r3.eclass.

## Idioms

Standard verify-sig triple (`9f650e4` ldns):
```bash
VERIFY_SIG_OPENPGP_KEY_PATH=/usr/share/openpgp-keys/nlnetlabs.asc
inherit verify-sig
SRC_URI="
	https://.../${P}.tar.gz
	verify-sig? ( https://.../${P}.tar.gz.asc )
"
BDEPEND="verify-sig? ( >=sec-keys/openpgp-keys-nlnetlabs-20260101 )"
```

Upstream signs a checksum file, not the tarball (`dd9164e` tor):
```bash
src_unpack() {
	if use verify-sig; then
		cd "${DISTDIR}" || die
		verify-sig_verify_detached ${MY_PF}.tar.gz.sha256sum{,.asc}
		verify-sig_verify_unsigned_checksums \
			${MY_PF}.tar.gz.sha256sum sha256 ${MY_PF}.tar.gz
		cd "${WORKDIR}" || die
	fi
	default
}
```

Old releases moved to an archive path - list both URLs (`31ca3c4` memcached):
```bash
SRC_URI="
	https://memcached.org/files/${MY_P}.tar.gz
	https://memcached.org/files/old/${MY_P}.tar.gz
"
```

Upstream replaced a tarball in place - _pN + forced fresh distfile name (`dd50909` turbovnc):
```bash
SRC_URI="https://github.com/TurboVNC/turbovnc/releases/download/${MY_PV}/turbovnc-${PV%_p*}.tar.gz -> ${P}.tar.gz"
S="${WORKDIR}"/${P%_p*}
```

Pinned-commit snapshot (`14e0c3c` spyder-kernels):
```bash
COMMIT="630121acceaec56ee20e3c24e8489d028b382f2c"
SRC_URI="https://github.com/spyder-ide/${PN}/archive/${COMMIT}.tar.gz -> ${P}.gh.tar.gz"
S=${WORKDIR}/${PN}-${COMMIT}
```

PV-conditional COMMIT so the live file doubles as the snapshot ebuild (`1108965` racket-mode):
```bash
if [[ "${PV}" == *9999* ]] ; then
	inherit git-r3
	EGIT_REPO_URI="https://github.com/greghendershott/${PN}"
else
	[[ "${PV}" == *p20260303 ]] && COMMIT=e5f22ad408740ec517a436ec19b74ce1398e61bc
	SRC_URI="https://github.com/greghendershott/${PN}/archive/${COMMIT}.tar.gz -> ${P}.snapshot.gh.tar.gz"
fi
```

Codeberg/Gitea archive: rename and fix S (`8287c38` visual-fill-column):
```bash
SRC_URI="https://codeberg.org/joostkremers/${PN}/archive/${PV}.tar.gz
	-> ${P}.tar.gz"
S="${WORKDIR}/${PN}"
```

Illegal upstream version string mapped to legal PV (`255becc` grafana-bin):
```bash
REAL_PV="12.4.3+security-02"
REAL_PVR="12.4.3+security-02_25720634919"
BASE_URL="https://dl.grafana.com/grafana/release/${REAL_PV}"
SRC_URI="amd64? ( ${BASE_URL}/grafana_${REAL_PVR}_linux_amd64.tar.gz )"
S=${WORKDIR}/grafana-${REAL_PV}
```

PyPI sdist with provenance verification replacing a GitHub tarball (`e82d487` flatdict):
```bash
DISTUTILS_USE_PEP517=hatchling
PYPI_VERIFY_REPO=https://github.com/gmr/flatdict
inherit distutils-r1 pypi
# (drop SRC_URI override and SETUPTOOLS_SCM_PRETEND_VERSION export)
```

Test-only distfile gated on USE=test (`ea27b91` bcprov):
```bash
SRC_URI="...
	test? ( https://github.com/bcgit/bc-test-data/archive/${MY_PV}.tar.gz -> bc-test-data-${MY_PV}.tar.gz )"
src_unpack() {
	unpack bc-java-${MY_PV}.tar.gz
	use test && unpack bc-test-data-${MY_PV}.tar.gz
}
```

## Automatable checks

- **Stale upstream location**: HEAD-request every SRC_URI and HOMEPAGE URL; a permanent redirect (301/308) landing on a different host or forge org/repo path is a violation (update in place, don't trust the redirect). Evidence: `6b05342`, `ee96ffc`.
- **remote-id / SRC_URI mismatch**: parse metadata.xml remote-id (github/gitlab/codeberg) and compare against the org/repo in SRC_URI and HOMEPAGE; mismatch = violation. Evidence: `ee96ffc`, `9fa22fa`.
- **${PN} inside forge URL paths**: grep SRC_URI/HOMEPAGE for `github.com/[^/]*/\${PN}` or `\${PN}` in org/repo path segments; any hit = violation (spell repo names literally). Evidence: `2759f03`.
- **Reserved eclass variables without the eclass**: grep for `^EGIT_` assignments in ebuilds whose inherit line lacks `git-r3`; any hit = violation. Evidence: `5c64ede`.
- **Unstable dynamic archive URLs**: grep SRC_URI for `/-/archive/`, `;a=snapshot`, cgit `/snapshot/`; any hit = violation (mirror a fixed tarball instead). Evidence: `8c84cc6`, `6d5687e`.
- **Codeberg/Gitea archive without rename**: grep SRC_URI for `codeberg.org/.*/archive/` lacking an `-> ${P}` rename, or such an entry with no explicit `S=` assignment; either = violation. Evidence: `8287c38`.
- **Commit-hash archive without S override**: SRC_URI matching `/archive/[0-9a-f]{40}` with no `S=` containing the hash variable = violation (unpack dir will not be ${P}). Evidence: `14e0c3c`, `5c64ede`.
- **Unguarded signature fetch**: in ebuilds inheriting verify-sig, any `.asc`/`.sig`/`.sha256sum` SRC_URI entry outside a `verify-sig? ( )` group = violation. Evidence: `59b128e`.
- **Unversioned keyring dep**: `verify-sig? ( sec-keys/openpgp-keys-* )` without a `>=` bound = warning (keyring may predate the signing key). Evidence: `59b128e`, `ec3ea73`.
- **verify-sig + custom src_unpack**: ebuild inherits verify-sig and defines `src_unpack()` without calling `verify-sig_verify_detached` = violation (signature silently unchecked). Evidence: `8d9f3c2`.
- **9999-named patches**: existence of `files/${PN}-9999-*.patch` = violation (name after the oldest release consuming them). Evidence: `4813041`.
- **Live/release drift**: diff the -9999 ebuild against the newest release ebuild for PYTHON_COMPAT, IUSE, and dependency-block differences not explained by the PV conditional; drift = warning. Evidence: `45cec44`, `b064471`, `5bea6b0`.
- **Avoidable setuptools-scm hack**: `SETUPTOOLS_SCM_PRETEND_VERSION` export combined with a `github.com/.../archive/` SRC_URI in a distutils-r1 ebuild = warning; prefer the PyPI sdist (`inherit pypi`, PYPI_VERIFY_REPO) unless a comment justifies the GH tarball (e.g. sdist lacks tests). Evidence: `1f262db`, `e82d487`, `42b7c1d`.
