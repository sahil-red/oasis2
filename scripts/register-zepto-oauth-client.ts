/**
 * One-time Zepto MCP OAuth client registration (dynamic client registration).
 *
 *   pnpm zepto:oauth:register
 *
 * Add the printed ZEPTO_OAUTH_CLIENT_ID to .env.local (and production env).
 */
import { registerZeptoOAuthClient, zeptoRedirectUri } from "@/lib/zepto/oauth";

async function main() {
  const redirectUri = zeptoRedirectUri();
  console.log(`Registering Scout OAuth client for redirect:\n  ${redirectUri}\n`);

  const { client_id } = await registerZeptoOAuthClient(redirectUri);

  console.log("Success. Add to .env.local:\n");
  console.log(`ZEPTO_OAUTH_CLIENT_ID=${client_id}`);
  if (!process.env.ZEPTO_OAUTH_REDIRECT_URI?.trim()) {
    console.log(`# Optional override if deploy URL differs:`);
    console.log(`# ZEPTO_OAUTH_REDIRECT_URI=${redirectUri}`);
  }
  console.log("\nProduction: whitelist the same redirect URI with Zepto if required.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
