"use client";
/** "Which panels is this marker already in?" — chips that add the whole module in one click. */
import { useState } from "react";
import { useStore } from "@/lib/store";
import type { PanelModule } from "@/lib/types";
import { cx } from "./ui";

export function InModules({ modules, onAdd, max = 3, bare, className }: { modules: PanelModule[]; onAdd?: () => void; max?: number; bare?: boolean; className?: string }) {
  const rows = useStore((s) => s.rows);
  const addModule = useStore((s) => s.addModule);
  const [all, setAll] = useState(false);
  if (!modules.length) return null;
  const shown = all ? modules : modules.slice(0, max);

  return (
    <div className={cx("flex flex-wrap items-center gap-1 text-[11px]", className)} data-testid="in-modules">
      {!bare && <span className="text-slate-500">in</span>}
      {shown.map((m) => {
        const added = rows.some((r) => r.moduleIds.includes(m.id));
        return (
          <button key={m.id} disabled={added} onClick={(e) => { e.stopPropagation(); addModule(m); onAdd?.(); }}
            title={added ? `${m.name} is already in your panel` : `Add the whole ${m.name} module (${m.markers.length} markers)`}
            className={cx("rounded px-1.5 py-0.5", added
              ? "bg-teal-100 text-teal-900 dark:bg-teal-900 dark:text-teal-100"
              : "bg-slate-100 text-slate-600 hover:bg-teal-100 hover:text-teal-900 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-teal-900 dark:hover:text-teal-100")}>
            {m.name}{added ? " ✓" : " +"}
          </button>
        );
      })}
      {!all && modules.length > max && (
        <button onClick={(e) => { e.stopPropagation(); setAll(true); }} className="text-slate-500 underline">+{modules.length - max} more</button>
      )}
    </div>
  );
}
