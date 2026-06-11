/**
 * Indian label category heads — not rateable ingredients on their own.
 * e.g. "Emulsifier (INS 322)" → rate INS 322, not "emulsifier".
 */

const GENERIC_EXACT = new Set([
  "flavour",
  "flavor",
  "flavouring",
  "flavoring",
  "flavours",
  "flavors",
  "thickener",
  "thickner",
  "thickeners",
  "thickening agent",
  "stabilizer",
  "stabiliser",
  "stabilizers",
  "stabilisers",
  "preservative",
  "preservatives",
  "colour",
  "color",
  "colours",
  "colors",
  "colouring",
  "coloring",
  "emulsifier",
  "emulsifiers",
  "acidity regulator",
  "acidity regulators",
  "antioxidant",
  "antioxidants",
  "raising agent",
  "raising agents",
  "gelling agent",
  "gelling agents",
  "humectant",
  "humectants",
  "bulking agent",
  "bulking agents",
  "seasoning",
  "seasonings",
  "filling",
  "coating",
  "glazing agent",
  "firming agent",
  "carrier",
  "processing aid",
  "improver",
  "sweetener",
  "sweeteners",
  "flavour enhancer",
  "flavor enhancer",
  "permitted class ii preservative",
  "class ii preservative",
  "class i preservative",
]);

const GENERIC_PREFIXES = [
  "contains permitted",
  "permitted natural",
  "permitted synthetic",
  "nature identical",
  "natural flavour",
  "natural flavor",
  "artificial flavour",
  "artificial flavor",
  "natural and nature identical",
  "natural flavouring substance",
  "natural flavoring substance",
  "natural flavouring substances",
  "natural flavoring substances",
  "artificial flavouring substance",
  "artificial flavoring substance",
  "artificial flavouring substances",
  "artificial flavoring substances",
];

export function isGenericIngredientCategory(name: string): boolean {
  const n = name.toLowerCase().trim().replace(/\s+/g, " ");
  if (!n) return true;
  if (GENERIC_EXACT.has(n)) return true;
  if (n.endsWith("s") && GENERIC_EXACT.has(n.slice(0, -1))) return true;
  for (const prefix of GENERIC_PREFIXES) {
    if (n.startsWith(prefix)) return true;
  }
  if (/\b(contains|permitted)\b/.test(n) && /\b(colour|color|flavour|flavor)\b/.test(n)) {
    return true;
  }
  return false;
}

/** Allergen / legal boilerplate — not rateable substances. */
export function isIngredientBoilerplate(name: string): boolean {
  const n = name.toLowerCase().trim();
  if (!n) return true;
  if (isGenericIngredientCategory(n)) return true;
  if (/^contains\s+(added\s+)?(flavours?|flavors?|nature|artificial|permitted)/.test(n)) {
    return true;
  }
  if (/^contains\s+(milk|wheat|soy|nut|egg|sesame|mustard|celery|sulphite)/.test(n)) {
    return true;
  }
  if (/^may\s+contain\b/.test(n)) return true;
  if (/^numbers\s+in\s+brackets\b/.test(n)) return true;
  if (/^and\s+(ins|e)\s*\d/.test(n)) return true;
  if (/^and\s+added\b/.test(n)) return true;
  if (n.endsWith(" -") || n.endsWith("-")) return true;
  return false;
}
