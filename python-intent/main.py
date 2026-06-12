"""
Scout Intent Classifier — FastAPI microservice.
Replaces LLM intent resolution (2-5s DeepSeek) with a 5-50ms rule-based +
optional fastText classifier.

POST /intent
  Request:  { "query": "high protein snacks under 100", "brands": [...], "primary_types": [...] }
  Response: { "kind": "directed", "brand": null, "primary_type": "snacks", ... }
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# ── Types ──

class IntentRequest(BaseModel):
    query: str
    brands: list[str]
    primary_types: list[str]

class IntentResponse(BaseModel):
    kind: str  # "brand" | "directed" | "goal" | "ambiguous"
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

# ── Lookup indices ──

brands_set: set[str] = set()
types_set: set[str] = set()
type_originals: dict[str, str] = {}       # norm → original
multiword_types: dict[str, str] = {}      # norm → original (space-containing types)
multiword_brands: dict[str, str] = {}


def rebuild_indices(brands: list[str], primary_types: list[str]) -> None:
    global brands_set, types_set, type_originals, multiword_types, multiword_brands

    brands_set = {normalize(b) for b in brands if b}
    types_set = set()
    type_originals = {}
    multiword_types = {}

    for t in primary_types:
        if not t:
            continue
        n = normalize(t)
        types_set.add(n)
        type_originals[n] = t
        if " " in t:
            multiword_types[n] = t

    multiword_brands = {}
    for b in brands:
        if b and " " in b:
            multiword_brands[normalize(b)] = b


def _edit_distance(a: str, b: str) -> int:
    if len(a) < len(b):
        a, b = b, a
    if len(b) == 0:
        return len(a)
    prev = list(range(len(b) + 1))
    for ca in a:
        curr = [prev[0] + 1]
        for j, cb in enumerate(b):
            curr.append(min(
                prev[j + 1] + 1,
                curr[j] + 1,
                prev[j] + (ca != cb),
            ))
        prev = curr
    return prev[-1]


# ── Type matching ──

def find_primary_type(tokens: list[str], query: str) -> str | None:
    """Find a primary_type using exact, multi-word, substring, and fuzzy matching."""
    q = normalize(query)

    # 1. Exact multi-word match
    if q in multiword_types:
        return multiword_types[q]
    # 2. Exact single-word match
    if q in types_set:
        return type_originals.get(q, q)

    # 3. Multi-word substring: "vanilla ice cream" contains "ice cream"
    for mw_norm, mw_orig in multiword_types.items():
        if mw_norm in q:
            return mw_orig

    # 4. Fuzzy: substring or edit-distance against individual words of type names
    for t_norm, t_orig in list(type_originals.items()):
        if len(q) < 3:
            continue
        # check each word of the original type name
        for word in t_orig.lower().split():
            w = normalize(word)
            if len(w) < 3:
                continue
            if q in w or w in q:
                return t_orig
            if len(q) >= 4 and len(w) >= 4 and _edit_distance(q, w) <= 1:
                return t_orig

    # 5. Individual token matching
    for t in tokens:
        if t in types_set:
            return type_originals.get(t, t)
        # Substring on token
        for tp_norm, tp_orig in list(type_originals.items()):
            if len(t) >= 3 and (t in tp_norm or tp_norm in t or
                                (len(t) >= 4 and _edit_distance(t, tp_norm) <= 1)):
                return tp_orig

    return None


# ── Brand matching ──

def find_brand(tokens: list[str], query: str) -> str | None:
    q = normalize(query)
    if q in multiword_brands:
        return multiword_brands[q]
    if q in brands_set:
        return query.strip()
    for t in tokens:
        if t in brands_set:
            # Return original case by finding in list
            for b in brands_set if hasattr(brands_set, '__iter__') else []:
                pass
            return t.title()
    return None


# ── Goal detection ──

GOAL_PHRASES = [
    "diabetic friendly", "diabetes friendly", "pcos friendly", "pcos",
    "heart healthy", "heart health", "low cholesterol",
    "keto", "low carb", "low carbohydrate",
    "high protein", "protein rich", "highest protein",
    "low sugar", "sugar free", "zero sugar", "no added sugar",
    "low calorie", "low fat", "weight loss", "fat loss",
    "muscle gain", "bulking", "bulk", "gym", "fitness", "workout",
    "kids", "tiffin", "school lunch", "kids friendly",
    "pregnancy", "prenatal", "expecting",
    "immunity", "immunity boosting", "antioxidant",
    "bone health", "calcium rich",
    "anemia", "iron deficiency", "iron rich",
    "blood pressure", "hypertension", "low sodium",
    "vegan", "plant based", "dairy free",
    "gluten free", "celiac",
    "gut health", "digestion", "probiotic",
    "energy", "energy boost", "pre workout",
    "skin", "hair", "beauty",
    "hydration", "electrolytes",
    "running", "endurance", "athlete",
    "parents", "elderly", "senior",
    "clean eating", "whole food", "no additives",
    "healthy", "healthiest", "healthier",
    "satiety", "filling", "protein budget",
]


def detect_goal(query: str) -> str | None:
    q = query.lower().strip()
    for phrase in sorted(GOAL_PHRASES, key=len, reverse=True):
        if phrase in q:
            return phrase
    return None


# ── Modifiers ──

def detect_modifiers(query: str) -> list[str]:
    modifiers: list[str] = []
    q = query.lower()
    if re.search(r"\b(high|more|highest|most)\s+protein\b", q):
        modifiers.append("high_protein_tier")
    if re.search(r"\b(low|less|lowest)\s+sugar\b", q):
        modifiers.append("low_sugar")
    if re.search(r"\bno\s+added\s+sugar\b", q):
        modifiers.append("no_added_sugar")
    if re.search(r"\b(zero|no)\s+sugar\b", q):
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


# ── Classification ──

def classify(query: str, brands: list[str], primary_types: list[str]) -> IntentResponse:
    rebuild_indices(brands, primary_types)

    tokens = tokenize(query)
    query_lower = query.lower().strip()

    # Comparison queries
    if re.search(r"\b(healthier|cheaper)\s+than\b", query_lower):
        target = re.sub(r".*\b(healthier|cheaper)\s+than\s+", "", query_lower)
        return IntentResponse(
            kind="directed", sort="healthiest" if "healthier" in query_lower else "cheapest",
            confidence=0.9,
        )

    # Brand / Type matching
    brand = find_brand(tokens, query_lower)
    ptype = find_primary_type(tokens, query_lower)
    goal = detect_goal(query_lower)
    modifiers = detect_modifiers(query_lower)
    sort = detect_sort(query_lower)

    # Pure brand: "amul"
    if brand and len(tokens) == 1:
        return IntentResponse(kind="brand", brand=brand, confidence=0.95)

    # Pure type: "milk"
    if ptype and len(tokens) == 1 and not brand:
        return IntentResponse(kind="directed", primary_type=ptype, confidence=0.95)

    # Brand + Type: "amul butter"
    if brand and ptype:
        return IntentResponse(kind="directed", brand=brand, primary_type=ptype,
                              goal_phrase=goal, modifiers=modifiers, sort=sort, confidence=0.92)

    # Goal + Type: "diabetic friendly snacks"
    if goal and ptype:
        return IntentResponse(kind="directed", primary_type=ptype, goal_phrase=goal,
                              modifiers=modifiers, sort=sort, confidence=0.82)

    # Pure goal: "diabetic friendly"
    if goal:
        return IntentResponse(kind="goal", goal_phrase=goal, primary_type=ptype,
                              modifiers=modifiers, sort=sort, confidence=0.80)

    # Modifiers + type: "high protein snacks"
    if ptype:
        return IntentResponse(kind="directed", primary_type=ptype,
                              modifiers=modifiers, sort=sort, confidence=0.72)

    # Modifiers only
    if modifiers:
        return IntentResponse(kind="directed", modifiers=modifiers, sort=sort, confidence=0.60)

    # Brand only (multi-word or short)
    if brand:
        return IntentResponse(kind="brand", brand=brand, confidence=0.75)

    # Ambiguous
    return IntentResponse(kind="ambiguous", confidence=0.40)


# ── App ──

app = FastAPI(title="Scout Intent Classifier", version="0.1.0")


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
