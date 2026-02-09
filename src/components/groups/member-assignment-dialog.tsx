"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAssignMember } from "@/hooks/use-groups";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface MemberOption {
  id: string;
  name: string;
}

interface MemberAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  type: "rider" | "adult_rider" | "roll_model";
  existingIds: string[];
}

const typeLabels = {
  rider: "Minor Rider",
  adult_rider: "Adult Rider",
  roll_model: "Roll Model",
} as const;

export function MemberAssignmentDialog({
  open,
  onOpenChange,
  groupId,
  type,
  existingIds,
}: MemberAssignmentDialogProps) {
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(false);
  const assignMember = useAssignMember();

  useEffect(() => {
    if (!open) return;
    setSearch("");
    loadOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, type]);

  async function loadOptions() {
    setLoading(true);
    const supabase = createClient();

    if (type === "rider") {
      const { data } = await supabase
        .from("riders")
        .select("id, first_name, last_name")
        .order("last_name");
      setOptions(
        (data ?? [])
          .filter((r) => !existingIds.includes(r.id))
          .map((r) => ({ id: r.id, name: `${r.first_name} ${r.last_name}` })),
      );
    } else if (type === "adult_rider") {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .contains("roles", ["rider"])
        .order("full_name");
      setOptions(
        (data ?? [])
          .filter((p) => !existingIds.includes(p.id))
          .map((p) => ({ id: p.id, name: p.full_name })),
      );
    } else {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .contains("roles", ["roll_model"])
        .order("full_name");
      setOptions(
        (data ?? [])
          .filter((p) => !existingIds.includes(p.id))
          .map((p) => ({ id: p.id, name: p.full_name })),
      );
    }
    setLoading(false);
  }

  const filtered = options.filter((o) =>
    o.name.toLowerCase().includes(search.toLowerCase()),
  );

  async function handleAssign(memberId: string) {
    try {
      await assignMember.mutateAsync({ groupId, type, memberId });
      toast.success("Member assigned");
      setOptions((prev) => prev.filter((o) => o.id !== memberId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add {typeLabels[type]}</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {loading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Loading...
            </p>
          ) : filtered.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No available {typeLabels[type].toLowerCase()}s found
            </p>
          ) : (
            filtered.map((option) => (
              <div
                key={option.id}
                className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted"
              >
                <span className="text-sm">{option.name}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAssign(option.id)}
                  disabled={assignMember.isPending}
                >
                  Add
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
