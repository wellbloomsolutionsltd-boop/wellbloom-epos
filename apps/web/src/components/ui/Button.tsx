import type {
  ButtonHTMLAttributes,
  CSSProperties,
  ReactNode,
} from "react";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "gold"
  | "danger"
  | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
  children: ReactNode;
};

const variantStyles: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: "var(--wb-green)",
    color: "#fff",
    border: "1px solid var(--wb-green)",
  },
  secondary: {
    background: "var(--wb-navy)",
    color: "#fff",
    border: "1px solid var(--wb-navy)",
  },
  gold: {
    background: "var(--wb-gold)",
    color: "var(--wb-navy)",
    border: "1px solid var(--wb-gold)",
  },
  danger: {
    background: "var(--wb-danger)",
    color: "#fff",
    border: "1px solid var(--wb-danger)",
  },
  ghost: {
    background: "transparent",
    color: "var(--wb-text)",
    border: "1px solid var(--wb-border)",
  },
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className = "",
  children,
  disabled,
  style,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`ui-button ui-button--${variant} ui-button--${size} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading}
      style={{
        minHeight: 42,
        padding: "0 16px",
        borderRadius: "var(--wb-radius-sm)",
        cursor: disabled || loading
          ? "not-allowed"
          : "pointer",
        fontWeight: 700,
        opacity: disabled || loading ? 0.6 : 1,
        transition: "0.2s ease",
        ...variantStyles[variant],
        ...style,
      }}
      {...props}
    >
      {loading ? <span className="ui-spinner" aria-hidden="true" /> : icon}
      <span>{loading ? "Please wait…" : children}</span>
    </button>
  );
}
