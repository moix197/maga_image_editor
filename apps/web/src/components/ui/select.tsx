// Minimal Select implementation using a native <select>.
// Matches the shadcn/ui Select API surface used in this project.
// Replace with the full Radix-based shadcn component once
// @radix-ui/react-select is added to the project.
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface SelectContextValue {
  value?: string;
  onValueChange?: (v: string) => void;
  selectEl: HTMLSelectElement | null;
  setSelectEl: (el: HTMLSelectElement | null) => void;
}

const SelectContext = React.createContext<SelectContextValue>({
  selectEl: null,
  setSelectEl: () => {},
});

function Select({
  value,
  onValueChange,
  children,
}: {
  value?: string;
  onValueChange?: (v: string) => void;
  children?: React.ReactNode;
}) {
  // Callback ref in state so SelectContent re-renders once the <select> mounts,
  // without reading a ref's `.current` during render.
  const [selectEl, setSelectEl] = React.useState<HTMLSelectElement | null>(null);
  return (
    <SelectContext.Provider value={{ value, onValueChange, selectEl, setSelectEl }}>
      {children}
    </SelectContext.Provider>
  );
}

// SelectTrigger renders the native <select> element.
// SelectContent/SelectItem will render <option>s via a portal into this select.
function SelectTrigger({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const { value, onValueChange, setSelectEl } = React.useContext(SelectContext);
  return (
    <div className={cn("relative h-9 w-full", className)}>
      <select
        ref={setSelectEl}
        value={value}
        onChange={(e) => onValueChange?.(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      >
        {/* Options are injected by SelectContent children rendered below */}
      </select>
      <div className="flex h-full w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm pointer-events-none">
        {value}
      </div>
      {children}
    </div>
  );
}

function SelectValue(_props: { placeholder?: string }) {
  return null;
}

// SelectContent renders its children (SelectItem → <option>) directly into the
// native <select> via a ref-based portal equivalent.
function SelectContent({ children }: { children?: React.ReactNode }) {
  const { selectEl } = React.useContext(SelectContext);

  if (!selectEl) return null;

  // Render options directly inside the <select> using a React portal
  return createPortal(children, selectEl);
}

function SelectItem({
  value,
  children,
  className: _className,
}: {
  value: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return <option value={value}>{children}</option>;
}

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
