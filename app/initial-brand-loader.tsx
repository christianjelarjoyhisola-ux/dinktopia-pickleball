"use client";

import { useEffect, useState } from "react";

export const TENANT_READY_EVENT = "kl-pickleball-court:tenant-ready";

export function InitialBrandLoader() {
  const [phase, setPhase] = useState<"visible" | "leaving" | "hidden">("visible");

  useEffect(() => {
    const startedAt = performance.now();
    let leaveTimer = 0;
    let removeTimer = 0;
    const finish = () => {
      const minimumDisplayRemaining = Math.max(0, 800 - (performance.now() - startedAt));
      window.clearTimeout(leaveTimer);
      leaveTimer = window.setTimeout(() => {
        setPhase("leaving");
        removeTimer = window.setTimeout(() => setPhase("hidden"), 500);
      }, minimumDisplayRemaining);
    };
    window.addEventListener(TENANT_READY_EVENT, finish, { once: true });
    const fallbackTimer = window.setTimeout(finish, 4500);
    return () => {
      window.removeEventListener(TENANT_READY_EVENT, finish);
      window.clearTimeout(fallbackTimer);
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
