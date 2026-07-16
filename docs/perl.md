# Perl ecosystem packaging lessons (mined from gentoo/gentoo)

Distilled from 13 mined lesson records — thin coverage compared to the python/rust docs, so treat as seed rules, not exhaustive. Evidence is dominated by the perl-5.44 rollout (ExtUtils::ParseXS 3.58 XS breakage across old packages), plus perl-module.eclass DIST_VERSION mapping, virtual/perl-* dependency bookkeeping, and MakeMaker install-manifest ordering. Shas refer to the gentoo/gentoo repo.

## Rules

- **A perl major bump breaking a long-stable XS package is almost never the package's "fault": suspect the new ExtUtils::ParseXS or new perl API surface. Fix with a small FILESDIR source patch appended to PATCHES — never pin old perl — and check Debian and rt.cpan.org for an existing patch before writing one.** (5) - evidence: 10cf906 dev-perl/Wx (Debian/ntyni patch reused via rt.cpan.org); 3d11ab4 dev-perl/X-Osd (one-line typo patch + revbump); d9a451a net-irc/atheme-services (upstream one-liner backported; non-dev-perl consumers break too).
- **Known ParseXS >=3.58 (perl 5.44) breakage signatures, each with a canonical fix:** (4)
  - `unrecognised line: #include ... (truncated XSUB definition?)` → insert a blank line between the `MODULE = ... PACKAGE = ...` line and any following preprocessor directive. - evidence: d9a451a net-irc/atheme-services.
  - Latent XS keyword typos now hard errors (e.g. `PROTOTYPES: DISABLES`) → fix the keyword. - evidence: 3d11ab4 dev-perl/X-Osd.
  - `INCLUDE:` processing order changed → missing-type/declaration errors in .xs/.xsp files; make every XS file explicitly `#include` what it uses. - evidence: 10cf906 dev-perl/Wx.
  - The `length(param)` pseudo-parameter feature was dropped → rewrite the XSUB to take a plain `SV*` and derive buffer+length via SvPV/SvPVutf8. - evidence: 50626fc dev-perl/Gtk2.
- **New perl releases also add public API names that collide with packages' private symbols via embed.h macros (perl 5.43.2+ made `atfork_child` a macro for Perl_atfork_child): `#undef` the macro, rename the local symbol with a package prefix, update call sites, and report upstream.** - evidence: 60b2a32 dev-perl/BDB.
- **Revbump policy for these patches: revbump when the patch changes generated/installed code (installed systems must rebuild); a compile-only unbreak with identical output can be added to the existing revision in place.** - evidence: 3d11ab4 dev-perl/X-Osd (-r3 → -r4); 60b2a32 dev-perl/BDB (patched -r1 in place).
- **CPAN float versions are normalized into Gentoo dotted PVs (0.08 → 0.80.0, 1.03 → 1.30.0). On every dev-perl bump: name the ebuild with the normalized PV, set DIST_VERSION to the literal upstream version and DIST_AUTHOR to the CPAN uploader before `inherit perl-module` — never assume PV matches the tarball. Audit dep floors (what the new release requires) in the same commit; test-only deps go in `BDEPEND` inside `test? ( )`.** (2) - evidence: aa70e3d dev-perl/Feature-Compat-Class (0.08 → 0.80.0, Object-Pad floor bumped alongside); e58a386 dev-perl/Module-CPANTS-Analyse (1.03 → 1.30.0).
- **To pin a virtual (or anything) to one upstream version while accepting ebuild revisions, use `~cat/pkg-ver`, never `=cat/pkg-ver` without a trailing `*` — the bare `=` stops matching on the first -rN revbump of the target.** - evidence: c47e4ff virtual/perl-IO-Compress (`=dev-lang/perl-5.44.0_rc1` broke on perl -r1).
- **Never trust `${PV}`-based cross-package deps for "kept in step" module families (IO-Compress ↔ Compress-Raw-*): upstream sometimes skips a release for one sibling, leaving an unsatisfiable `>=` dep. Verify the sibling version exists in-tree right after the bump; hardcode the real version when they diverge.** - evidence: 82b7f1a virtual/perl-IO-Compress (required Compress-Raw-Zlib 2.223.0, upstream only released 2.222).
- **Each perl release/RC is a bookkeeping sweep: sync virtual/perl-* provider ranges (`=dev-lang/perl-5.XX*`) to the perl that actually bundles that module version, and sync dev-lang/perl's src_remove_dual dual-life version table to the bundled versions.** (2) - evidence: 28d0a38 virtual/perl-Compress-Raw-Bzip2; 2975fe9 dev-lang/perl (5.44.0-RC1 table sync).
- **ExtUtils::MakeMaker enumerates installable files when Makefile.PL runs (perl-module_src_configure): any generated .pm must exist before that point or `make install` silently skips it — no error, file just missing. Generate in src_configure ahead of perl-module_src_configure, comment the ordering constraint, revbump (installed files change).** - evidence: f130436 net-print/foomatic-db-engine (Defaults.pm silently dropped for years, bugs 819276/914352).
- **When upstream's make install puts a config template into /etc, divert it to /usr/share/doc/${PF} via a make-variable override (`sysconfdir=`), `docompress -x` it so "cp the template" instructions keep working, patch any hardcoded /etc template path, and elog the copy instructions.** - evidence: 76f3303 app-backup/rsnapshot.

## Idioms

dev-perl bump header — raw CPAN version vs normalized PV:
```bash
DIST_AUTHOR=PEVANS
DIST_VERSION=0.08   # upstream CPAN version; ebuild file is ${PN}-0.80.0.ebuild
inherit perl-module
```

Virtual pinned to one upstream version, revision-proof:
```bash
RDEPEND="|| ( ~dev-lang/perl-5.44.0_rc1 ~perl-core/${PN#perl-}-${PV} )"
```

Generated files before the MakeMaker manifest is written:
```bash
src_configure() {
	default
	# Must precede perl-module_src_configure or Defaults.pm
	# is missing from the generated Makefile and never installed.
	emake defaults
	cd lib || die
	perl-module_src_configure
}
```

ParseXS 3.58 blank-line fix (MODULE line must not touch a preprocessor line):
```diff
 MODULE = Atheme			PACKAGE = Atheme::ChanServ::Config
+
 #include "../../../chanserv/chanserv.h"
```

New-perl macro colliding with a private symbol:
```c
/* Perl 5.43.2+ defines atfork_child as a macro for Perl_atfork_child. */
#undef atfork_child
static void bdb_atfork_child (void)   /* was: atfork_child */
```

Config template diverted out of /etc, uncompressed:
```bash
src_install() {
	docompress -x "/usr/share/doc/${PF}/rsnapshot.conf.default"
	emake install DESTDIR="${D}" sysconfdir="${EPREFIX}/usr/share/doc/${PF}"
}
```

## Automatable checks

- **Bare `=` pin on dev-lang/perl**: grep ebuilds for `=dev-lang/perl-[0-9]` where the atom has no trailing `*` and is not `~`-prefixed -> breaks on the first perl revbump. Evidence: c47e4ff.
- **DIST_VERSION/PV mismatch**: for every dev-perl ebuild, apply the eclass's CPAN version normalization to DIST_VERSION (or to PV's expected inverse) and require normalize(DIST_VERSION) == PV; a dev-perl ebuild whose PV can't round-trip and that lacks DIST_VERSION is a broken SRC_URI. Evidence: aa70e3d, e58a386.
- **Unsatisfiable sibling dep after bump**: after bumping any virtual/perl-* or dev-perl in a lockstep family, resolve every `>=`/`=` dep it declares against in-tree versions; any atom with no matching version is a violation (`${PV}` shortcuts are the usual culprit). Evidence: 82b7f1a.
- **XS keyword lint (ParseXS 3.58 pre-flight)**: in unpacked sources, grep `.xs` files for `^PROTOTYPES:` followed by anything other than `ENABLE`/`DISABLE` -> hard error on perl 5.44. Evidence: 3d11ab4.
- **MODULE line adjacent to preprocessor**: in `.xs` files, a line matching `^MODULE *=` immediately followed (no blank line) by a line starting with `#` -> "truncated XSUB definition" error on perl 5.44. Evidence: d9a451a.
- **length() pseudo-parameter**: grep `.xs` XSUB signatures for `length([A-Za-z_]` -> feature removed in ParseXS shipped with perl 5.44, will not compile. Evidence: 50626fc.
