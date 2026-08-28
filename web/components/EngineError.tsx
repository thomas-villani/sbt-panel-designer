"use client";
import { useStore } from "@/lib/store";
import { Button } from "./ui";

/** The engine failed (worker crash, bad input): say so and offer a retry rather than a permanent "Balancing…". */
export function EngineError({ message }: { message: string }) {
  const balanceNow = useStore((s) => s.balanceNow);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100" data-testid="engine-error">
      <span className="flex-1">The balancer could not run: {message}</span>
      <Button size="sm" variant="primary" onClick={() => void balanceNow()}>Try again</Button>
    </div>
  );
}
