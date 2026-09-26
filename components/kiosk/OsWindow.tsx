import type { ReactNode } from "react";

export interface OsWindowProps {
  title: string;
  children: ReactNode;
  /** "light" = paper window body; "dark" = translucent dark panel for text over video. */
  variant?: "light" | "dark";
  className?: string;
  bodyClassName?: string;
  onClose?: () => void;
  /** Disable the scale-up open animation (for windows that re-render often). */
  still?: boolean;
}

/** An AURA OS window: title bar with small-caps title, x glyph, resize corner. */
export function OsWindow({ title, children, variant = "dark", className = "", bodyClassName = "", onClose, still }: OsWindowProps) {
  return (
    <section className={`os-window os-window--${variant} ${still ? "" : "os-window--open"} ${className}`}>
      <header className="os-window__title">
        <span className="truncate">{title}</span>
        <button
          type="button"
          className="os-window__x"
          aria-label={onClose ? "Close window" : undefined}
          onClick={onClose}
          tabIndex={onClose ? 0 : -1}
        >
          x
        </button>
      </header>
      <div className={`os-window__body ${bodyClassName}`}>{children}</div>
      <span className="os-window__corner" aria-hidden />
    </section>
  );
}
