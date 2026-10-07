import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: "linear-gradient(135deg, var(--color-primary-blue), var(--color-purple))",
    color: "var(--color-white)",
    border: "1px solid transparent",
    boxShadow: "0 4px 12px rgba(0, 113, 227, 0.3)",
  },
  secondary: {
    background: "var(--glass-bg)",
    color: "var(--color-primary-blue)",
    border: "1px solid rgba(0, 113, 227, 0.2)",
    backdropFilter: "var(--glass-blur)",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.05)",
  },
  ghost: {
    background: "transparent",
    color: "var(--color-primary-blue)",
    border: "1px solid transparent",
  },
  danger: {
    background: "linear-gradient(135deg, #ff4757, #ff3838)",
    color: "#fff",
    border: "1px solid transparent",
    boxShadow: "0 4px 12px rgba(255, 71, 87, 0.3)",
  },
};

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: { 
    padding: "0.5rem 1rem", 
    fontSize: "0.8125rem",
    borderRadius: "var(--radius-control)",
  },
  md: { 
    padding: "0.75rem 1.5rem", 
    fontSize: "0.9375rem",
    borderRadius: "var(--radius-control)",
  },
  lg: { 
    padding: "1rem 2rem", 
    fontSize: "1.0625rem",
    borderRadius: "var(--radius-control)",
  },
};

export function Button({
  variant = "primary",
  size = "md",
  children,
  style,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
        fontWeight: 600,
        letterSpacing: "0.01em",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition: "all var(--transition-bounce)",
        fontFamily: "inherit",
        position: "relative",
        overflow: "hidden",
        ...variantStyles[variant],
        ...sizeStyles[size],
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow = variant === "primary" 
            ? "0 6px 16px rgba(0, 113, 227, 0.4)" 
            : variant === "danger"
            ? "0 6px 16px rgba(255, 71, 87, 0.4)"
            : "0 4px 12px rgba(0, 0, 0, 0.1)";
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = variantStyles[variant].boxShadow as string || "none";
        }
      }}
      onMouseDown={(e) => {
        if (!disabled) {
          e.currentTarget.style.transform = "translateY(1px)";
        }
      }}
      onMouseUp={(e) => {
        if (!disabled) {
          e.currentTarget.style.transform = "translateY(-2px)";
        }
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
