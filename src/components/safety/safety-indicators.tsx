"use client";

import { CircleOff, Cross } from "lucide-react";
import { cn } from "@/lib/utils";

interface SafetyIndicatorsProps {
  medicalAlerts?: string | null;
  mediaOptOut?: boolean;
  className?: string;
  iconClassName?: string;
}

export function SafetyIndicators({
  medicalAlerts,
  mediaOptOut,
  className,
  iconClassName,
}: SafetyIndicatorsProps) {
  const hasMedicalAlerts = (medicalAlerts ?? "").trim().length > 0;
  const hasMediaOptOut = !!mediaOptOut;

  if (!hasMedicalAlerts && !hasMediaOptOut) return null;

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {hasMedicalAlerts ? (
        <span title="Medical alert">
          <Cross
            className={cn("h-3.5 w-3.5 text-destructive", iconClassName)}
            aria-label="Medical alert"
          />
        </span>
      ) : null}
      {hasMediaOptOut ? (
        <span title="Media opt-out">
          <CircleOff
            className={cn("h-3.5 w-3.5 text-amber-600", iconClassName)}
            aria-label="Media opt-out"
          />
        </span>
      ) : null}
    </span>
  );
}
