"use client";

import { useEffect, useId, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          theme?: string;
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

type Props = { siteKey?: string };

function resolveSiteKey(explicit?: string) {
  return (explicit || process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "").trim();
}

export function TurnstileField({ siteKey }: Props) {
  const key = resolveSiteKey(siteKey);
  const boxRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const inputId = useId();
  const tokenInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!key || !boxRef.current) return;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    function setToken(token: string) {
      if (tokenInputRef.current) tokenInputRef.current.value = token;
    }

    function mount() {
      if (cancelled || !boxRef.current || !window.turnstile) return;
      // Avoid double-render into the same node.
      boxRef.current.innerHTML = "";
      try {
        widgetId.current = window.turnstile.render(boxRef.current, {
          sitekey: key,
          theme: "light",
          callback: setToken,
          "expired-callback": () => setToken(""),
          "error-callback": () => setToken(""),
        });
      } catch {
        widgetId.current = null;
      }
    }

    function ensureScript() {
      if (window.turnstile) {
        mount();
        return;
      }
      const existing = document.querySelector<HTMLScriptElement>('script[data-wt-turnstile="1"]');
      if (!existing) {
        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.dataset.wtTurnstile = "1";
        document.head.appendChild(script);
      }
      pollTimer = setInterval(() => {
        if (window.turnstile) {
          if (pollTimer) clearInterval(pollTimer);
          pollTimer = null;
          mount();
        }
      }, 200);
    }

    ensureScript();

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (widgetId.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {
          /* ignore */
        }
      }
    };
  }, [key]);

  if (!key) return null;

  return (
    <div className="auth-turnstile">
      <input ref={tokenInputRef} id={inputId} type="hidden" name="cf-turnstile-response" defaultValue="" />
      <div ref={boxRef} />
    </div>
  );
}
