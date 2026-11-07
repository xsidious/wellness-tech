"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "wt-a11y-prefs";

type Prefs = {
  largeText: boolean;
  highContrast: boolean;
  underlineLinks: boolean;
  reduceMotion: boolean;
};

const defaults: Prefs = {
  largeText: false,
  highContrast: false,
  underlineLinks: false,
  reduceMotion: false,
};

function applyPrefs(prefs: Prefs) {
  const root = document.documentElement;
  root.classList.toggle("a11y-large-text", prefs.largeText);
  root.classList.toggle("a11y-high-contrast", prefs.highContrast);
  root.classList.toggle("a11y-underline-links", prefs.underlineLinks);
  root.classList.toggle("a11y-reduce-motion", prefs.reduceMotion);
}

export function AccessibilityWidget() {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(defaults);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = { ...defaults, ...(JSON.parse(raw) as Partial<Prefs>) };
      setPrefs(parsed);
      applyPrefs(parsed);
    } catch {
      /* ignore */
    }
  }, []);

  function update(next: Prefs) {
    setPrefs(next);
    applyPrefs(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="a11y-fab">
      <button
        type="button"
        className="a11y-fab-btn"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden>♿</span> Accessibility
      </button>
      {open ? (
        <div id={panelId} role="dialog" aria-label="Accessibility options" className="a11y-panel">
          <strong>Display options</strong>
          <ul>
            {(
              [
                ["largeText", "Larger text"],
                ["highContrast", "High contrast"],
                ["underlineLinks", "Underline links"],
                ["reduceMotion", "Reduce motion"],
              ] as const
            ).map(([key, label]) => (
              <li key={key}>
                <label>
                  <input
                    type="checkbox"
                    checked={prefs[key]}
                    onChange={() => update({ ...prefs, [key]: !prefs[key] })}
                  />{" "}
                  {label}
                </label>
              </li>
            ))}
          </ul>
          <div className="a11y-panel-links">
            <button type="button" onClick={() => update(defaults)}>
              Reset
            </button>
            <Link href="/accessibility" onClick={() => setOpen(false)}>
              Accessibility statement
            </Link>
            <Link href="/email-preferences" onClick={() => setOpen(false)}>
              Email opt-out
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
