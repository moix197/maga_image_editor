"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface CollapsibleProps {
  title: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Minimal accessible disclosure / collapsible.
 * Uncontrolled: holds open state internally.
 * Header button carries aria-expanded; body is conditionally rendered.
 */
export function Collapsible({ title, defaultOpen = true, className, children }: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1.5 text-sm font-semibold tracking-tight transition-colors duration-150 hover:bg-muted/60 cursor-pointer"
      >
        <span className="truncate">{title}</span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}
