"use client";
/**
 * The one overlay idiom: anything that floats over the page (budget card, mobile sheet) closes on Escape and on a click
 * outside, keeps Tab inside itself while open, and hands focus back to whatever opened it when it closes.
 */
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { cx } from "./ui";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
}

/** Escape and clicks outside `ref` call `onClose`. `enabled` false unhooks everything (closed state). */
export function useDismiss(ref: RefObject<HTMLElement | null>, onClose: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    const onPointer = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onPointer); };
  }, [ref, onClose, enabled]);
}

/**
 * Focus management for an open overlay: focus moves inside on open (the first focusable, or the container), Tab wraps,
 * and the previously focused element gets focus back on unmount.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const root = ref.current;
    if (!root) return;
    const opener = document.activeElement as HTMLElement | null;
    const first = focusables(root)[0];
    (first ?? root).focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const els = focusables(root);
      if (!els.length) { e.preventDefault(); return; }
      const i = els.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && (i <= 0)) { e.preventDefault(); els[els.length - 1].focus(); }
      else if (!e.shiftKey && i === els.length - 1) { e.preventDefault(); els[0].focus(); }
    };
    root.addEventListener("keydown", onKey);
    return () => {
      root.removeEventListener("keydown", onKey);
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [ref, enabled]);
}

/**
 * A small dialog anchored to its trigger (render it inside a `relative` wrapper). Escape / outside click / the close
 * button call `onClose`; focus is trapped inside and returned to the trigger.
 */
export function Popover({ label, onClose, className, children, testId }: { label: string; onClose: () => void; className?: string; children: ReactNode; testId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose);
  useFocusTrap(ref);
  return (
    <div ref={ref} role="dialog" aria-label={label} tabIndex={-1} data-testid={testId}
      className={cx("absolute z-30 rounded-lg border border-slate-200 bg-white text-left shadow-xl outline-none dark:border-slate-600 dark:bg-slate-900", className)}>
      {children}
    </div>
  );
}
