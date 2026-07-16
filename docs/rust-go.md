# Rust & Go packaging lessons (cargo.eclass, CRATES, GIT_CRATES, RUST_MIN_VER, go-module, vendor tarballs, EGO_SUM)

Distilled from gentoo/gentoo commits (2025-2026 window). Covers cargo/go-module ebuild QA: toolchain floors, crate/vendor tarball handling, cross-compilation, strip/CFLAGS QA on Rust/Go ELFs, PyO3 interop, and eclass phase-collision traps. Shas refer to the gentoo/gentoo repo.

## Rules

- **On every go-module bump, read the `go`/`toolchain` directive in go.mod and mirror it as `BDEPEND=">=dev-lang/go-X.Y.Z"`** — the eclass floor will not enforce it and users get cryptic compile errors (recurred 10x). Evidence: `bbdf70d` app-containers/containerd (2.2.5 unbuildable on older go, no minimum in ebuild); also `9c887d7` kubo, `2e08677` hugo (explicit QA notice "found go.mod file which specifies go 1.26.0"), `a72c586` restic, `115004d` alertmanager, `d26e4bd` podman, `0a794d7` packer, `016a00c` blackbox_exporter, `39db8b1` incus. When dozens of packages break at once, bump the central floor in go-module.eclass instead (`59c0c14`, kept the `:=` slot operator).
- **On every cargo/maturin bump or CRATES refresh, re-read `rust-version` from Cargo.toml (highest across workspace + vendored crates) and sync `RUST_MIN_VER`** (recurred 6x). Evidence: `6ca2ba0` dev-util/maturin (eclass QA flagged stale 1.88.0 vs required 1.89.0); also `b12367a` synapse (bug 977862, real user breakage), `a8b8dd1` setuptools-rust (vendored-crate update raised MSRV), `c75e972` vaultwarden, `812393b` gnome-commander.
- **Silence "built without respecting CFLAGS" on pure-Rust/Go binaries with `QA_FLAGS_IGNORED="usr/bin/${PN}"` (list every installed ELF path); do not try to inject CFLAGS** (recurred 4x). Evidence: `92ddcc7` sys-process/rust-parallel (bug 978974); also `819e1cb` wild, `812393b` gnome-commander, `0a40502` incus (QA_PREBUILT for all Go binaries).
- **When a non-cargo build system (meson/make/cmake) shells out to cargo, inherit cargo with `CARGO_OPTIONAL=1` (plus `RUST_OPTIONAL=1` if USE-gated), run `cargo_gen_config` after unpack, and wrap the compile as `cargo_env <build_cmd>`** (recurred 4x). Evidence: `71bcb06` dev-vcs/git (meson invoked cargo without Gentoo toolchain config); also `82e00a0` dnsdist (USE-gated Rust: `${RUST_DEPEND}` inside `yaml? ( )`, rust_pkg_setup under `use yaml`, filter-lto for mixed C++/Rust), `dc4f0b7` mesa (cargo eclass reused only to fetch crates into meson packagecache), `ee0a1af` kde.org.eclass.
- **Prefer a `${P}-vendor.tar.xz` (vendored deps, go-module picks up vendor/ automatically) over a GOMODCACHE `-deps` tarball — ~20x smaller — and regenerate it for every version, never reuse the old one** (recurred 4x). Evidence: `eb616d7` headscale (259 MB deps tarball replaced by vendor tarball); also `0ea353d` packer (deps tarball must match exact new version), `3bb3e84` blackbox_exporter, `274a8bc` micro (gentoo-golang-dist release asset).
- **Never use heredocs or `<<<` herestrings in code reachable from ebuild/eclass global scope** (metadata generation runs sandboxed; bash creates a temp file for them) — use `read -rd '' ... < <(printf %s ...)` or `mapfile`, and drop `|| die` on the read since nonzero exit is the normal EOF outcome (recurred 5x). Evidence: `b982445` cargo.eclass (GIT_CRATES parsing failed under sandbox, bug 978940); also `088ecc1` go-module.eclass (EGO_SUM parsing), `ae0802a` cargo.eclass (silent empty vars when read failed), `b93b996` wezterm, `c3dcad7` nginx.eclass.
- **Patch `-s` (and stray `-w`) out of upstream go/ldflags so portage controls stripping and splitdebug works; keep the `-X` version-injection flags** (recurred 3x). Evidence: `6b2d63e` sci-ml/ollama (bug 978763, pre-stripped Go binary broke strip/splitdebug); also `274a8bc` micro, `0e9c7e1` ollama (cmake-driven Go build).
- **Never execute a freshly built target binary (completions, man pages, `--version`) without an `if ! tc-is-cross-compiler` guard; validate generated output content with `grep -q ... || die`, and `ewarn` on the cross path** (recurred 3x). Evidence: `b82b853` net-misc/openrdap (completion generator exits 0/1 unreliably, output validated by grep); also `0a40502` incus, `241a058` go-env.eclass (`go run` needs a qemu exec wrapper when cross-compiling).
- **PyO3/maturin packages failing on a new CPython with "interpreter version is newer than PyO3's maximum supported version": `export PYO3_USE_ABI3_FORWARD_COMPATIBILITY=1` instead of capping PYTHON_COMPAT or waiting for a crate bump** (recurred 3x). Evidence: `793c804` dev-python/libcst; also `7f9b3b0` jellyfish, `4ab34a0` regress.
- **When two inherited eclasses both export src_unpack (cargo + pypi, cargo + kde.org), define the phase explicitly in the ebuild and call each eclass's piece yourself — inherit order silently picks one** (recurred 3x). Evidence: `b16b5e3` dev-python/vcsgraph (bug 978092: pypi_src_unpack then cargo_gen_config); also `ee0a1af`/`114e7d3` kde.org.eclass (gate on `has cargo ${INHERITED} && [[ -n ${CARGO} ]]` — inheritance alone is not enough with CARGO_OPTIONAL=1).
- **Widening LLVM_COMPAT to a new slot on cargo+llvm-r1 (bindgen) packages is a test-build-then-widen one-liner, no revbump (build-time dep relaxation)** (recurred 4x). Evidence: `b63bf6c` sequoia-sop; also `b99c425` sequoia-sqv, `99f2ea7` sequoia-sq, `7bc46ff` sequoia-chameleon-gnupg.
- **Cross-compiling cargo with -sys crates: never export global `PKG_CONFIG_*`/`OPENSSL_*` — use per-target-triple variants, keyed on `rust_abi "${CHOST}"` (the Rust triple), not raw CHOST** (recurred 2x). Evidence: `0a892e7` dev-lang/rust (bug 978022: build-host -I/usr/include leaked into target build); refined by `d9391c2` (CHOST-keyed vars missed, crates look at the Rust triple).
- **Cross-compiling Go: derive and export both `GOOS` and `GOARCH` from CHOST, not GOARCH alone; provide the `go run` exec wrapper as `go_${GOOS}_${GOARCH}_exec` in PATH rather than a global `GOFLAGS=-exec`** (recurred 4x). Evidence: `8b45513` go-env.eclass (host-OS binaries produced for foreign-OS targets); `241a058` (qemu wrapper via sysroot_make_run_prefixed), `e234949` (GOFLAGS=-exec broke projects that unset GOOS/GOARCH for build-host tools), `479df0d` toolchain-funcs.eclass (per-target tuning vars GOAMD64/GOARM64 leak into CBUILD-tool builds — mirror as `BUILD_GO*` defaults and swap in via `local -x` inside tc-env_build, keyed on `has go-env ${INHERITED}`).
- **For a Rust cdylib, do not paper over missing SONAME / bad RPATH with QA_SONAME/QA_FLAGS_IGNORED: `patchelf --remove-rpath`, install as `libfoo.so.X.Y.Z` via newlib.so, create the symlinks by hand, and port the fix to the -9999 ebuild in the same series** (recurred 2x). Evidence: `13a7a9d` net-libs/quiche (RPATH pointed into bundled boringssl build dir); `0a4f9ef` (live ebuild had regressed to the old suppressions).
- **Unbundle C libraries from Rust builds through the -sys crate's env switch (`LIBSQLITE3_SYS_USE_PKG_CONFIG=1`, `RUSTONIG_SYSTEM_LIBONIG=1`, `LIBSSH2_SYS_USE_PKG_CONFIG=1`) plus the system lib in DEPEND; gate each such dep on the USE flag whose cargo feature actually pulls the -sys crate** (recurred 2x). Evidence: `a4b65a2` dev-lang/rust (cargo bundled its own sqlite); `abedd46` eza (unconditional openssl dep though openssl-sys only comes via the git feature).
- **With `RUST_NEEDS_LLVM=1` and pinned `LLVM_COMPAT`, cap `RUST_MAX_VER` at the newest Rust built against a supported LLVM slot** (recurred 2x). Evidence: `608f5b7` firefox ESR (portage picked a Rust newer than LLVM 20/21 allowed); same pin in `22504cd` thunderbird.
- **Generate crates.io SRC_URIs against `https://static.crates.io/crates/<name>/<name>-<version>.crate`, never the `crates.io/api/v1/.../download` endpoint (bans no-User-Agent fetchers; CDN URL also needs no arrow rename)**. Evidence: `3929f73` cargo.eclass.
- **Skip individual flaky/sandbox-hostile cargo tests with the `CARGO_SKIP_TESTS` array before `cargo_src_test`, not by patching tests out or disabling the suite**. Evidence: `f70e0b7` cargo.eclass (feature introduced to replace hand-built `--skip` lists).
- **Do not override cargo.eclass internals (ECARGO_VENDOR, cargo_home layout) unless the default demonstrably fails — stale overrides break when the eclass evolves**. Evidence: `3057358` vaultwarden (manual ECARGO_VENDOR + cargo_home mv deleted, `--offline` passed to cargo_src_compile instead).
- **After `doins -r` on a build-output tree, restore 0755 on shared objects and executables with fperms (or use dolib.so/dobin), and revbump — installed metadata changed**. Evidence: `03480a4` sci-ml/ollama (bundled llama libs installed 0644, runtime loading broke).
- **promu-built Prometheus exporters: patch .promu.yml to `cgo: true` / `static: false` to enforce dynamic linking; fetch upstream's prebuilt web-UI artifact via SRC_URI instead of rebuilding broken frontend toolchains** (recurred 2x). Evidence: `3bb3e84` blackbox_exporter; `fa0f1e6` alertmanager (web-ui tarball copied into `ui/app` in src_prepare).
- **Go/Make builds that embed a VCS commit for --version: pin the release tag's commit in an ebuild variable with an "update on bump" comment and pass it to the build; refresh every bump**. Evidence: `92ad322` runc (`RUNC_COMMIT=<sha>`, `emake COMMIT="${RUNC_COMMIT}"`).
- **go-module EAPI 9 moves compile-environment setup from src_unpack to src_configure — flag filtering done in src_configure now works; GO_OPTIONAL consumers must call both go-module_src_unpack and go-module_src_configure**. Evidence: `936180e` go-module.eclass.
- **Unbundle a C library vendored into a Go module by patching the vendored `#cgo` stanzas: drop hardcoded `-O2`/`-I../lib_src` flags, add `-l<name>`, RDEPEND on the system lib under the enabling USE flag, and export `CGO_CFLAGS`/`CGO_LDFLAGS` from user flags in src_configure; rm network-dependent `*_test.go` in src_prepare**. Evidence: `0f9afab` www-apps/hugo (vendored libsass with hardcoded -O2 replaced by system dev-libs/libsass:=).
- **Package daemons with full plumbing, not just the binary: acct-user/acct-group deps, both OpenRC (supervise-daemon) and systemd units, `SupplementaryGroups=render video` when the service touches the GPU, and keepdir+fperms+fowners for log/state dirs in pkg_preinst**. Evidence: `6227a39` sci-ml/ollama (bug 978721: binary-only install left users hand-rolling service setup).
- **rustbuild link failure `-lgcc_s not found` on a pure-LLVM cross toolchain: switch the unwinder — `llvm-libunwind = "in-tree"` in the bootstrap.toml target section behind an `llvm-libunwind` USE flag — instead of chasing libgcc_s**. Evidence: `3b85398` sys-devel/rust-std.
- **rust-std/rustbuild for a musl CTARGET needs `musl-root = "/usr/${CTARGET}/usr"` (the crossdev sysroot) in bootstrap.toml alongside `crt-static = false`, or bootstrap sanity checks panic**. Evidence: `afd1b2d` sys-devel/rust-std.
- **Never hand-roll cross-category/CTARGET detection (parsing CATEGORY, comparing CHOST/CTARGET); inherit crossdev.eclass and use `is_crosspkg`/`target_is_not_host` so both `cross-*` and `cross_llvm-*` categories work**. Evidence: `336ae58` sys-devel/rust-std (hand-rolled is_cross() rejected legitimate cross_llvm-* builds in pkg_pretend).
- **When an eclass keeps a version-to-dependency registry (rust.eclass `_RUST_LLVM_MAP`, `_RUST_SLOTS_ORDERED`), every version bump must update the registry in the same commit as the new ebuild, preserving newest-first ordering**. Evidence: `d7de2b9` dev-lang/rust (1.96.1 invisible to rust_pkg_setup/LLVM dep generation until both maps updated).
- **When shipping an upstream example config that references bare relative paths, patch them to `@GENTOO_PORTAGE_EPREFIX@`-prefixed absolute paths, inherit prefix, and `eprefixify` before newins; refresh the patch every bump and keep -9999 in sync**. Evidence: `4d79cc0` net-dns/dnscrypt-proxy (cache/resolver files broke when the daemon ran from another cwd or under Prefix).
- **Rename bash completions installed with an extension (`foo.bash`) to the bare command name (patch the Makefile or use newbashcomp) — bash-completion only loads files named exactly after the command — and revbump since installed filenames change**. Evidence: `66c8510` sys-apps/uutils-coreutils.
- **To scope an environment-mutating setup function to a single command, wrap it in a function declaring every touched variable with `local -I` (inherit current value, restore on return) before calling the setup**. Evidence: `728061f` go-env.eclass (`go-env_run` applies go-env_set_compile_environment to one command without polluting the rest of the phase).
- **Behavior-changing eclass defaults land only for the new EAPI (`case ${EAPI} in 7|8) : ;; *) new-default ;; esac`) and stay overridable via `${VAR:-default}`**. Evidence: `9eabd85` go-env.eclass (CGO_ENABLED=1 default — Go silently disables cgo when cross-compiling, losing the libc/NSS resolver — gated to EAPI 9+ so existing ebuilds keep old behavior).

## Idioms

Go toolchain floor from go.mod (`bbdf70d`):
```bash
BDEPEND="
	>=dev-lang/go-1.25.0
	dev-go/go-md2man
"
```

MSRV pin, set before inherit (`a8b8dd1`):
```bash
RUST_MIN_VER=1.85.0
inherit cargo distutils-r1
```

Cross-safe completion generation with content validation (`b82b853`, `0a40502`):
```bash
if ! tc-is-cross-compiler; then
	# generator exits 0/1 unreliably; validate content instead
	./rdap --completion-script-bash > rdap.bash
	grep -q "complete -F" rdap.bash || die "bash completion script is invalid"
else
	ewarn "Shell completion files not installed!"
fi
```

Optional cargo inside a meson build (`71bcb06`):
```bash
CARGO_OPTIONAL=1
inherit cargo meson
src_unpack() { default; use rust && cargo_gen_config; }
src_compile() {
	if use rust; then cargo_env meson_src_compile; else meson_src_compile; fi
}
```

Skipping individual cargo tests (`f70e0b7`):
```bash
src_test() {
	local CARGO_SKIP_TESTS=(
		tests::filesystem
		tests::network
	)
	cargo_src_test --no-fail-fast
}
```

PyO3 forward compatibility for new CPython (`793c804`):
```bash
# allow PyO3 to build against Python newer than its declared max
export PYO3_USE_ABI3_FORWARD_COMPATIBILITY=1
```

Vendor tarball as second SRC_URI entry (`eb616d7`):
```bash
SRC_URI="https://github.com/juanfont/headscale/archive/v${PV}.tar.gz -> ${P}.tar.gz"
SRC_URI+=" https://github.com/gentoo-golang-dist/${PN}/releases/download/v${PV}/${P}-vendor.tar.xz"
```

Rust cdylib installed properly instead of QA suppression (`13a7a9d`):
```bash
patchelf --remove-rpath "$(cargo_target_dir)"/libquiche.so || die
newlib.so "$(cargo_target_dir)"/libquiche.so libquiche.so.0.0.0
ln -s libquiche.so.0.0.0 "${ED}"/usr/$(get_libdir)/libquiche.so.0 || die
ln -s libquiche.so.0 "${ED}"/usr/$(get_libdir)/libquiche.so || die
```

Unbundling via -sys crate env switches (`a4b65a2`):
```bash
export RUSTONIG_SYSTEM_LIBONIG=1
export LIBSQLITE3_SYS_USE_PKG_CONFIG=1
DEPEND="dev-db/sqlite:3"
```

Explicit src_unpack when cargo + pypi both export it (`b16b5e3`):
```bash
src_unpack() {
	pypi_src_unpack
	cargo_gen_config
}
```

Unbundling a C lib from vendored Go cgo directives (`0f9afab`):
```diff
-// #cgo CFLAGS: -O2 -fPIC
+// #cgo CFLAGS: -fPIC
-// #cgo CPPFLAGS: -I../../libsass_src/include
+// #cgo CPPFLAGS: -DUSE_LIBSASS_SRC
-// #cgo LDFLAGS: -lstdc++ -lm
+// #cgo LDFLAGS: -lstdc++ -lm -lsass
```

rustbuild cross target config in bootstrap.toml (`afd1b2d`, `3b85398`):
```bash
if use elibc_musl; then
	cat <<- _EOF_ >> "${S}"/bootstrap.toml
		crt-static = false
		musl-root = "/usr/${CTARGET}/usr"
	_EOF_
fi
cat <<- EOF >> "${S}"/bootstrap.toml
	llvm-libunwind = "$(usex llvm-libunwind in-tree no)"
EOF
```

Scoped env mutation with `local -I` (`728061f`):
```bash
go-env_run() {
	local -I AR CC CXX FC PKG_CONFIG \
		GO{FLAGS,MAXPROCS,ARCH,OS,386,ARM,MIPS,MIPS64} \
		CGO_{CFLAGS,CPPFLAGS,CXXFLAGS,LDFLAGS}
	go-env_set_compile_environment
	"${@}"
}
```

Owned daemon log dir + units (`6227a39`):
```bash
newinitd "${FILESDIR}/ollama.init" "${PN}"
newconfd "${FILESDIR}/ollama.confd" "${PN}"
systemd_dounit "${FILESDIR}/ollama.service"   # SupplementaryGroups=render video
pkg_preinst() {
	keepdir /var/log/ollama
	fperms 750 /var/log/ollama
	fowners "${PN}:${PN}" /var/log/ollama
}
```

## Automatable checks

- **go.mod floor vs BDEPEND**: for each go-module ebuild, extract `go X.Y.Z` (and `toolchain`) from the release's go.mod and compare against the highest `>=dev-lang/go-*` atom in BDEPEND; go.mod version > BDEPEND floor (or no dev-lang/go atom at all) = violation. Evidence: `bbdf70d`, `2e08677`.
- **RUST_MIN_VER vs Cargo.toml**: parse `rust-version` from the unpacked release's Cargo.toml (max across workspace members and vendored crates) and compare with the ebuild's `RUST_MIN_VER`; Cargo.toml > RUST_MIN_VER (or RUST_MIN_VER absent on a cargo ebuild) = violation. Evidence: `6ca2ba0`, `a8b8dd1`.
- **Legacy crates.io API URLs**: `grep -r 'crates.io/api/v1/crates' --include='*.ebuild' --include='*.eclass'`; any hit = violation (must be static.crates.io). Evidence: `3929f73`.
- **Global-scope herestrings/heredocs**: grep eclass/ebuild code outside phase functions for `<<<` and `<<`; any hit in code reachable at metadata-generation time = violation. Evidence: `b982445`, `088ecc1`.
- **Pre-strip flags in Go builds**: grep ebuilds and applied patches for `-ldflags` strings containing `-s` (or `ldflags.*"-s`); pre-stripped output triggers strip/splitdebug QA = violation unless patched out. Evidence: `6b2d63e`, `274a8bc`.
- **cargo/go binaries without QA whitelisting**: ebuild inherits cargo (or go-module) and installs ELF binaries but sets neither `QA_FLAGS_IGNORED` nor `QA_PREBUILT` = warning candidate (will trip the CFLAGS-recording QA notice). Evidence: `92ddcc7`, `0a40502`.
- **Executing built binaries un-guarded**: in src_compile/src_install, invocation of a path under `${S}`/`${WORKDIR}`/`bin/` (typically `completion`, `--version`, man generation) in a file with no `tc-is-cross-compiler` occurrence = violation. Evidence: `b82b853`, `0a40502`.
- **Stale deps/vendor tarball**: SRC_URI entries matching `*-deps.tar.*` or `*-vendor.tar.*` whose embedded version differs from `${PV}` = violation (old tarball reused across bump). Evidence: `0ea353d`.
- **cargo + second src_unpack-exporting eclass**: ebuild inherits cargo together with pypi/kde.org (or any eclass exporting src_unpack) but defines no explicit `src_unpack()` = violation. Evidence: `b16b5e3`.
- **RUST_NEEDS_LLVM without RUST_MAX_VER**: ebuild sets `RUST_NEEDS_LLVM=1` and a bounded `LLVM_COMPAT` but no `RUST_MAX_VER` = warning (new Rust releases will outrun the LLVM pin). Evidence: `608f5b7`.
- **ECARGO_VENDOR overrides**: `grep -r '^ECARGO_VENDOR=' --include='*.ebuild'`; any hit = violation (eclass-internal, breaks on eclass evolution). Evidence: `3057358`.
- **doins -r over ELF trees**: `doins -r` in src_install on a directory containing `.so`/executables with no subsequent `fperms 0755` (or dolib.so/dobin) in the ebuild = warning. Evidence: `03480a4`.
- **rust.eclass registry lockstep**: for every new dev-lang/rust ebuild version, assert the version appears in both `_RUST_LLVM_MAP` and `_RUST_SLOTS_ORDERED` in rust.eclass in the same commit; missing from either = violation. Evidence: `d7de2b9`.
- **Bash completions with extensions**: installed files under `/usr/share/bash-completion/completions/` whose name carries a suffix (`.bash`, `.sh`) = violation (bash-completion never loads them). Evidence: `66c8510`.
