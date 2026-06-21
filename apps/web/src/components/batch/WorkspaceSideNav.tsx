"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { SECTIONS, resolveSection } from "./workspace-sections";
import type { WorkspaceSection } from "./workspace-sections";

export type { WorkspaceSection };

function WorkspaceSideNavInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeSection = resolveSection(searchParams.get("section"));

  const navigateTo = useCallback(
    (section: WorkspaceSection) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("section", section);
      router.push(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  return (
    <nav
      aria-label="Workspace sections"
      className={cn(
        "flex shrink-0 border-r border-[hsl(var(--sidebar-border))]",
        "flex-row md:flex-col",
        "w-full md:w-[var(--sidebar-width,4rem)] lg:w-[var(--sidebar-width,13rem)]",
        "overflow-x-auto md:overflow-x-visible",
      )}
    >
      <ul role="tablist" aria-orientation="vertical" className="flex flex-row md:flex-col flex-1 md:flex-none md:w-full p-1 gap-1">
        {SECTIONS.map(({ id, label, Icon }) => {
          const isActive = activeSection === id;
          return (
            <li key={id} role="presentation" className="flex-1 md:flex-none">
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => navigateTo(id)}
                className={cn(
                  "flex w-full min-h-[44px] items-center gap-3 rounded-md px-3 py-2",
                  "text-sm font-medium cursor-pointer select-none",
                  "transition-colors duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--sidebar-ring))]",
                  isActive
                    ? "bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-accent-foreground))]"
                    : "text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))]/60 hover:text-[hsl(var(--sidebar-accent-foreground))]",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="hidden lg:inline">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="shrink-0 self-center p-1 md:mt-auto md:self-start">
        <ThemeToggle />
      </div>
    </nav>
  );
}

/** Skeleton shown while the nav hydrates (avoids useSearchParams prerender error). */
function WorkspaceSideNavSkeleton() {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex shrink-0 border-r border-[hsl(var(--sidebar-border))]",
        "flex-row md:flex-col",
        "w-full md:w-[var(--sidebar-width,4rem)] lg:w-[var(--sidebar-width,13rem)]",
      )}
    />
  );
}

export function WorkspaceSideNav() {
  return (
    <Suspense fallback={<WorkspaceSideNavSkeleton />}>
      <WorkspaceSideNavInner />
    </Suspense>
  );
}
