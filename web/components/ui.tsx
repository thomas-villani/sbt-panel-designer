"use client";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cx(...xs: (string | false | null | undefined)[]) { return xs.filter(Boolean).join(" "); }

export function Button({ variant = "secondary", size = "md", className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" | "lg" }) {
  const base = "inline-flex items-center gap-1.5 rounded-md font-medium transition disabled:opacity-40 disabled:cursor-not-allowed";
  const v = {
    primary: "bg-teal-700 text-white hover:bg-teal-800 shadow-sm",
    secondary: "bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600 dark:hover:bg-slate-700",
    ghost: "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
    danger: "bg-white text-rose-700 border border-rose-300 hover:bg-rose-100 shadow-sm dark:bg-slate-800 dark:text-rose-300 dark:border-rose-700 dark:hover:bg-rose-950",
  }[variant];
  // Slightly taller on touch screens (min 36 px), the desktop density from `sm:` up.
  const s = { sm: "px-2.5 py-1.5 text-xs sm:px-2 sm:py-1", md: "px-3 py-2 text-sm sm:py-1.5", lg: "px-5 py-2.5 text-base" }[size];
  return <button className={cx(base, v, s, className)} {...rest} />;
}

export function Pill({ children, tone = "slate", className, title, onClick }: { children: ReactNode; tone?: "slate" | "teal" | "amber" | "rose" | "emerald" | "violet"; className?: string; title?: string; onClick?: () => void }) {
  const t = {
    slate: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
    teal: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-100",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100",
    rose: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-100",
    emerald: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100",
    violet: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-100",
  }[tone];
  const Tag = onClick ? "button" : "span";
  return <Tag title={title} onClick={onClick} className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", t, onClick && "hover:ring-2 ring-offset-1 ring-teal-400 cursor-pointer", className)}>{children}</Tag>;
}

export function Card({ children, className, onClick, active }: { children: ReactNode; className?: string; onClick?: () => void; active?: boolean }) {
  return (
    <div onClick={onClick} className={cx("rounded-lg border bg-white p-3 dark:bg-slate-900", active ? "border-teal-500 ring-1 ring-teal-500" : "border-slate-200 dark:border-slate-700", onClick && "cursor-pointer hover:border-teal-400", className)}>
      {children}
    </div>
  );
}

export function H2({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
      <h2 className="text-lg font-semibold tracking-tight">{children}</h2>
      {hint && <div className="text-xs text-slate-500 sm:text-right">{hint}</div>}
    </div>
  );
}

export function Tile({ label, sub, active, onClick }: { label: string; sub?: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cx("min-w-0 rounded-lg border px-3 py-3 text-left transition sm:px-4", active ? "border-teal-600 bg-teal-50 text-teal-900 dark:bg-teal-950 dark:text-teal-100" : "border-slate-200 hover:border-teal-400 dark:border-slate-700")}>
      <div className="font-medium">{label}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </button>
  );
}
