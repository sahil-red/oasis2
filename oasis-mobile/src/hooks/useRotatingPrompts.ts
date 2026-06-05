import { useEffect, useState } from "react";
import {
  getRotatingPrompts,
  PROMPT_ROTATION_MS,
  promptRotationSlot,
} from "@/lib/prompts";

export function useRotatingPrompts(): string[] {
  const [prompts, setPrompts] = useState(() => getRotatingPrompts());

  useEffect(() => {
    const refresh = () => setPrompts(getRotatingPrompts());

    const slot = promptRotationSlot();
    const msUntilNext = (slot + 1) * PROMPT_ROTATION_MS - Date.now();
    const alignTimer = setTimeout(refresh, Math.max(500, msUntilNext));
    const interval = setInterval(refresh, PROMPT_ROTATION_MS);

    return () => {
      clearTimeout(alignTimer);
      clearInterval(interval);
    };
  }, []);

  return prompts;
}
