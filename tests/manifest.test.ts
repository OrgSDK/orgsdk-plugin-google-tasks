import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const MANIFEST_PATH = resolve(import.meta.dir, "..", "plugin", ".plugin.json");

async function readManifest() {
	const raw = await readFile(MANIFEST_PATH, "utf-8");
	return JSON.parse(raw) as Record<string, unknown>;
}

describe("manifest", () => {
	it("has the expected slug (name)", async () => {
		const m = await readManifest();
		expect(m.name).toBe("google-tasks");
	});

	it("has the bumped version 1.0.2", async () => {
		const m = await readManifest();
		expect(m.version).toBe("1.0.2");
	});

	it("declares the canonical $schema", async () => {
		const m = await readManifest();
		expect(m.$schema).toBe("https://orgsdk.ai/schemas/plugin-manifest.v1.json");
	});

	it("has a non-empty description", async () => {
		const m = await readManifest();
		expect(typeof m.description).toBe("string");
		expect((m.description as string).length).toBeGreaterThan(0);
	});

	it("declares entry as index.ts", async () => {
		const m = await readManifest();
		expect(m.entry).toBe("index.ts");
	});

	it("declares oauth2 auth with the shared google-oauth provider key", async () => {
		const m = await readManifest();
		const auth = m.auth as Record<string, unknown>;
		expect(auth.type).toBe("oauth2");
		expect(auth.provider).toBe("google-oauth");
		expect(typeof auth.label).toBe("string");
		expect((auth.label as string).length).toBeGreaterThan(0);
		expect(typeof auth.hint).toBe("string");
		expect((auth.hint as string).length).toBeGreaterThan(0);
	});

	it("declares the Google Tasks sensitive scope", async () => {
		const m = await readManifest();
		const auth = m.auth as Record<string, unknown>;
		expect(auth.scopes).toEqual(["https://www.googleapis.com/auth/tasks"]);
	});

	// google-tasks is functions-only: it consumes the shared google-oauth
	// credential but does NOT own the OAuth connect flow. The manifest must not
	// declare a callbackPath — google-sheets owns the redirect/callback.
	it("declares no callbackPath (functions-only, no OAuth connect flow)", async () => {
		const m = await readManifest();
		const auth = m.auth as Record<string, unknown>;
		expect(auth.callbackPath).toBeUndefined();
	});

	// google-tasks must NOT declare its own setupGuide. The connection guide
	// is owned by google-sheets (the connect owner). A second guide here would
	// duplicate the Google Cloud checklist and request a second OAuth client,
	// contradicting the shared-credential contract. Users who need BYO connect
	// via google-sheets.
	it("does NOT declare a setupGuide (owned by google-sheets)", async () => {
		const m = await readManifest();
		const auth = m.auth as Record<string, unknown>;
		expect(auth.setupGuide).toBeUndefined();
	});

	it("declares marketplace metadata with the source-repo provenance link", async () => {
		const m = await readManifest();
		const mp = m.marketplace as Record<string, unknown>;
		expect(mp.displayName).toBe("Google Tasks");
		expect(mp.group).toBe("google");
		expect(mp.category).toBe("Productivity");
		expect(Array.isArray(mp.tags)).toBe(true);
		expect(mp.tagline).toBeDefined();
		expect(Array.isArray(mp.useCases)).toBe(true);
		expect(typeof mp.permissionsSummary).toBe("string");
		const links = mp.links as Record<string, string>;
		expect(links.sourceRepo).toBe(
			"https://github.com/OrgSDK/orgsdk-plugin-google-tasks",
		);
		expect(links.homepage).toBe("https://support.google.com/tasks");
		expect(links.docs).toBe(
			"https://developers.google.com/tasks/reference/rest",
		);
	});
});
