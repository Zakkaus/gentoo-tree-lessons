# Java packaging lessons (java-pkg-2, java-pkg-simple, junit5, eant, JDK dep ranges, maven-built projects)

Distilled from gentoo/gentoo commits (2025-2026 window). Covers dev-java ebuild QA: enabling test suites under java-pkg-simple/junit5, JDK 17+ JPMS breakage, ant offline builds, replicating Maven build side effects by hand, log4j 1.x migration, and JDK version-range dependencies. Shas refer to the gentoo/gentoo repo. Coverage note: 19 records, heavily weighted toward the dev-java test-enablement push (commons-* family); gradle and maven-bin builds are unrepresented — the only "maven artifact" datapoint is packaging a Maven multi-module project with java-pkg-simple (`dbf04b0`).

## Rules

- **Tests failing on JDK 17+ with reflective-access errors: probe the active JVM with `java-config -g PROVIDES_VERSION` and add `--add-opens=java.base/...=ALL-UNNAMED` to `JAVA_TEST_EXTRA_ARGS` only when `ver_test` >= 17 — never hardcode the flags** (recurred 3x). Evidence: `f93b836` dev-java/assertj-core; also `34e121c` commons-beanutils, `a40725d` commons-beanutils (probe moved into src_test).
- **Never list another package's test sources in `JAVA_TEST_SRC_DIR` just to get them compiled — eclass fixes will eventually execute whatever you list. Compile them into a helper jar in src_test (override `JAVA_JAR_FILENAME`/`JAVA_SRC_DIR`, call `java-pkg-simple_src_compile`, append to `JAVA_GENTOO_CLASSPATH_EXTRA`) and reset the overrides in src_install so the helper jar is not installed** (recurred 2x). Evidence: `8bc879a` commons-beanutils (junit5.eclass bugfix b1cc32e started running the foreign tests); `34e121c` commons-beanutils (original helper-jar pattern).
- **Test-only distfiles (auxiliary source trees, large test-vector repos) go in `test? ( ... )` SRC_URI with a use-test-guarded custom src_unpack; declare heavy test resource needs via check-reqs called from pkg_pretend+pkg_setup only under USE=test, and feed `-Xmx${CHECKREQS_MEMORY}` to `JAVA_TEST_EXTRA_ARGS`** (recurred 2x). Evidence: `ea27b91` dev-java/bcprov (~3 GB test-data tarball, 2 GB heap); `34e121c` commons-beanutils (second tarball of foreign test sources).
- **Put test-only preparation (eapply to auxiliary trees, test-data copies, JVM probing, LC_ALL exports) in src_test, not use-test-guarded src_prepare — the phase only runs under FEATURES=test so the guards disappear.** Evidence: `a40725d` dev-java/commons-beanutils.
- **When java-pkg-simple/junit test discovery executes helper/abstract classes as tests, replicate upstream's surefire include/exclude list: `find` over src/test/java into `JAVA_TEST_RUN_ONLY`, convert paths to class names, cite the pom.xml lines in a comment.** Evidence: `e66d638` dev-java/commons-digester (Abstract*, TestBean, TestRule* ran as tests).
- **Tests that genuinely need unpackaged deps: `RESTRICT=test` with a comment block enumerating every missing package, so the restriction is auditable and reversible.** Evidence: `f93b836` dev-java/assertj-core (spring, hibernate, testkit missing).
- **ant-built packages: force offline builds with `eant -Doffline=true -Dno.resolve=true -Dgentoo.classpath=$(java-pkg_getjars ...)`; neutralize network-dependent tests by patching in `@Ignore` (one FILESDIR patch per class, failure log quoted in the patch header) rather than restricting the whole suite; `java-pkg_clean` bundled jars with `! -path` exceptions for jars tests need.** Evidence: `2ac61de` dev-java/ant-ivy.
- **Conditional ant targets: one invocation with `$(usev flag target)`, not a second `use flag && eant ...` run** (recurred 3x). Evidence: `5278d04` www-servers/tomcat; also `3f94830` tomcat 10.1.x, `15f537c` tomcat 11.0.x.
- **Packaging a Maven project with java-pkg-simple means reproducing Maven's side effects by hand: (1) write META-INF/services provider files in src_prepare (derive contents from `grep -nr '@ServiceProvider'`); (2) run annotation processors via a second `java-pkg-simple_src_compile` pass with `JAVAC_ARGS="-processorpath ... -processor ..."`; (3) rebuild Multi-Release jar layout (META-INF/versions/N + `Multi-Release: true` manifest) to match upstream's assembly; pin same-project sibling modules with `~dev-java/foo-${PV}` in CP_DEPEND.** Evidence: `dbf04b0` dev-java/log4j-core (CVE bump).
- **Packages that only compile against log4j 1.x APIs: satisfy with `dev-java/log4j-12-api` as a build-only dep — DEPEND (not CP_DEPEND/RDEPEND) plus `java-pkg_jar-from --build-only` into the ant lib dir — keeping the runtime classpath minimal** (recurred 2x). Evidence: `424b743` dev-java/c3p0; also `c5fe235` commons-validator (log4j-12-api via `java-pkg_getjars --build-only`).
- **Optional Java deps: gate behind a USE flag propagated with `[flag=]` USE deps down the consumer chain, inject jars via `java-pkg_getjars` into `JAVA_GENTOO_CLASSPATH_EXTRA` in src_prepare; delete individual incompatible test sources with the compile error quoted in a comment instead of disabling the suite; and DEPEND on `dev-java/junit:5[-vintage]` when the vintage engine's conflicting 'junit' module breaks the build.** Evidence: `c5fe235` dev-java/commons-validator.
- **When a Java library revbump changes its provided classpath or dependency set, add `!<consumer-old-version` blockers in RDEPEND so portage upgrades reverse deps in lockstep — installed consumers reference dependency jars recorded in classpath metadata.** Evidence: `23c8b09` dev-java/mchange-commons (log4j 1.x -> 2 + shim broke c3p0, sleuthkit).
- **Dead-upstream package that cannot build under a new JDK: cap DEPEND with `<virtual/jdk-N:*` plus a bug-reference comment; keep RDEPEND on the old `>=virtual/jre` floor; revbump.** Evidence: `d643599` dev-java/gnu-regexp (JDK 26, bug 977086).
- **Never make DEPEND/BDEPEND conditional on environment variables or anything outside the ebuild+eclass text (`is-java-strict` reads JAVA_PKG_STRICT) — metadata is cached and must be deterministic; USE flags are the only sanctioned conditional.** Evidence: `3a2e787` eclass/java-utils-2 (conditional BDEPEND reverted).
- **When feeding globbed files to a strict binary-format tool (jdeps over `*.class`), validate each file's magic bytes (cafebabe) first and skip mismatches with eqawarn — extension matching is not type validation and the tool dies on fakes.** Evidence: `34b86e5` eclass/junit5 (test resources named *.class aborted jdeps).
- **Retiring an eclass: add a `# @DEPRECATED: <replacement|none>` eclassdoc tag, not just an announcement — pkgcheck only warns remaining consumers off the machine-readable tag.** Evidence: `ddff06e` eclass/java-osgi.eclass.
- **When a package referenced only via USE-conditional PDEPEND leaves the tree, drop the flag and the PDEPEND together, no revbump — the installed image is unchanged.** Evidence: `df39073` dev-java/openjdk:8 (dangling `javafx? ( dev-java/openjfx:8 )`).

## Idioms

JDK 17+ reflective access, gated (`f93b836`, `34e121c`):
```bash
local vm_version="$(java-config -g PROVIDES_VERSION)"
if ver_test "${vm_version}" -ge 17; then
	JAVA_TEST_EXTRA_ARGS+=( --add-opens=java.base/java.{io,lang,math,util}=ALL-UNNAMED )
fi
```

Foreign test sources as a helper jar, not JAVA_TEST_SRC_DIR (`8bc879a`):
```bash
src_test() {
	JAVA_JAR_FILENAME="acc.jar"
	JAVA_SRC_DIR=( ../"${ACC}"-src/src/test )
	java-pkg-simple_src_compile
	JAVA_GENTOO_CLASSPATH_EXTRA+=":acc.jar"
	junit5_src_test
}
# src_install: reset JAVA_JAR_FILENAME/JAVA_SRC_DIR to the real values
```

Surefire excludes replicated into JAVA_TEST_RUN_ONLY (`e66d638`):
```bash
pushd src/test/java || die
	local JAVA_TEST_RUN_ONLY=$(find * \
		! -name "Abstract*.java" ! -name "TestBean.java" \
		-name "*TestCase.java" -o -name "*Test.java")
	JAVA_TEST_RUN_ONLY="${JAVA_TEST_RUN_ONLY//.java}"
	JAVA_TEST_RUN_ONLY="${JAVA_TEST_RUN_ONLY//\//.}"
popd
```

Offline ant build with explicit classpath (`2ac61de`):
```bash
eant -f build.xml test \
	-Doffline=true -Dno.resolve=true \
	-Dgentoo.classpath=$(java-pkg_getjars --build-only "${libs}")
```

Conditional ant target via usev (`5278d04`):
```bash
src_compile() {
	LC_ALL=C eant deploy $(usev doc javadoc)
}
```

Build-only jar for compile-time-only deps (`424b743`):
```bash
DEPEND=">=dev-java/log4j-12-api-2.25.2:0 ..."
src_prepare() {
	java-pkg_clean
	java-pkg-2_src_prepare
	java-pkg_jar-from --build-only --into lib/ log4j-12-api
}
```

Test-only distfile, conditionally fetched and unpacked (`ea27b91`):
```bash
SRC_URI="...
	test? ( https://github.com/bcgit/bc-test-data/archive/${MY_PV}.tar.gz
		-> bc-test-data-${MY_PV}.tar.gz )"
src_unpack() {
	unpack bc-java-${MY_PV}.tar.gz
	use test && unpack bc-test-data-${MY_PV}.tar.gz
}
```

Annotation-processor second compile pass under java-pkg-simple (`dbf04b0`):
```bash
CP_DEPEND="... ~dev-java/log4j-api-${PV}:0 ..."
src_compile() {
	java-pkg-simple_src_compile
	JAVAC_ARGS=" -processorpath target/classes:$(java-pkg_getjars log4j-api) \
		-processor org.apache.logging.log4j.core.config.plugins.processor.PluginProcessor"
	java-pkg-simple_src_compile
}
```

JDK upper bound for dead upstream (`d643599`):
```bash
# max jdk 25 for bug #977086
DEPEND="
	${CDEPEND}
	<virtual/jdk-26:*
	source? ( app-arch/zip )"
```

## Automatable checks

- **Dangling USE-conditional dep targets**: for every `flag? ( cat/pkg:slot )` in PDEPEND/RDEPEND of dev-java ebuilds, verify the target package:slot still exists in the tree; missing target = violation (drop flag + dep together, no revbump). Evidence: `df39073`.
- **Env-conditional metadata**: grep eclasses/ebuilds for `DEPEND`/`BDEPEND` assignments inside global-scope conditionals that test environment state (`is-java-strict`, `[[ -n ${JAVA_PKG_*} ]]`); any hit = violation (metadata must be a pure function of the source). Evidence: `3a2e787`.
- **Deprecated eclass without tag**: an eclass announced as deprecated/obsolete whose eclassdoc header lacks `# @DEPRECATED:` = violation. Check: `grep -L '@DEPRECATED' <retired eclasses>`. Evidence: `ddff06e`.
- **Double build-tool invocation for optional targets**: in src_compile, `use X && eant` (or a second `eant`/`emake` guarded by `use`) following an unconditional invocation = violation; collapse with `$(usev ...)`. Check: `grep -A3 'eant' *.ebuild | grep 'use .* && eant'`. Evidence: `5278d04` (+2 siblings).
- **Extension-glob into strict tools**: eclass/ebuild code piping `-name '*.class'` finds into jdeps (or any classfile consumer) without a cafebabe magic-byte filter = violation. Evidence: `34b86e5`.
- **Foreign paths in JAVA_TEST_SRC_DIR**: `JAVA_TEST_SRC_DIR` entries containing `../` (pointing outside `${S}`) = violation (compile into a helper jar instead). Check: `grep 'JAVA_TEST_SRC_DIR.*\.\./' *.ebuild`. Evidence: `8bc879a`.
- **Hardcoded --add-opens**: `--add-opens` in `JAVA_TEST_EXTRA_ARGS` with no `PROVIDES_VERSION`/`ver_test` probe in the same ebuild = warning (breaks or misleads on older JVMs). Evidence: `f93b836`.
- **RESTRICT=test without justification**: dev-java ebuild with `RESTRICT="test"` and no adjacent comment naming missing packages = warning. Evidence: `f93b836`.
