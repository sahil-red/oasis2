"""
Search V2 SQL endpoint — Python FastAPI on Vercel serverless.

Calls search_v2_sql() PostgreSQL function via PostgREST for single-query
candidate retrieval with type/brand/nutrition/dietary/avoid_ingredient filtering
and health-first ranking (0.45 health + 0.35 relevance).

Deploy: vercel.json routes api/search/py.py → Vercel Python runtime.
"""
import json, os, time, hashlib, hmac, re
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse
import httpx

# ── Config ──
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
VOYAGE_KEY = os.environ.get("VOYAGE_API_KEY", "")
VOYAGE_URL = os.environ.get("EMBEDDING_BASE_URL", "https://api.voyageai.com/v1")
VOYAGE_MODEL = os.environ.get("EMBEDDING_MODEL", "voyage-3.5")
GROQ_KEY = os.environ.get("GROQ_API_KEY", "")
DEEPSEEK_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
ANON_SEARCHES = int(os.environ.get("ANON_FREE_SEARCHES", "999"))

# ── Caching ──
_intent_cache: dict[str, tuple[float, dict]] = {}  # key → (timestamp, intent)
_snapshot_cache: dict = {}
_snapshot_at: float = 0
_SNAPSHOT_TTL = 3600  # 1 hour

# ── Embedding ──
async def embed_text(text: str) -> list[float]:
    if not VOYAGE_KEY:
        return []
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.post(
                f"{VOYAGE_URL}/embeddings",
                headers={"Authorization": f"Bearer {VOYAGE_KEY}"},
                json={"model": VOYAGE_MODEL, "input": [text], "input_type": "query", "output_dimension": 1024},
            )
            res.raise_for_status()
            data = res.json()
            return data["data"][0]["embedding"]
    except Exception:
        return []

# ── Snapshot loading ──
async def load_snapshot():
    global _snapshot_cache, _snapshot_at
    now = time.time()
    if _snapshot_cache and now - _snapshot_at < _SNAPSHOT_TTL:
        return _snapshot_cache

    async with httpx.AsyncClient(timeout=30) as client:
        headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}

        # Load centroids
        centroids = {}
        for page in range(5):
            res = await client.get(
                f"{SUPABASE_URL}/rest/v1/type_centroids?select=primary_type,centroid&limit=1000&offset={page*1000}",
                headers={**headers, "Accept": "application/json"},
            )
            if res.status_code != 200:
                break
            for r in res.json():
                c = r.get("centroid")
                if c:
                    centroids[r["primary_type"].lower()] = json.loads(c) if isinstance(c, str) else c

        # Load facets
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/rpc/search_v2_facets",
            headers=headers,
        )
        facets = res.json() if res.status_code == 200 else {}
        brands = set((facets.get("brands") or []))
        primary_types = set((facets.get("primary_types") or []))

    _snapshot_cache = {
        "centroids": centroids,
        "brands": brands,
        "primary_types": primary_types,
    }
    _snapshot_at = now
    return _snapshot_cache


# ── Type equivalents (in-memory cosine) ──
def cosine_similarity(a: list[float], b: list[float]) -> float:
    if len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = sum(x * x for x in a) ** 0.5
    mag_b = sum(x * x for x in b) ** 0.5
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


def semantic_type_matches(wanted: str, centroids: dict) -> list[str]:
    key = wanted.lower().strip()
    out = {key}
    if key in centroids:
        vec = centroids[key]
        for t, cv in centroids.items():
            if t == key:
                continue
            dist = 1.0 - cosine_similarity(vec, cv)
            if dist <= 0.05:
                out.add(t)
    return list(out)


# ── LLM Intent ──
async def parse_intent(query: str) -> dict:
    # Simple constraint extraction (mirrors extractNumericConstraints)
    text = query.lower()
    constraints: dict = {"no_added_sugar": False, "sort": "best_match"}
    residual = text

    # Sugar
    if re.search(r"zero sugar|no sugar|no added sugar|without sugar|without added sugar|sugar[\s-]free", text):
        constraints["no_added_sugar"] = True
        residual = re.sub(r"\b(zero sugar|no sugar|no added sugar|without sugar|without added sugar|sugar[\s-]free)\b", " ", residual)
    if re.search(r"low sugar|less sugar|lower sugar", text):
        constraints["low_sugar_tier"] = True
        residual = re.sub(r"\b(low sugar|less sugar|lower sugar)\b", " ", residual)

    # Protein
    if re.search(r"\b(high(?:est)? protein|higher protein|more protein|most protein)\b", text):
        constraints["sort"] = "highest_protein"
        constraints["high_protein_tier"] = True
        residual = re.sub(r"\b(high(?:est)? protein|higher protein|more protein|most protein)\b", " ", residual)

    # Price
    m = re.search(r"(?:under|below|cheapest|budget)\s*(?:₹|rs\.?)?\s*(\d+)", text)
    if m:
        constraints["max_price"] = int(m.group(1))

    # Fat-free
    if re.search(r"fat[\s-]free|no fat|lower fat|less fat", text):
        constraints["low_fat_tier"] = True
        residual = re.sub(r"\b(fat[\s-]free|no fat|lower fat|less fat)\b", " ", residual)

    # Clean residual — find primary type
    residual = re.sub(r"\s+", " ", residual).strip()

    # Fast-path: find type from residual tokens
    snap = await load_snapshot()
    tokens = [t for t in residual.split() if len(t) >= 2]
    primary_type = None
    brand = None

    # Check pairs first
    for i in range(len(tokens) - 1):
        pair = tokens[i] + " " + tokens[i + 1]
        if pair in snap.get("primary_types", set()):
            primary_type = pair
            break
        if pair in snap.get("brands", set()):
            brand = pair
            break

    # Then individuals
    if not primary_type and not brand:
        for t in tokens:
            if t in snap.get("primary_types", set()):
                primary_type = t
                break
            if t in snap.get("brands", set()):
                brand = t
                break

    # Fall through to LLM for complex queries
    if not primary_type and not brand and not any(v for k, v in constraints.items() if k.startswith(("max_", "sort=")) and v):
        intent = await _call_llm(query, snap)
        if intent:
            return intent

    return {
        "primary_type": primary_type,
        "brand": brand,
        "kind": "brand" if brand and not primary_type else "directed",
        "sort": constraints.get("sort", "best_match"),
        "constraints": constraints,
        "source": "fast-path" if (primary_type or brand) else "llm",
    }


async def _call_llm(query: str, snap: dict) -> dict | None:
    # Build catalog hints
    tokens = [t for t in query.lower().split() if len(t) >= 3 and t not in {"no","not","without","bina","bagair","nahi","nako","free","the","and","for","with"}]
    hints = ""
    if tokens:
        brand_hints = [b for b in snap.get("brands", set()) if any(t in b for t in tokens)][:8]
        type_hints = [t for t in snap.get("primary_types", set()) if any(tk in t for tk in tokens)][:8]
        if brand_hints:
            hints += f"\nCatalog hints (use these exact names if relevant): brands: [{', '.join(brand_hints)}]"
        if type_hints:
            hints += f"; types: [{', '.join(type_hints)}]"

    # Try Groq first
    if GROQ_KEY:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                res = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {GROQ_KEY}"},
                    json={
                        "model": "llama-3.1-8b-instant",
                        "temperature": 0,
                        "max_tokens": 400,
                        "messages": [
                            {"role": "system", "content": INTENT_PROMPT},
                            {"role": "user", "content": f"Query: {query}{hints}"},
                        ],
                    },
                )
                res.raise_for_status()
                content = res.json()["choices"][0]["message"]["content"]
                return _parse_llm_json(content, query)
        except Exception:
            pass

    # DeepSeek fallback
    if DEEPSEEK_KEY:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                res = await client.post(
                    "https://api.deepseek.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {DEEPSEEK_KEY}"},
                    json={
                        "model": "deepseek-v4-flash",
                        "temperature": 0,
                        "max_tokens": 400,
                        "response_format": {"type": "json_object"},
                        "messages": [
                            {"role": "system", "content": INTENT_PROMPT},
                            {"role": "user", "content": f"Query: {query}{hints}"},
                        ],
                    },
                )
                res.raise_for_status()
                content = res.json()["choices"][0]["message"]["content"]
                return _parse_llm_json(content, query)
        except Exception:
            pass

    return None


def _parse_llm_json(content: str, query: str) -> dict:
    content = content.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
    try:
        start = content.index("{")
        end = content.rindex("}")
        parsed = json.loads(content[start:end + 1])
        return {
            "primary_type": (parsed.get("primary_type") or "").strip().lower() or None,
            "brand": (parsed.get("brand") or "").strip() or None,
            "kind": parsed.get("kind", "directed"),
            "sort": parsed.get("sort", "best_match"),
            "goal_phrase": (parsed.get("goal_phrase") or "").strip() or None,
            "constraints": {
                "max_price": parsed.get("constraints", {}).get("max_price"),
                "max_sugar_g": parsed.get("constraints", {}).get("max_sugar_g"),
                "max_fat_g": parsed.get("constraints", {}).get("max_fat_g"),
                "max_calories": parsed.get("constraints", {}).get("max_calories"),
                "min_protein_g": parsed.get("constraints", {}).get("min_protein_g"),
                "vegan": parsed.get("constraints", {}).get("vegan"),
                "vegetarian": parsed.get("constraints", {}).get("vegetarian"),
                "gluten_free": parsed.get("constraints", {}).get("gluten_free"),
                "palm_oil_free": parsed.get("constraints", {}).get("palm_oil_free"),
                "avoid_ingredients": (parsed.get("constraints", {}).get("avoid_ingredients") or []),
                "allergens_excluded": (parsed.get("constraints", {}).get("allergens_excluded") or []),
            },
            "source": "llm",
        }
    except Exception:
        return {"kind": "ambiguous", "source": "degraded"}



# ── LLM Intent ── = """You parse Indian grocery search queries into strict JSON. Return one JSON object, no markdown.
Schema: {"kind":"directed"|"goal"|"brand"|"ambiguous","brand":string|null,"primary_type":string|null,"goal_phrase":string|null,"sort":"best_match"|"cheapest"|"healthiest"|"highest_protein","constraints":{"max_price":number,"max_sugar_g":number,"max_fat_g":number,"max_calories":number,"min_protein_g":number,"vegan":boolean,"vegetarian":boolean,"gluten_free":boolean,"palm_oil_free":boolean,"avoid_ingredients":["..."],"allergens_excluded":["..."]},"intent_confidence":number}

Rules:
- BRAND = a manufacturer name (Amul, Nestle). Descriptive words (cow, organic, fresh) are NOT brands.
- kind:"brand" ONLY for pure brand queries with NO product type.
- "no sugar" -> max_sugar_g:0. "no added sugar" / "without added sugar" -> modifiers only, DO NOT set max_sugar_g.
- "no artificial sweetener" -> avoid_ingredients:["artificial sweetener"].
- Understand Hindi (doodh, bina cheeni, nahi).
- For brand/discovery, use catalog hints if provided.
- Return intent_confidence (0-1) reflecting certainty."""


# ── Handler ──
class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0)) or "{}"))
        prompt = (body.get("prompt") or "").strip()
        if len(prompt) < 2:
            self._json({"error": "Prompt is required"}, 400); return

        # ── Resolve intent ──
        import asyncio
        loop = asyncio.new_event_loop()
        intent = loop.run_until_complete(resolve_and_search(prompt, body.get("limit", 48)))
        loop.close()
        self._json(intent)

    def do_GET(self):
        if self.path == "/api/search/py/health":
            self._json({"ok": True})
        else:
            self._json({"error": "POST only"}, 405)

    def _json(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


async def resolve_and_search(query: str, limit: int = 48) -> dict:
    t0 = time.time()
    intent = await parse_intent(query)
    snap = await load_snapshot()

    # Type equivalents
    types = semantic_type_matches(intent.get("primary_type") or "", snap.get("centroids", {})) if intent.get("primary_type") else None

    # Embed query for ANN
    query_vec = await embed_text(query)
    vec_json = json.dumps(query_vec) if query_vec else "[]"

    # Brand pattern
    brand = intent.get("brand")
    brand_pat = f"%{'%'.join(re.findall(r'[a-z0-9]+', brand.lower()))}%" if brand else None

    # SQL search
    c = intent.get("constraints", {})
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            f"{SUPABASE_URL}/rest/v1/rpc/search_v2_sql",
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "params=single-object",
            },
            json={
                "p_query_embedding_json": vec_json,
                "p_type_equivalents": types,
                "p_brand_pattern": brand_pat,
                "p_sort": intent.get("sort", "best_match"),
                "p_limit": min(100, max(8, limit)),
                "p_max_price": c.get("max_price"),
                "p_max_sugar_g": c.get("max_sugar_g"),
                "p_max_fat_g": c.get("max_fat_g"),
                "p_max_calories": c.get("max_calories"),
                "p_min_protein_g": c.get("min_protein_g"),
                "p_vegan": c.get("vegan"),
                "p_vegetarian": c.get("vegetarian"),
                "p_gluten_free": c.get("gluten_free"),
                "p_palm_oil_free": c.get("palm_oil_free"),
                "p_no_added_sugar": c.get("no_added_sugar"),
                "p_allergens_excluded": c.get("allergens_excluded"),
                "p_avoid_ingredients": c.get("avoid_ingredients"),
                "p_min_quality": 0.3,
            },
        )
        rows = res.json() if res.status_code == 200 else []

    items = []
    for r in rows:
        items.append({
            "id": r.get("product_id"),
            "name": r.get("name"),
            "brand": r.get("brand"),
            "primary_type": r.get("primary_type"),
            "price_inr": r.get("price_inr"),
            "sugar_g": r.get("sugar_g"),
            "protein_g": r.get("protein_g"),
            "fat_g": r.get("fat_g"),
            "scout_score": r.get("scout_score"),
            "relevance_score": r.get("relevance_score"),
        })

    return {
        "summary": f"Best {intent.get('primary_type','')} matches ({len(items)})".strip(),
        "items": items,
        "total": len(items),
        "llm_calls": 0 if intent.get("source") == "fast-path" else 1,
        "latency_ms": int((time.time() - t0) * 1000),
        "intent": intent,
    }
