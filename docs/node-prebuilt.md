# Node/JS and prebuilt-bin packages

Distilled from gentoo/gentoo commit lessons. Covers -bin/prebuilt ebuilds (Electron-style apps, vendor blobs, per-arch binary artifacts), QA_PREBUILT / RESTRICT handling, soname and RPATH problems of bundled binaries, unpacker payload gotchas, and prebuilt JS frontend assets. Coverage note: the mined set contains almost no pure Node lessons (no npm-tarball/node_modules/electron-unpack commits surfaced); the npm-specific side is thin and this doc leans on prebuilt-bin evidence. All shas refer to gentoo/gentoo.

## Rules

- **When per-arch binary artifacts lag the main release, isolate their SRC_URI in a separate block gated by a trivially removable `if false &&` toggle; flip it plus keywords in a follow-up commit once the files exist. Never ship SRC_URI entries pointing at not-yet-published files** (4) - evidence: `2791583` dev-lang/rust-bin (niche-arch bootstrap tarballs stubbed with `if false; then` at bump time, re-enabled with ~mips/~sparc keywords once projg2/rust-bootstrap published them; same pattern in 8a2cd46, a99b610, 7580213).
- **Prebuilt packages get `KEYWORDS="-* <arches upstream ships>"` - whitelist only arches with actual binaries** (3) - evidence: `cfc72a0` media-gfx/brscan5 (scanner blob keyworded without -*, implying portability it does not have; also 255becc, 4fd355e).
- **Set QA_PREBUILT covering every installed binary blob; add QA_PRESTRIPPED and/or RESTRICT="splitdebug" when the blobs are pre-stripped or debug-split fails** (3) - evidence: `255becc` www-apps/grafana-bin (QA_PREBUILT/QA_PRESTRIPPED for the Go blobs; f9a2b99 pairs QA_PREBUILT="opt/${PN}/*" with RESTRICT="splitdebug"; 0a40502 incus lists every installed Go binary).
- **One upstream artifact per arch means USE(arch)-conditional SRC_URI blocks, each with its own Manifest entry** (3) - evidence: `4fd355e` app-admin/bitwarden-cli-bin (added arm64 by splitting SRC_URI into `amd64? ( url ) arm64? ( url )`; same shape in 255becc, a99b610 incl. `elibc_musl?`/`big-endian?` variants).
- **Unresolved-soname/RPATH QA on a bundled component: either patchelf `--set-rpath '$ORIGIN/...'` so its private libs resolve in-tree (plus RDEPEND on the system libs it still needs), or delete the component and point the app at system equivalents - do not paper over it with QA_SONAME/QA_FLAGS_IGNORED** (2) - evidence: `f9a2b99` dev-util/intellij-idea (bundled Xvfb: USE flag chooses patchelf'd blob vs `rm -r` + system xorg-server[xvfb]); `13a7a9d` net-libs/quiche (replaced QA_* suppressions with patchelf --remove-rpath and a properly versioned install).
- **Map non-PMS upstream version strings to a legal PV (`_pN`, `0_p<buildid>`) and carry the literal upstream string in REAL_PV-style variables for SRC_URI and S, with a comment explaining why** (2) - evidence: `255becc` www-apps/grafana-bin (hotfix "12.4.3+security-02_25720634919" mapped to _p2 + REAL_PV/REAL_PVR); `32e0dc7` dev-util/android-sdk-cmdline-tools (versionless "latest" zip encoded as 0_p<buildid>, URL rebuilt via `$(ver_cut 3)`).
- **When upstream publishes generated frontend assets (web UI built with a Node/Elm toolchain) as a release artifact, fetch that artifact via SRC_URI and copy it into place in src_prepare instead of rebuilding the JS toolchain** (2) - evidence: `fa0f1e6` app-metrics/alertmanager (prebuilt web-ui tarball cp'd to ui/app; building it from source is impractical); `510057e` media-fonts/unifont (same idea: install the shipped precompiled artifact, drop the heavy BDEPEND).
- **Proprietary or redistribution-limited blobs need RESTRICT="mirror" (plus "bindist" when the license forbids redistribution)** (2) - evidence: `32e0dc7` dev-util/android-sdk-cmdline-tools (RESTRICT="bindist mirror" for the Google zip; 255becc grafana-bin uses RESTRICT="mirror").
- **Depend only on what the blobs actually link or invoke; udev-rules-only packages need virtual/udev, not virtual/libudev; and delete unwanted bundled binaries explicitly with `rm ... || die` plus a comment, never ship them crippled (e.g. non-executable)** - evidence: `cfc72a0` media-gfx/brscan5 (dropped never-linked dbus/libudev deps; `rm brscan_gnetconfig` with comment replaced an undocumented -x hack).
- **When a bundled blob's ABI ties it to a specific system package version, derive the pin by inspecting the blob itself and record the method in a comment; re-check only when it breaks** - evidence: `1fd449c` www-client/opera (CHROMIUM_VERSION for the ffmpeg-chromium dep discovered via `strings libffmpeg.so | grep -F 'FFmpeg version'`).
- **Eclass-driven unpackers must know the payload format: declare it pre-inherit and verify against the actual distfile at unpack time** - evidence: `035e309` eclass/rpm.eclass (RPM_COMPRESS_TYPE @PRE_INHERIT var generates the USE-conditional app-arch/rpm BDEPEND; unpack detects `PayloadIs*` via strings and eqawarns on mismatch, dies for lzma+rpm2targz).
- **Re-verify glob-based file installs after every bump, especially license/notice files whose installation is a bindist compliance requirement** - evidence: `f96c060` sys-kernel/linux-firmware (`dodoc LICEN[CS]E.*` silently matched nothing after upstream moved texts into LICENSES/; fixed with `dodoc -r WHENCE LICENSES`).
- **When a distfile host dies, migrate to a durable archive mirror; identical content can be renamed in the Manifest (fix mangled names like .tar.tar) keeping the existing size/hashes, no revbump** - evidence: `738509c` games-fps/ut2004 (dead fan mirror replaced with unreal-archive S3; DIST renamed to .tar.bz2 with hashes preserved).
- **Ebuilds installing udev rules (common for -bin hardware tools) must call udev_reload in both pkg_postinst and pkg_postrm; adding it warrants a revbump** - evidence: `e4bdac9` dev-util/android-sdk-cmdline-tools (udev_dorules without any reload left new rules inert until reboot).
- **When a runtime tool a -bin package invokes is being last-rited, switch to `|| ( new-pkg[compat-flag(+)] old-pkg )` with the replacement first, and revbump because RDEPEND changed** - evidence: `d753e13` dev-lang/julia-bin (p7zip dep replaced by `>=app-arch/7zip-24.09[symlink(+)]` fallback group).

## Idioms

Per-arch artifact fetch + arch whitelist (4fd355e):
```bash
SRC_URI="
	amd64? ( .../cli-v${PV}/bw-oss-linux-${PV}.zip )
	arm64? ( .../cli-v${PV}/bw-oss-linux-arm64-${PV}.zip )
"
KEYWORDS="-* ~amd64 ~arm64"
```

Illegal upstream version mapped to PV + literal REAL_PV for URLs (255becc):
```bash
# upstream "12.4.3+security-02" is not a valid PV -> _p2
REAL_PV="12.4.3+security-02"
REAL_PVR="12.4.3+security-02_25720634919"
SRC_URI="amd64? ( https://dl.grafana.com/grafana/release/${REAL_PV}/grafana_${REAL_PVR}_linux_amd64.tar.gz )"
S="${WORKDIR}/grafana-${REAL_PV}"
```

Bundled self-contained component: patchelf in-tree or remove (f9a2b99):
```bash
if use bundled-xvfb; then
	patchelf --set-rpath '$ORIGIN/../lib' "${S}"/.../bin/{Xvfb,xkbcomp} || die
	patchelf --set-rpath '$ORIGIN' "${S}"/.../lib/lib*.so* || die
else
	rm -vr "${S}"/plugins/remote-dev-server/selfcontained || die
fi
```

Staged SRC_URI block for artifacts that lag the release (2791583):
```bash
# Keep this separate to allow easy commenting out if not yet built
if [[ ${PV} != *9999* && ${PV} != *beta* ]] ; then   # stub to 'if false' at bump
	SRC_URI+=" sparc? ( ${GENTOO_BIN_BASEURI}/rust-${PVR}-sparc64-unknown-linux-gnu.tar.xz ) "
fi
```

Upstream prebuilt web-UI assets instead of a Node toolchain (fa0f1e6):
```bash
SRC_URI+=" https://github.com/prometheus/alertmanager/releases/download/v${PV}/${PN}-web-ui-${PV}.tar.gz"
src_prepare() {
	default
	cp -a "${WORKDIR}"/dist ui/app || die
}
```

rpm.eclass payload declaration, pre-inherit (035e309):
```bash
RPM_COMPRESS_TYPE="zstd"   # must match `strings blob.rpm | grep -o 'PayloadIs[a-zA-Z]*'`
inherit rpm
```

Blob-derived ABI pin with the discovery method recorded (1fd449c):
```bash
# From `strings libffmpeg.so | grep -F "FFmpeg version"` -> Chromium major
CHROMIUM_VERSION="142"
RDEPEND="media-video/ffmpeg-chromium:${CHROMIUM_VERSION}"
```

## Automatable checks

- Ebuild sets QA_PREBUILT or installs under /opt from a binary distfile, but KEYWORDS does not start with `-*` -> flag (grep `^KEYWORDS=` vs presence of `QA_PREBUILT=`). Evidence: cfc72a0.
- Package name ends in `-bin` but ebuild defines no QA_PREBUILT -> flag for review (grep -L 'QA_PREBUILT' across `*-bin/*.ebuild`). Evidence: 255becc.
- SRC_URI contains arch-tagged artifact names (`linux_amd64`, `x86_64`, `arm64`, `aarch64`) without a matching `amd64?`/`arm64?` USE conditional -> flag: likely single-arch fetch that breaks other keyworded arches. Evidence: 4fd355e.
- LICENSE is non-free (not in @FREE) and RESTRICT lacks `mirror` -> flag missing RESTRICT="mirror" (parse LICENSE + RESTRICT). Evidence: 32e0dc7.
- `udev_dorules`/`udev_newrules` present but `udev_reload` missing from pkg_postinst or pkg_postrm -> violation (pure grep). Evidence: e4bdac9.
- QA_SONAME / QA_FLAGS_IGNORED assignments in an ebuild -> review item: check whether a patchelf --remove-rpath / --set-rpath '$ORIGIN' fix applies instead of suppression. Evidence: 13a7a9d, f9a2b99.
- rpm.eclass consumers: RPM_COMPRESS_TYPE declared value vs `strings <rpm> | grep -o 'PayloadIs[a-zA-Z]*'` on the fetched distfile -> mismatch is a violation; `lzma` payload with only rpm2targz available is a hard error. Evidence: 035e309.
- Glob patterns inside dodoc/doins lines (e.g. `LICEN[CS]E.*`, `*.txt`) -> on every bump, verify the glob still matches files in the new tarball (expand against unpacked ${S}); empty expansion is a violation, hard error when guarded by `use bindist`. Evidence: f96c060.
- HEAD-request every SRC_URI in the overlay periodically; 404/dead host -> migration task; while migrating, distfile renames with identical content may keep existing Manifest hashes. Evidence: 738509c.
- SRC_URI entries inside an `if false` guard -> periodic reminder check: probe whether the artifacts now exist upstream and the guard can be flipped (plus keywords added). Evidence: 2791583.
