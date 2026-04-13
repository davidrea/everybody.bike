"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, ShieldAlert, CameraOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { RootzPreviewRow } from "@/types";

const actionBadges: Record<
  string,
  { variant: "default" | "secondary" | "destructive" | "outline"; label: string }
> = {
  create: { variant: "default", label: "New" },
  update: { variant: "secondary", label: "Update" },
  skip: { variant: "destructive", label: "Skip" },
};

const parentResolutionLabels: Record<string, { label: string; className: string }> = {
  existing_profile: {
    label: "Linked",
    className: "border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-400",
  },
  adult_in_csv: {
    label: "In CSV",
    className: "border-green-300 text-green-700 dark:border-green-700 dark:text-green-300",
  },
  new_invite: {
    label: "Invite",
    className: "border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300",
  },
};

type FilterMode = "all" | "adult_rider" | "minor_rider" | "issues";

export function RootzPreviewTable({
  rows,
  parentNameOverrides,
  onParentNameChange,
}: {
  rows: RootzPreviewRow[];
  parentNameOverrides: Record<string, string>;
  onParentNameChange: (email: string, name: string) => void;
}) {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const filtered = rows.filter((row) => {
    if (filter === "all") return true;
    if (filter === "issues") return row.errors.length > 0 || row.warnings.length > 0;
    return row.classification === filter;
  });

  const issueCount = rows.filter((r) => r.errors.length > 0 || r.warnings.length > 0).length;
  const adultCount = rows.filter((r) => r.classification === "adult_rider").length;
  const minorCount = rows.filter((r) => r.classification === "minor_rider").length;

  function toggleExpanded(rowNum: number) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowNum)) next.delete(rowNum);
      else next.add(rowNum);
      return next;
    });
  }

  return (
    <div>
      {/* Filter tabs */}
      <div className="mb-2 flex gap-1 text-xs">
        <FilterTab active={filter === "all"} onClick={() => setFilter("all")}>
          All ({rows.length})
        </FilterTab>
        <FilterTab active={filter === "adult_rider"} onClick={() => setFilter("adult_rider")}>
          Adults ({adultCount})
        </FilterTab>
        <FilterTab active={filter === "minor_rider"} onClick={() => setFilter("minor_rider")}>
          Minors ({minorCount})
        </FilterTab>
        {issueCount > 0 && (
          <FilterTab active={filter === "issues"} onClick={() => setFilter("issues")}>
            Issues ({issueCount})
          </FilterTab>
        )}
      </div>

      <div className="max-h-[70vh] overflow-auto rounded-md border">
        <TooltipProvider delayDuration={200}>
          <Table className="table-fixed">
            <colgroup>
              <col className="w-8" />   {/* expand toggle */}
              <col className="w-10" />  {/* row # */}
              <col className="w-16" />  {/* action + type */}
              <col />                   {/* rider (flex) */}
              <col className="w-24" />  {/* level */}
              <col />                   {/* parent (flex) */}
              <col className="w-9" />   {/* med */}
              <col className="w-9" />   {/* media */}
            </colgroup>
            <TableHeader>
              <TableRow>
                <TableHead className="px-1" />
                <TableHead className="px-1 text-center">#</TableHead>
                <TableHead className="px-1">Action</TableHead>
                <TableHead className="px-2">Rider</TableHead>
                <TableHead className="px-2">Level</TableHead>
                <TableHead className="px-2">Parent / Guardian</TableHead>
                <TableHead className="px-1 text-center">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help"><ShieldAlert className="mx-auto h-3.5 w-3.5" /></span>
                    </TooltipTrigger>
                    <TooltipContent>Medical info</TooltipContent>
                  </Tooltip>
                </TableHead>
                <TableHead className="px-1 text-center">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help"><CameraOff className="mx-auto h-3.5 w-3.5" /></span>
                    </TooltipTrigger>
                    <TooltipContent>Media opt-out</TooltipContent>
                  </Tooltip>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => {
                const badge = actionBadges[row.action];
                const email = (row.data.email ?? "").trim().toLowerCase();
                const hasIssues = row.errors.length > 0 || row.warnings.length > 0;
                const isMinor = row.classification === "minor_rider";
                const isExpanded = expandedRows.has(row.row_number);
                const overriddenName = parentNameOverrides[email];
                const parentRes = row.parent_resolution
                  ? parentResolutionLabels[row.parent_resolution]
                  : null;

                return (
                  <TableRow
                    key={row.row_number}
                    className={
                      row.action === "skip"
                        ? "bg-red-50/60 dark:bg-red-950/10"
                        : hasIssues
                          ? "bg-amber-50/60 dark:bg-amber-950/10"
                          : ""
                    }
                  >
                    {/* Expand toggle */}
                    <TableCell className="px-1">
                      {hasIssues && (
                        <button
                          type="button"
                          className="flex items-center text-muted-foreground hover:text-foreground"
                          onClick={() => toggleExpanded(row.row_number)}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                    </TableCell>

                    {/* Row number */}
                    <TableCell className="px-1 text-center text-xs text-muted-foreground">
                      {row.row_number}
                    </TableCell>

                    {/* Action + Type */}
                    <TableCell className="px-1">
                      <div className="flex flex-col gap-0.5">
                        <Badge variant={badge.variant} className="w-fit text-[10px] px-1.5 py-0">
                          {badge.label}
                        </Badge>
                        <span className={`text-[10px] leading-none ${isMinor ? "text-green-600 dark:text-green-400" : "text-blue-600 dark:text-blue-400"}`}>
                          {isMinor ? "Minor" : "Adult"}
                        </span>
                      </div>
                    </TableCell>

                    {/* Rider name (+ email for adults only) */}
                    <TableCell className="overflow-hidden px-2">
                      <div className="truncate">
                        <span className="text-sm font-medium">
                          {row.data.first_name} {row.data.last_name}
                        </span>
                      </div>
                      {!isMinor && (
                        <div className="truncate text-xs text-muted-foreground">
                          {row.data.email}
                        </div>
                      )}
                      {/* Inline expanded issues */}
                      {isExpanded && hasIssues && (
                        <div className="mt-1 space-y-0.5 border-t pt-1">
                          {row.errors.map((e, i) => (
                            <p key={`e-${i}`} className="text-xs text-destructive">{e}</p>
                          ))}
                          {row.warnings.map((w, i) => (
                            <p key={`w-${i}`} className="text-xs text-amber-600 dark:text-amber-400">{w}</p>
                          ))}
                        </div>
                      )}
                    </TableCell>

                    {/* Level */}
                    <TableCell className="overflow-hidden px-2 text-xs">
                      <span className="truncate">
                        {row.riders_level || <span className="text-muted-foreground">-</span>}
                      </span>
                    </TableCell>

                    {/* Parent resolution */}
                    <TableCell className="overflow-hidden px-2">
                      {isMinor && parentRes && (
                        <div>
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className={`shrink-0 text-[10px] px-1.5 py-0 ${parentRes.className}`}>
                              {parentRes.label}
                            </Badge>
                            {row.parent_name_guessed && row.parent_resolution === "new_invite" ? (
                              <Input
                                className="h-6 w-full min-w-0 text-xs"
                                defaultValue={overriddenName ?? row.inferred_parent_name ?? ""}
                                placeholder="Parent name"
                                onBlur={(e) => {
                                  const val = e.target.value.trim();
                                  if (val && val !== row.inferred_parent_name) {
                                    onParentNameChange(email, val);
                                  }
                                }}
                              />
                            ) : (
                              <span className="truncate text-xs text-muted-foreground">
                                {row.inferred_parent_name}
                              </span>
                            )}
                          </div>
                          <div className="truncate text-xs text-muted-foreground mt-0.5">
                            {row.data.email}
                          </div>
                        </div>
                      )}
                    </TableCell>

                    {/* Medical */}
                    <TableCell className="px-1 text-center">
                      {row.has_medical && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span><ShieldAlert className="mx-auto h-3.5 w-3.5 text-amber-500" /></span>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-xs">
                            <p className="text-xs">{row.data.medical || "Has medical condition"}</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </TableCell>

                    {/* Media opt-out */}
                    <TableCell className="px-1 text-center">
                      {row.media_opt_out && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span><CameraOff className="mx-auto h-3.5 w-3.5 text-red-500" /></span>
                          </TooltipTrigger>
                          <TooltipContent>Media opt-out</TooltipContent>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TooltipProvider>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        {filtered.length === rows.length
          ? `${rows.length} rows`
          : `Showing ${filtered.length} of ${rows.length} rows`}
        {" · "}Click <ChevronRight className="inline h-3 w-3" /> to expand issues
      </p>
    </div>
  );
}

function FilterTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
