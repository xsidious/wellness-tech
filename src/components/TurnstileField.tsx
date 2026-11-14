"use client";

import { useEffect, useId, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          theme?: string;
          appearance?: "always" | "execute" | "interaction-only";
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          "timeout-callback"?: () => void;
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

type Status = { ready: boolean; token: string; error: string };

type Props = {
  siteKey?: string;
  onStatusChange?: (status: Status) => void;
};

function resolveSiteKey(explicit?: string) {
  return (explicit || process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "").trim();
}

/**
 * Explicit Turnstile widget with a single named response field.
 * Do not place an empty `cf-turnstile-response` input before the widget —
 * FormData.get() would pick the empty one and block signup/login.
 */
export function TurnstileField({ siteKey, onStatusChange }: Props) {
  const key = resolveSiteKey(siteKey);
  const boxRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onStatusRef = useRef(onStatusChange);
  const inputId = useId();
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    onStatusRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    onStatusRef.current?.({
      ready: status === "ready" && Boolean(token),
      token,
      error,
    });
  }, [status, token, error]);

  useEffect(() => {
    if (!key || !boxRef.current) return;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

    function publish(nextToken: string, nextStatus: "loading" | "ready" | "error", nextError = "") {
      if (cancelled) return;
      setToken(nextToken);
      setStatus(nextStatus);
      setError(nextError);
    }

    function stripDuplicateFields(root: HTMLElement) {
      root
        .querySelectorAll('input[name="cf-turnstile-response"], textarea[name="cf-turnstile-response"]')
        .forEach((el) => el.setAttribute("name", "cf-turnstile-widget"));
    }

    function mount() {
      if (cancelled || !boxRef.current || !window.turnstile) return;
      if (widgetId.current) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {
          /* ignore */
        }
        widgetId.current = null;
      }
      boxRef.current.innerHTML = "";
      try {
        widgetId.current = window.turnstile.render(boxRef.current, {
          sitekey: key,
          theme: "light",
          appearance: "always",
          callback: (value) => {
            if (boxRef.current) stripDuplicateFields(boxRef.current);
            publish(value, "ready");
          },
          "expired-callback": () => publish("", "loading", "Security check expired — wait a second and try again."),
          "error-callback": () =>
            publish("", "error", "Security check failed to load. Disable blockers for this site, or refresh."),
          "timeout-callback": () => publish("", "error", "Security check timed out. Refresh the page and try again."),
        });
        queueMicrotask(() => {
          if (boxRef.current) stripDuplicateFields(boxRef.current);
        });
      } catch {
        widgetId.current = null;
        publish("", "error", "Security check could not start. Refresh and try again.");
      }
    }

    function ensureScript() {
      if (window.turnstile) {
        mount();
        return;
      }
      let script = document.querySelector<HTMLScriptElement>('script[data-wt-turnstile="1"]');
      if (!script) {
        script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.dataset.wtTurnstile = "1";
        script.onerror = () => {
          publish(
            "",
            "error",
            "Could not load security check (blocked network). Refresh or allow challenges.cloudflare.com.",
          );
        };
        document.head.appendChild(script);
      }
      pollTimer = setInterval(() => {
        if (window.turnstile) {
          if (pollTimer) clearInterval(pollTimer);
          pollTimer = null;
          mount();
        }
      }, 150);
      timeoutTimer = setTimeout(() => {
        if (!cancelled && !widgetId.current) {
          if (pollTimer) clearInterval(pollTimer);
          pollTimer = null;
          publish(
            "",
            "error",
            "Security check is taking too long. Refresh the page (and allow Cloudflare challenges if blocked).",
          );
        }
      }, 12000);
    }

    publish("", "loading");
    ensureScript();

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
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
      <div ref={boxRef} className="auth-turnstile-box" />
      <input id={inputId} type="hidden" name="cf-turnstile-response" value={token} readOnly />
      {status === "loading" ? <p className="signup-hint">Security check loading…</p> : null}
      {status === "ready" ? <p className="signup-hint">Security check ready.</p> : null}
      {status === "error" && error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
