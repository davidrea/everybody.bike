"use client";

import { cn } from "@/lib/utils";
import type { RsvpStatus } from "@/types";

interface RsvpButtonGroupProps {
  currentStatus: RsvpStatus | null;
  onSelect: (status: RsvpStatus) => void;
  disabled?: boolean;
}

const statusConfig: {
  value: RsvpStatus;
  label: string;
  activeClass: string;
}[] = [
  {
    value: "yes",
    label: "Yes",
    activeClass: "bg-green-600 text-white border-green-600",
  },
  {
    value: "maybe",
    label: "Maybe",
    activeClass: "bg-amber-500 text-white border-amber-500",
  },
  {
    value: "no",
    label: "No",
    activeClass: "bg-red-600 text-white border-red-600",
  },
];

export function RsvpButtonGroup({
  currentStatus,
  onSelect,
  disabled,
}: RsvpButtonGroupProps) {
  return (
    <div className="inline-flex rounded-lg border">
      {statusConfig.map((s, i) => (
        <button
          key={s.value}
          type="button"
          onClick={() => onSelect(s.value)}
          disabled={disabled}
          className={cn(
            "min-h-[44px] min-w-[72px] px-4 py-2 text-sm font-medium transition-colors",
            "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:pointer-events-none disabled:opacity-50",
            i === 0 && "rounded-l-lg",
            i === statusConfig.length - 1 && "rounded-r-lg",
            i > 0 && "border-l",
            currentStatus === s.value ? s.activeClass : "bg-background",
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
