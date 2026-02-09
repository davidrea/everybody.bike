"use client";

import { cn } from "@/lib/utils";

interface DashboardRatioIndicatorProps {
  ratio: number | null;
  confirmedRollModels: number;
  confirmedRiders: number;
}

export function DashboardRatioIndicator({
  ratio,
  confirmedRollModels,
  confirmedRiders,
}: DashboardRatioIndicatorProps) {
  let status: "green" | "amber" | "red" | "none" = "none";
  let label = "No riders confirmed yet";

  if (ratio !== null) {
    if (ratio >= 1 / 6) {
      status = "green";
      label = "Good ratio";
    } else if (ratio >= 1 / 10) {
      status = "amber";
      label = "Low ratio";
    } else {
      status = "red";
      label = "Very low ratio";
    }
  }

  const ratioText =
    ratio !== null
      ? `${confirmedRollModels}:${confirmedRiders}`
      : "N/A";

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "h-3 w-3 rounded-full",
          status === "green" && "bg-green-500",
          status === "amber" && "bg-amber-500",
          status === "red" && "bg-red-500",
          status === "none" && "bg-gray-400",
        )}
      />
      <span className="text-sm font-medium">
        Coach:Rider {ratioText}
      </span>
      <span className="text-xs text-muted-foreground">({label})</span>
    </div>
  );
}
