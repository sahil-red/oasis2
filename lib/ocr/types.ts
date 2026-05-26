/**
 * Canonical OCR output schema.
 *
 * The OCR step is the regulatory source of truth in the Scout pipeline.
 * By FSSAI rule everything we need is printed on the back label of every
 * Indian packaged food product, in English. One image → one `OcrPayload`.
 */

export interface OcrIngredient {
  /** As printed on the label, before normalisation. */
  name: string;
  /** % of total weight when disclosed (FSSAI mandates % for characterising
   *  ingredients like cocoa in chocolate biscuits). */
  percent?: number;
  /** "Wheat flour (Refined wheat flour, Maida)" → sub_ingredients=["Refined wheat flour", "Maida"]. */
  sub_ingredients?: string[];
}

export interface OcrNutrition {
  energy_kcal?: number;
  protein_g?: number;
  fat_g?: number;
  saturated_fat_g?: number;
  trans_fat_g?: number;
  carbs_g?: number;
  sugar_g?: number;
  added_sugar_g?: number;
  fiber_g?: number;
  sodium_mg?: number;
  calcium_mg?: number;
  iron_mg?: number;
  caffeine_mg?: number;
  cholesterol_mg?: number;
}

export interface OcrPayload {
  /** Ingredients in label order (descending by weight per FSSAI 2.2.2-Reg.). */
  ingredients: OcrIngredient[];
  /** Per-100g (or per-100ml). The scoring engine assumes this normalisation. */
  nutrition_per_100g?: OcrNutrition;
  /** Per-serve panel when the label only prints per-serve. We try to also
   *  fill nutrition_per_100g by scaling, but keep the raw per-serve here too. */
  nutrition_per_serve?: OcrNutrition;
  /** "30g", "1 piece (25g)", "200ml". */
  serving_size?: string;
  /** "200g", "1kg", "500ml". */
  net_weight?: string;
  /** "Contains: wheat, milk, soy". */
  allergens?: string[];
  /** 14-digit FSSAI license. */
  fssai_license?: string;
  /** Free-form manufacturer line. */
  manufacturer?: string;
  /** "Made in India", "Country of origin: India". */
  origin?: string;
  /** Vegetarian dot? Vegan? Jaivik Bharat? Organic India? */
  labels?: string[];

  /** Self-rated quality. */
  confidence: {
    overall: number; // 0..1
    has_ingredients: boolean;
    has_nutrition_table: boolean;
    notes?: string;
  };

  /** Which backend filled this. */
  backend: "paddle" | "manual";
  /** Raw OCR text after validation. */
  raw_text?: string;
}

/** The pick step decides which image to OCR. */
export interface ImagePickResult {
  url: string;
  index: number;
  /** Why this image was picked. */
  reason:
    | "only_image"
    | "last_image_heuristic"
    | "tesseract_keyword_match";
  /** 0..1 confidence that this is the back-label. */
  confidence: number;
}
