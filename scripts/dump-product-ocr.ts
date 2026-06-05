import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { adminClient } from "@/lib/supabase/admin";
import { reconcileDisplayIngredients } from "@/lib/ocr/deepseek-ingredients";
import { buildIngredientsFromDeepseekLabel } from "@/lib/ocr/deepseek-ingredients";
import type { ExtractedLabel } from "@/lib/ocr/deepseek-label-extract";
import { reconcileNutrition } from "@/lib/nutrition/sanity";

async function main() {
  const slugArg = process.argv.find((a) => a.startsWith("--slug="))?.slice(7);
  const nameQuery = process.argv.find((a) => !a.startsWith("--") && a !== process.argv[0] && !a.includes("tsx")) ?? "Akshayakalpa Organic Malai Paneer";

  const supabase = adminClient();
  let product;
  let candidates: Array<{ name: string }> = [];
  if (slugArg) {
    const { data, error } = await supabase
      .from("products")
      .select(
        "id, slug, name, brand, category, subcategory, net_weight, nutrition, ingredients_raw, attributes, ocr_status, ocr_payload, ocr_image_url, data_source, platform, raw_payload",
      )
      .eq("slug", slugArg)
      .maybeSingle();
    if (error) throw new Error(error.message);
    product = data;
  } else {
    const { data, error } = await supabase
      .from("products")
      .select(
        "id, slug, name, brand, category, subcategory, net_weight, nutrition, ingredients_raw, attributes, ocr_status, ocr_payload, ocr_image_url, data_source, platform, raw_payload",
      )
      .ilike("name", `%${nameQuery.split(" ").slice(0, 2).join("%")}%`)
      .limit(10);
    if (error) throw new Error(error.message);
    candidates = data ?? [];
    product = data?.find((p) =>
      p.name.toLowerCase().includes(nameQuery.toLowerCase()),
    );
  }
  if (!product) {
    console.log("No product found for", nameQuery);
    console.log(
      "Candidates:",
      candidates.map((p) => p.name),
    );
    return;
  }

  const deepseekExtracted = (
    product.ocr_payload as { deepseek_label?: { extracted?: ExtractedLabel } } | null
  )?.deepseek_label?.extracted;
  const displayIngredients = reconcileDisplayIngredients({
    ingredients_raw: product.ingredients_raw,
    ocr_payload: product.ocr_payload,
    productName: product.name,
  });

  const display = reconcileNutrition({
    nutrition: product.nutrition,
    attributes: product.attributes,
    name: product.name,
    category: product.category,
    subcategory: product.subcategory,
    net_weight: product.net_weight,
  });

  console.log(JSON.stringify(
    {
      id: product.id,
      slug: product.slug,
      name: product.name,
      ocr_status: product.ocr_status,
      ocr_image_url: product.ocr_image_url,
      data_source: product.data_source,
      platform: product.platform,
      stored_nutrition: product.nutrition,
      display_nutrition_after_reconcile: display,
      ingredients_raw_stored: product.ingredients_raw,
      ingredients_raw_display: displayIngredients,
      deepseek_ingredients_enriched: deepseekExtracted
        ? buildIngredientsFromDeepseekLabel(deepseekExtracted)
        : null,
      deepseek_raw_list: deepseekExtracted?.ingredients.raw_list ?? null,
      nutrition_attributes: Object.fromEntries(
        Object.entries(product.attributes ?? {}).filter(([k]) => /nutri/i.test(k)),
      ),
      ocr_payload: product.ocr_payload,
      label_resolution: (product.ocr_payload as Record<string, unknown> | null)
        ?.label_resolution,
      ocr_raw_text: (product.ocr_payload as Record<string, unknown> | null)?.regex_payload
        ? ((product.ocr_payload as { regex_payload?: { raw_text?: string } }).regex_payload
            ?.raw_text ?? null)
        : null,
      csv_nutrition_from_raw_payload: (product.raw_payload as Record<string, unknown> | null)
        ?.nutrition ?? null,
    },
    null,
    2,
  ));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
