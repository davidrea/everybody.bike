"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface RecurringEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: "edit" | "delete";
  onSingle: () => void;
  onSeries: () => void;
}

export function RecurringEditDialog({
  open,
  onOpenChange,
  action,
  onSingle,
  onSeries,
}: RecurringEditDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {action === "edit"
              ? "Edit recurring event"
              : "Delete recurring event"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            This event is part of a recurring series. Would you like to{" "}
            {action === "edit" ? "edit" : "delete"} just this event, or all
            future events in the series?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onSingle}
            variant="outline"
          >
            This event only
          </AlertDialogAction>
          <AlertDialogAction onClick={onSeries}>
            All future events
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
