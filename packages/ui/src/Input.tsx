import type { InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export function Input({
  label,
  hint,
  error,
  id,
  style,
  ...rest
}: InputProps) {
  const inputId = id ?? rest.name;

  return (
    <label
      htmlFor={inputId}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.4rem",
        width: "100%",
        fontSize: "0.9rem",
      }}
    >
      {label ? (
        <span style={{ fontWeight: 600, color: "var(--namat-input-label, var(--namat-ink, #0b1f2a))" }}>
          {label}
        </span>
      ) : null}
      <input
        id={inputId}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "0.75rem 0.9rem",
          borderRadius: "var(--namat-input-radius, 0.35rem)",
          border: `1px solid ${error ? "#8b2e2e" : "var(--namat-input-border, rgba(11, 31, 42, 0.22))"}`,
          background: "var(--namat-input-bg, rgba(255,255,255,0.72))",
          color: "var(--namat-input-color, var(--namat-ink, #0b1f2a))",
          fontSize: "1rem",
          fontFamily: "inherit",
          outline: "none",
          ...style,
        }}
        {...rest}
      />
      {error ? (
        <span style={{ color: "#8b2e2e", fontSize: "0.8rem" }}>{error}</span>
      ) : hint ? (
        <span style={{ color: "var(--namat-input-hint, rgba(11,31,42,0.55))", fontSize: "0.8rem" }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}
