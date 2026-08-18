"use client";

import { useEffect, useState } from "react";

const INTRO_KEY = "kl-pickleball-court:brand-intro:v1";

export function InitialBrandLoader() {
  const [phase, setPhase] = useState<"visible" | "leaving" | "hidden">("visible");

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(INTRO_KEY)) {
        queueMicrotask(() => setPhase("hidden"));
        return;
      }
      window.sessionStorage.setItem(INTRO_KEY, "shown");
    } catch {
      // Storage can be unavailable in private browsing; the intro still works.
    }

    const leaveTimer = window.setTimeout(() => setPhase("leaving"), 1350);
    const removeTimer = window.setTimeout(() => setPhase("hidden"), 1850);
    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(removeTimer);
    };
  }, []);

  if (phase === "hidden") return null;

  return (
    <div
      className="brand-intro"
      data-phase={phase}
      role="status"
      aria-live="polite"
      aria-label="Opening K and L Pickleball Court"
    >
      <div className="brand-intro-court" aria-hidden="true" />
      <div className="brand-intro-mark" aria-hidden="true">
        <span className="brand-intro-orbit" />
        <img src="/kl-pickleball-court-logo.png" alt="" width="176" height="176" />
      </div>
      <p>K&amp;L Pickleball Court</p>
      <span>Play close. Rally together.</span>
      <div className="brand-intro-progress" aria-hidden="true"><i /></div>
    </div>
  );
}
