import { config } from "dotenv";
import { adminClient } from "@/lib/supabase/admin";
config({ path: ".env.local" });
async function main() {
  const s = adminClient();
  for (const cols of [
    "id, l3_category",
    "id, data_source",
    "id, ocr_status, ocr_payload, ocr_image_url",
  ]) {
    const { error } = await s.from("products").select(cols).limit(1);
    console.log(cols, "->", error?.message ?? "ok");
  }
}
main();
