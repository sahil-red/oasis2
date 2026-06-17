-- Search snapshot cold-start perf: expression indexes so the per-type / per-category
-- aggregations in the snapshot loaders (loadCategoryTypeMap, loadTypeNormalize,
-- loadDietaryPrevalence) run as index-only scans instead of seq-scanning the big
-- product_search_index heap (which carries the 1024-dim vectors). Tiny table (~22k
-- rows), instant to build, well under the 32MB free-tier maintenance_work_mem.

-- loadCategoryTypeMap: GROUP BY trim(category), lower(trim(primary_type))
CREATE INDEX IF NOT EXISTS idx_psi_cat_pt
  ON product_search_index (trim(category), lower(trim(primary_type)));

-- loadTypeNormalize: GROUP BY lower(trim(primary_type))
CREATE INDEX IF NOT EXISTS idx_psi_pt_lower
  ON product_search_index (lower(trim(primary_type)));

-- loadDietaryPrevalence: GROUP BY coalesce(nullif(trim(primary_type),''),'unknown')
-- with FILTER on the dietary flags — INCLUDE them so the scan stays index-only.
CREATE INDEX IF NOT EXISTS idx_psi_pt_diet
  ON product_search_index ((coalesce(nullif(trim(primary_type), ''), 'unknown')))
  INCLUDE (is_vegan, is_gluten_free, is_palm_oil_free, is_jain);
