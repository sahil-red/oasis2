"""
Scout Intent Classifier — FastAPI microservice (STATELESS v2).
Replaces LLM intent resolution (2-5s DeepSeek) with a 5-50ms rule-based classifier.

POST /intent
  Request:  { "query": "high protein snacks under 100", "brands": [...], "primary_types": [...] }
  Response: { "kind": "directed", "brand": null, "primary_type": "snacks", ... }

All state is local to each classify() call — no global variables. Safe for
async/concurrent HTTP requests under uvicorn.
"""

from __future__ import annotations

import os
import re

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# ── Types ──

class IntentRequest(BaseModel):
    query: str
    brands: list[str]
    primary_types: list[str]

class IntentResponse(BaseModel):
    kind: str
    brand: str | None = None
    primary_type: str | None = None
    required_flavours: list[str] = []
    goal_phrase: str | None = None
    use_case: str | None = None
    modifiers: list[str] = []
    sort: str = "best_match"
    confidence: float = 0.85
    trait_weights: dict[str, float] = {}

# ── Normalization ──

def normalize(s: str) -> str:
    return re.sub(r"[^\w]", "", s.lower())

def tokenize(text: str) -> list[str]:
    return [t for t in re.split(r"[^\w]+", text.lower()) if len(t) >= 2]

def _edit_distance(a: str, b: str) -> int:
    if len(a) < len(b):
        a, b = b, a
    if len(b) == 0:
        return len(a)
    prev = list(range(len(b) + 1))
    for ca in a:
        curr = [prev[0] + 1]
        for j, cb in enumerate(b):
            curr.append(min(prev[j + 1] + 1, curr[j] + 1, prev[j] + (ca != cb)))
        prev = curr
    return prev[-1]


# ── Stateless lookup index (built per-request) ──

class LookupIndex:
    """All indices are local to one HTTP request — no global state."""

    def __init__(self, brands: list[str], primary_types: list[str]):
        self.brands_set = {normalize(b) for b in brands if b}
        self.types_set = set()
        self.type_originals: dict[str, str] = {}
        self.multiword_types: dict[str, str] = {}
        self.multiword_brands: dict[str, str] = {}

        for t in primary_types:
            if not t:
                continue
            n = normalize(t)
            self.types_set.add(n)
            self.type_originals[n] = t
            if " " in t:
                self.multiword_types[n] = t

        for b in brands:
            if b and " " in b:
                self.multiword_brands[normalize(b)] = b

    def find_brand(self, tokens: list[str], query: str) -> str | None:
        q = normalize(query)
        if q in self.multiword_brands:
            return self.multiword_brands[q]
        if q in self.brands_set:
            return query.strip()
        # Check consecutive token pairs for multi-word brands
        for i in range(len(tokens) - 1):
            pair = tokens[i] + tokens[i + 1]
            if pair in self.multiword_brands:
                return self.multiword_brands[pair]
            if pair in self.brands_set:
                return self.brands_set.pop()  # Can't get original from set, use normalized
        for t in tokens:
            if t in self.brands_set:
                return t.title()
        return None

    def find_primary_type(self, tokens: list[str], query: str) -> str | None:
        q = normalize(query)

        # 1. Exact multi-word match
        if q in self.multiword_types:
            return self.multiword_types[q]
        if q in self.types_set:
            return self.type_originals.get(q, q)

        # 2. Multi-word substring: "vanilla ice cream" contains "ice cream"
        for mw_norm, mw_orig in self.multiword_types.items():
            if mw_norm in q:
                return mw_orig

        # 3. Individual token matching (exact first, then fuzzy)
        for t in tokens:
            if t in self.types_set:
                return self.type_originals.get(t, t)
            # Fuzzy: substring or edit-distance against individual words
            for tp_norm, tp_orig in list(self.type_originals.items()):
                if len(t) >= 3 and (t in tp_norm or (len(t) >= 4 and _edit_distance(t, tp_norm) <= 1)):
                    return tp_orig

        # 4. Fuzzy on individual words of multi-word types (last resort)
        for t_norm, t_orig in list(self.type_originals.items()):
            if len(q) < 3:
                continue
            for word in t_orig.lower().split():
                w = normalize(word)
                if len(w) < 3:
                    continue
                if q in w or w in q:
                    return t_orig
                if len(q) >= 4 and len(w) >= 4 and _edit_distance(q, w) <= 1:
                    return t_orig

        return None


# ── Goal detection ──

GOAL_PHRASES = [
    ("diabetic friendly", "diabetic friendly"),
    ("diabetes friendly", "diabetes friendly"),
    ("pcos friendly", "pcos friendly"),
    ("pcos", "pcos friendly"),
    ("heart healthy", "heart healthy"),
    ("heart health", "heart health"),
    ("low cholesterol", "low cholesterol"),
    ("keto", "keto"),
    ("low carb", "low carb"),
    ("low carbohydrate", "low carb"),
    ("high protein", "high protein"),
    ("protein rich", "high protein"),
    ("highest protein", "high protein"),
    ("low sugar", "low sugar"),
    ("sugar free", "sugar free"),
    ("zero sugar", "sugar free"),
    ("no added sugar", "no added sugar"),
    ("low calorie", "low calorie"),
    ("low fat", "low fat"),
    ("weight loss", "weight loss"),
    ("fat loss", "weight loss"),
    ("muscle gain", "muscle gain"),
    ("bulking", "muscle gain"),
    ("bulk", "muscle gain"),
    ("gym", "gym"),
    ("fitness", "gym"),
    ("workout", "gym"),
    ("kids", "kids"),
    ("tiffin", "kids"),
    ("school lunch", "kids"),
    ("kids friendly", "kids"),
    ("pregnancy", "pregnancy"),
    ("prenatal", "pregnancy"),
    ("expecting", "pregnancy"),
    ("immunity", "immunity"),
    ("immunity boosting", "immunity"),
    ("antioxidant", "immunity"),
    ("bone health", "bone health"),
    ("calcium rich", "bone health"),
    ("anemia", "anemia"),
    ("iron deficiency", "anemia"),
    ("iron rich", "anemia"),
    ("blood pressure", "blood pressure"),
    ("hypertension", "blood pressure"),
    ("low sodium", "blood pressure"),
    ("vegan", "vegan"),
    ("plant based", "vegan"),
    ("dairy free", "vegan"),
    ("gluten free", "gluten free"),
    ("celiac", "gluten free"),
    ("gut health", "gut health"),
    ("digestion", "gut health"),
    ("probiotic", "gut health"),
    ("energy", "energy"),
    ("energy boost", "energy"),
    ("pre workout", "energy"),
    ("skin", "skin & hair"),
    ("hair", "skin & hair"),
    ("beauty", "skin & hair"),
    ("hydration", "hydration"),
    ("electrolytes", "hydration"),
    ("running", "running"),
    ("endurance", "running"),
    ("athlete", "running"),
    ("parents", "parents"),
    ("elderly", "parents"),
    ("senior", "parents"),
    ("clean eating", "clean eating"),
    ("whole food", "clean eating"),
    ("no additives", "clean eating"),
    ("healthy", "healthy"),
    ("healthiest", "healthy"),
    ("healthier", "healthy"),
    ("satiety", "satiety"),
    ("filling", "satiety"),
    ("protein budget", "protein budget"),
    # Hinglish support
    ("kam fat", "low fat"),
    ("kam calorie", "low calorie"),
    ("kam cheeni", "low sugar"),
    ("bina cheeni", "sugar free"),
    ("bina tel", "low fat"),
    ("jyada protein", "high protein"),
    ("healthy khana", "healthy"),
]


def detect_goal(query: str) -> str | None:
    q = query.lower().strip()
    for phrase, mapped in sorted(GOAL_PHRASES, key=lambda x: len(x[0]), reverse=True):
        if phrase in q:
            return mapped  # Return the English canonical form, not raw phrase
    return None


def detect_modifiers(query: str) -> list[str]:
    modifiers: list[str] = []
    q = query.lower()
    if re.search(r"\b(high|more|highest|most|jyada)\s+protein\b", q):
        modifiers.append("high_protein_tier")
    if re.search(r"\b(low|less|lowest|kam)\s+sugar\b", q):
        modifiers.append("low_sugar")
    if re.search(r"\bno\s+added\s+sugar\b", q):
        modifiers.append("no_added_sugar")
    if re.search(r"\b(zero|no|bina)\s+sugar\b", q):
        modifiers.append("no_added_sugar")
    return modifiers


def detect_sort(query: str) -> str:
    q = query.lower()
    if any(p in q for p in ("cheapest", "budget", "affordable", "under 50", "under 100")):
        return "cheapest"
    if any(p in q for p in ("highest protein", "more protein", "most protein", "high protein")):
        return "highest_protein"
    if any(p in q for p in ("healthiest", "best rated", "top rated")):
        return "healthiest"
    if any(p in q for p in ("lowest sugar", "less sugar", "sugar free", "zero sugar")):
        return "lowest_sugar"
    return "best_match"


# Vague query prefixes — if query starts with these without a type, it's ambiguous
VAGUE_PREFIXES = {"something", "anything", "good", "best", "nice", "tasty", "cheap", "quick"}

# ── Classification ──

def classify(query: str, brands: list[str], primary_types: list[str]) -> IntentResponse:
    idx = LookupIndex(brands, primary_types)
    tokens = tokenize(query)
    query_lower = query.lower().strip()

    # Comparison queries
    if re.search(r"\b(healthier|cheaper)\s+than\b", query_lower):
        is_healthier = "healthier" in query_lower
        return IntentResponse(
            kind="directed",
            sort="healthiest" if is_healthier else "cheapest",
            confidence=0.55,  # Degrade to LLM for comparison queries
        )

    # Brand / Type matching
    brand = idx.find_brand(tokens, query_lower)
    ptype = idx.find_primary_type(tokens, query_lower)
    goal_phrase = detect_goal(query_lower)
    modifiers = detect_modifiers(query_lower)
    sort = detect_sort(query_lower)

    # Vague query detection
    first = tokens[0] if tokens else ""
    is_vague = first in VAGUE_PREFIXES and not ptype and not brand

    # Natural language queries → low confidence (LLM territory).
    # >5 tokens or >4 with no brand are conversational queries.
    is_natural_lang = len(tokens) > 5 or (len(tokens) > 4 and not brand)

    # Pure brand (full query matches brand): "amul", "karachi bakery"
    if brand and normalize(query_lower) in idx.brands_set:
        return IntentResponse(kind="brand", brand=brand, confidence=0.95)

    # Pure brand (multi-word matched): "karachi bakery"
    if brand and len(tokens) == 1:
        return IntentResponse(kind="brand", brand=brand, confidence=0.95)

    # Brand + Type: "amul butter" (skip for long natural language queries)
    if brand and ptype and not is_natural_lang:
        return IntentResponse(kind="directed", brand=brand, primary_type=ptype,
                              goal_phrase=goal_phrase, modifiers=modifiers, sort=sort,
                              confidence=0.92)

    # Pure type: "milk"
    if ptype and len(tokens) == 1 and not brand:
        return IntentResponse(kind="directed", primary_type=ptype, confidence=0.95)

    # Vague or natural language queries → degrade to LLM
    if is_vague or is_natural_lang:
        return IntentResponse(kind="ambiguous", confidence=0.30)

    # Goal + Type: "diabetic friendly snacks"
    if goal_phrase and ptype:
        return IntentResponse(kind="directed", primary_type=ptype, goal_phrase=goal_phrase,
                              modifiers=modifiers, sort=sort, confidence=0.82)

    # Pure goal: "diabetic friendly" (skip for vague queries like "something healthy")
    if goal_phrase and not is_vague:
        return IntentResponse(kind="goal", goal_phrase=goal_phrase, primary_type=ptype,
                              modifiers=modifiers, sort=sort, confidence=0.80)

    # Vague queries → degrade to LLM
    if is_vague or is_natural_lang:
        return IntentResponse(kind="ambiguous", confidence=0.30)

    # Modifiers + type: "high protein snacks"
    if ptype:
        return IntentResponse(kind="directed", primary_type=ptype,
                              modifiers=modifiers, sort=sort, confidence=0.72)

    # Modifiers only → low confidence (LLM territory)
    if modifiers:
        return IntentResponse(kind="directed", modifiers=modifiers, sort=sort, confidence=0.55)

    # Brand only (fuzzy match)
    if brand:
        return IntentResponse(kind="brand", brand=brand, confidence=0.65)

    # Ambiguous
    return IntentResponse(kind="ambiguous", confidence=0.30)


# ── App ──

app = FastAPI(title="Scout Intent Classifier", version="0.2.0")


@app.get("/health")
async def health():
    return {"ok": True, "backend": "rule-based"}


@app.post("/intent")
async def classify_intent(req: IntentRequest) -> IntentResponse:
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="query is required")
    return classify(req.query, req.brands, req.primary_types)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
