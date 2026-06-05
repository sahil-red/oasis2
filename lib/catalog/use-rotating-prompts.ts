"use client";

import { useEffect, useState } from "react";
import {
  getRotatingPrompts,
  PROMPT_ROTATION_MS,
  promptRotationSlot,
} from "@/lib/catalog/example-prompts";

/** Example prompts under the search bar; refreshes every 15 minutes. */
export function useRotatingPrompts(): string[] {
  const [prompts, setPrompts] = useState(() => getRotatingPrompts());

  useEffect(() => {
    const refresh = () => setPrompts(getRotatingPrompts());

    const slot = promptRotationSlot();
    const msUntilNext = (slot + 1) * PROMPT_ROTATION_MS - Date.now();
    const alignTimer = window.setTimeout(refresh, Math.max(500, msUntilNext));
    const interval = window.setInterval(refresh, PROMPT_ROTATION_MS);

    return () => {
      window.clearTimeout(alignTimer);
      window.clearInterval(interval);
    };
  }, []);

  return prompts;
}
