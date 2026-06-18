import * as React from "react";
import { cn } from "@/lib/utils";

interface SliderProps {
  min?: number;
  max?: number;
  step?: number;
  value: number[];
  onValueChange: (value: number[]) => void;
  "aria-label"?: string;
  className?: string;
}

function Slider({
  min = 0,
  max = 100,
  step = 1,
  value,
  onValueChange,
  "aria-label": ariaLabel,
  className,
}: SliderProps) {
  return (
    <span
      role="slider"
      aria-valuenow={value[0]}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-label={ariaLabel}
      className={cn("relative flex w-full touch-none select-none items-center", className)}
    >
      {/* The inner input carries no role/aria-label so the span is the sole slider */}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value[0]}
        className="w-full"
        onChange={(e) => onValueChange([Number(e.target.value)])}
      />
    </span>
  );
}

export { Slider };
