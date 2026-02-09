"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CsvPreviewRow } from "@/types";

const actionBadges: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  create: { variant: "default", label: "Create" },
  update: { variant: "secondary", label: "Update" },
  skip: { variant: "destructive", label: "Skip" },
};

export function CsvPreviewTable({
  rows,
  columns,
}: {
  rows: CsvPreviewRow[];
  columns: string[];
}) {
  return (
    <div className="max-h-96 overflow-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Row</TableHead>
            <TableHead className="w-20">Action</TableHead>
            {columns.map((col) => (
              <TableHead key={col} className="capitalize">
                {col.replace(/_/g, " ")}
              </TableHead>
            ))}
            <TableHead>Errors</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const badge = actionBadges[row.action];
            return (
              <TableRow
                key={row.row_number}
                className={row.errors.length > 0 ? "bg-red-50 dark:bg-red-950/20" : ""}
              >
                <TableCell className="text-xs">{row.row_number}</TableCell>
                <TableCell>
                  <Badge variant={badge.variant} className="text-xs">
                    {badge.label}
                  </Badge>
                </TableCell>
                {columns.map((col) => (
                  <TableCell key={col} className="text-sm">
                    {row.data[col] ?? ""}
                  </TableCell>
                ))}
                <TableCell>
                  {row.errors.length > 0 && (
                    <ul className="list-inside list-disc text-xs text-destructive">
                      {row.errors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
