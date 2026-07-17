import type {
	PluginContext,
	PluginFactory,
	PluginModule,
} from "@orgsdk/plugins";
import { safeFunctions as tasksFns } from "./google-tasks-functions";

// google-tasks is a functions-only plugin: it consumes the shared
// `google-oauth` credential but does not own the OAuth connect flow. The
// "Connect Google" button lives on the google-sheets plugin (which registers
// the auth provider); both plugins read the same `google-oauth/<name>` token.
// See docs/plan-first-party-oauth.md.
const createPlugin: PluginFactory = (ctx: PluginContext): PluginModule => {
	return {
		safeFunctions: [...tasksFns],
		async onLoad() {
			const cred = await ctx.stores.credential.get("google-oauth", "default");
			if (!cred) {
				ctx.logger.warn(
					"[google-tasks] No google-oauth credential found. Connect Google via the google-sheets plugin (Credentials tab).",
				);
			}
		},
	};
};

export default createPlugin;
