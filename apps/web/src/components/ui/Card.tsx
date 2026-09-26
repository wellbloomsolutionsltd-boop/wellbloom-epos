import type { HTMLAttributes, ReactNode } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  eyebrow?: string;
  title?: string;
  action?: ReactNode;
};

export function Card({
  eyebrow,
  title,
  action,
  className = "",
  children,
  style,
  ...props
}: CardProps) {
  return (
    <div
      className={`ui-card ${className}`.trim()}
      style={{
        background: "var(--wb-surface)",
        border: "1px solid var(--wb-border)",
        borderRadius: "var(--wb-radius-md)",
        boxShadow: "var(--wb-shadow-sm)",
        padding: 20,
        ...style,
      }}
      {...props}
    >
      {(eyebrow || title || action) && (
        <header className="ui-card__header">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            {title && <h2>{title}</h2>}
          </div>
          {action}
        </header>
      )}
      {children}
    </div>
  );
}
