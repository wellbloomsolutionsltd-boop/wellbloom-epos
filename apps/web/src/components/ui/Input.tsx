"use client";

import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string;
  leadingIcon?: ReactNode;
  trailingAction?: ReactNode;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input(
    {
      label,
      hint,
      error,
      leadingIcon,
      trailingAction,
      className = "",
      id,
      style,
      ...props
    },
    ref,
  ) {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const detailId = `${inputId}-detail`;

    return (
      <label
        className={`ui-field ${className}`.trim()}
        htmlFor={inputId}
        style={{
          display: "grid",
          gap: 8,
        }}
      >
        {label && (
          <span
            className="ui-field__label"
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--wb-text-muted)",
            }}
          >
            {label}
          </span>
        )}
        <span
          className={`ui-input ${error ? "ui-input--error" : ""}`}
          style={{
            width: "100%",
            minHeight: 44,
            borderRadius: "var(--wb-radius-sm)",
            border: error
              ? "1px solid var(--wb-danger)"
              : "1px solid var(--wb-border)",
            background: "#fff",
          }}
        >
          {leadingIcon && <span className="ui-input__icon">{leadingIcon}</span>}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={Boolean(error)}
            aria-describedby={hint || error ? detailId : undefined}
            style={{
              width: "100%",
              minHeight: 42,
              padding: "0 12px",
              outline: "none",
              background: "#fff",
              ...style,
            }}
            {...props}
          />
          {trailingAction}
        </span>
        {(error || hint) && (
          <span
            id={detailId}
            className={error ? "ui-field__error" : "ui-field__hint"}
            style={error
              ? {
                  fontSize: 12,
                  color: "var(--wb-danger)",
                }
              : undefined}
          >
            {error ?? hint}
          </span>
        )}
      </label>
    );
  },
);
