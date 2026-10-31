/**
 * Source purity guard — ensures the plugin has no runtime dependency on
 * private OrgSDK packages and that @orgsdk/plugins is imported type-only.
 *
 * The public authoring SDK (@orgsdk/plugins) is permitted as a dev-only,
 * type-only import — it ships types, not runtime code. All other
 * @orgsdk/* or orgsdk/* specifiers are forbidden (they would couple the
 * plugin to private daemon/platform/storage internals).
 *
 * google-tasks is multi-file (index → google-tasks-functions, oauth,
 * first-party-client) using sibling (`./`) imports. Those are intra-plugin
 * and allowed; only parent (`../`) and cross-plugin imports are blocked.
 *
 * google-tasks's runtime dependencies are `@googleapis/tasks`
 * (google-tasks-functions.ts constructs a tasks_v1.Tasks client) and
 * `google-auth-library` (oauth.ts constructs an OAuth2Client). oauth.ts +
 * first-party-client.ts are byte-identical self-contained duplicates of the
 * google-sheets plugin's leaf modules — cloud-mode plugins must be
 * self-contained because the materialiser blocks cross-plugin sibling
 * imports. No other runtime package may be introduced.
 */
import { describe, expect, it } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const PLUGIN_DIR = resolve(import.meta.dir, "..", "plugin");

/** Any import from a private @orgsdk/* or orgsdk/* package. */
const FORBIDDEN_SPECIFIER =
	/(?:^|\n)\s*import\b[^;]*?from\s+["']((?:@orgsdk\/|orgsdk\/)[^"']+)["']/g;

/**
 * A value (non-type) import from @orgsdk/plugins — forbidden because the
 * SDK is dev-only; the runtime artifact must not depend on it.
 */
const SDK_VALUE_IMPORT =
	/(?:^|\n)\s*import\s+(?!type\b)\{[^}]*\}\s+from\s+["']@orgsdk\/plugins["']/;

async function collectTsFiles(dir: string): Promise<string[]> {
	const out: string[] = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const abs = join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...(await collectTsFiles(abs)));
		} else if (entry.isFile() && entry.name.endsWith(".ts")) {
			out.push(abs);
		}
	}
	return out;
}

describe("source purity", () => {
	it("no plugin source imports a private @orgsdk/* or orgsdk/* package", async () => {
		const files = await collectTsFiles(PLUGIN_DIR);
		expect(files.length).toBeGreaterThan(0);

		const offenders: Array<{ file: string; specifier: string }> = [];
		for (const file of files) {
			const src = await readFile(file, "utf-8");
			for (const match of src.matchAll(FORBIDDEN_SPECIFIER)) {
				const spec = match[1];
				// Allow @orgsdk/plugins (checked separately below).
				if (spec === "@orgsdk/plugins" || spec.startsWith("@orgsdk/plugins/")) {
					continue;
				}
				offenders.push({
					file: relative(PLUGIN_DIR, file),
					specifier: spec,
				});
			}
		}

		expect(offenders).toEqual([]);
	});

	it("@orgsdk/plugins is imported type-only everywhere (no runtime value imports)", async () => {
		const files = await collectTsFiles(PLUGIN_DIR);
		const offenders: string[] = [];

		for (const file of files) {
			const src = await readFile(file, "utf-8");
			if (SDK_VALUE_IMPORT.test(src)) {
				offenders.push(relative(PLUGIN_DIR, file));
			}
		}

		expect(offenders).toEqual([]);
	});

	it("no cross-plugin or relative parent imports (only sibling ./ allowed)", async () => {
		const files = await collectTsFiles(PLUGIN_DIR);
		const offenders: string[] = [];

		for (const file of files) {
			const src = await readFile(file, "utf-8");
			const parentImport = /from\s+["']\.\.[/"']/;
			if (parentImport.test(src)) {
				offenders.push(relative(PLUGIN_DIR, file));
			}
		}

		expect(offenders).toEqual([]);
	});

	it("google-tasks-functions.ts imports tasks_v1 from @googleapis/tasks (positive dep assertion)", async () => {
		const src = await readFile(
			join(PLUGIN_DIR, "google-tasks-functions.ts"),
			"utf-8",
		);
		expect(src).toMatch(/from\s+["']@googleapis\/tasks["']/);
		expect(src).toMatch(/\btasks_v1\b/);
	});

	it("oauth.ts imports OAuth2Client from google-auth-library (positive dep assertion)", async () => {
		const src = await readFile(join(PLUGIN_DIR, "oauth.ts"), "utf-8");
		expect(src).toMatch(/from\s+["']google-auth-library["']/);
		expect(src).toMatch(/\bOAuth2Client\b/);
	});

	it("package.json declares @googleapis/tasks + google-auth-library as the only runtime deps", async () => {
		const pkg = JSON.parse(
			await readFile(resolve(import.meta.dir, "..", "package.json"), "utf-8"),
		) as Record<string, unknown>;
		const deps = pkg.dependencies as Record<string, string> | undefined;
		expect(deps).toBeDefined();
		expect(deps?.["@googleapis/tasks"]).toBe("17.1.0");
		expect(deps?.["google-auth-library"]).toBe("11.3.2");
		expect(Object.keys(deps ?? {}).sort()).toEqual([
			"@googleapis/tasks",
			"google-auth-library",
		]);
		// @orgsdk/plugins must be dev-only, never runtime.
		expect(deps?.["@orgsdk/plugins"]).toBeUndefined();
	});
});
