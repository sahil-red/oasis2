-- Allow Apple Vision + Paddle backends in OCR cache.
alter table public.image_ocr_cache drop constraint if exists image_ocr_cache_backend_check;

alter table public.image_ocr_cache
  add constraint image_ocr_cache_backend_check
  check (backend in ('gemini', 'tesseract', 'manual', 'vision', 'paddle'));
