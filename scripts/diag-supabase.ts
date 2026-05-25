#!/usr/bin/env -S pnpm tsx
/**
 * Diagnose Supabase REST connectivity (PGRST125 etc.).
 *
 *   pnpm diag:supabase
 */

import { config as loadEnv } from "dotenv";
import { normalizeSupabaseUrl } from "@/lib/supabase/url";

loadEnv({ path: ".env.local" });

async function main() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!rawUrl || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const url = normalizeSupabaseUrl(rawUrl);
  const host = new URL(url).hostname;
  const ref = host.replace(".supabase.co", "");

  console.log("── env ──");
  console.log("  raw URL:        ", rawUrl);
  console.log("  normalized URL: ", url);
  console.log("  project ref:    ", ref);
  console.log("  service key:    ", key.slice(0, 20) + "…" + key.slice(-8));
  console.log("  key looks JWT:  ", key.startsWith("eyJ"));

  const endpoints = [
    `${url}/rest/v1/`,
    `${url}/rest/v1/zepto_taxonomy?select=super_category&limit=1`,
    `${url}/rest/v1/products?select=id&limit=1`,
  ];

  console.log("\n── REST probes (service role) ──");
  for (const probe of endpoints) {
    const res = await fetch(probe, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
    });
    const body = await res.text();
    const preview = body.slice(0, 200).replace(/\s+/g, " ");
    console.log(`\n  ${res.status} ${probe}`);
    console.log(`    ${preview}${body.length > 200 ? "…" : ""}`);
  }

  console.log("\n── fix checklist ──");
  if (rawUrl.includes("/rest/v1")) {
    console.log("  ✗ URL contains /rest/v1 — remove it from .env.local");
  }
  if (!key.startsWith("eyJ")) {
    console.log("  ✗ Service key should be a JWT starting with eyJ (Settings → API → service_role)");
  }
  console.log("  Settings → API → Project URL should be exactly:");
  console.log(`    https://${ref}.supabase.co`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
