/** Re-export — canonical intent lives in lib/search/intent.ts per SEARCH_V2_PLAN.md §16.2 */
export {
  parseSearchIntent,
  parseSearchIntentV2,
  shouldUseLlmIntentParse,
  typeMatchTokens,
} from "@/lib/search/intent";
