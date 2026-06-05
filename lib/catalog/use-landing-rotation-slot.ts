"use client";

import { useEffect, useState } from "react";
import { LANDING_ROTATION_MS, landingRotationSlot } from "@/lib/catalog/landing-rotation";

/** Current 15-minute landing rotation slot; updates on the same schedule as prompt chips. */
export function useLandingRotationSlot(): number {
  const [slot, setSlot] = useState(() => landingRotationSlot());

  useEffect(() => {
    const refresh = () => setSlot(landingRotationSlot());

    const now = Date.now();
    const current = landingRotationSlot(now);
    const msUntilNext = (current + 1) * LANDING_ROTATION_MS - now;
    const alignTimer = window.setTimeout(refresh, Math.max(500, msUntilNext));
    const interval = window.setInterval(refresh, LANDING_ROTATION_MS);

    return () => {
      window.clearTimeout(alignTimer);
      window.clearInterval(interval);
    };
  }, []);

  return slot;
}
