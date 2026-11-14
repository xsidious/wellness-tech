"use client";

import { useState } from "react";

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M3 3l18 18"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M10.6 10.7a2.2 2.2 0 0 0 2.7 2.7M9.4 5.6A10.4 10.4 0 0 1 12 5.3c5 0 8.8 3.5 10.2 6.7a1.1 1.1 0 0 1 0 .9 12.4 12.4 0 0 1-3.4 4.3M6.1 6.2A12.5 12.5 0 0 0 1.8 12a1.1 1.1 0 0 0 0 .9C3.2 16.2 7 19.7 12 19.7c1.4 0 2.7-.3 3.9-.7"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function PinField({
  label = "6-digit security PIN",
  name = "pin",
  autoFocus = false,
  placeholder = "••••••",
  defaultValue = "",
  required = true,
}: {
  label?: string;
  name?: string;
  autoFocus?: boolean;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <label className="auth-field">
      <span>{label}</span>
      <span className="auth-password-wrap">
        <input
          name={name}
          type={visible ? "text" : "password"}
          inputMode="numeric"
          pattern="[0-9]*"
          minLength={required ? 6 : undefined}
          maxLength={6}
          required={required}
          autoFocus={autoFocus}
          autoComplete="one-time-code"
          placeholder={placeholder}
          defaultValue={defaultValue}
          className="auth-pin-input"
          onInput={(e) => {
            const el = e.currentTarget;
            el.value = el.value.replace(/\D/g, "").slice(0, 6);
          }}
        />
        <button
          type="button"
          className="auth-password-toggle auth-pin-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide PIN" : "Show PIN"}
          title={visible ? "Hide PIN" : "Show PIN"}
        >
          <EyeIcon open={visible} />
        </button>
      </span>
    </label>
  );
}
