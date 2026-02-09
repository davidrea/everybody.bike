"use client";

import { useState, useEffect } from "react";
import { ROLES, type Profile } from "@/types";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  roll_model: "Roll Model",
  parent: "Parent",
  rider: "Rider",
};

interface RoleEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: Profile;
  onSubmit: (roles: string[]) => Promise<void>;
  isPending: boolean;
}

export function RoleEditor({
  open,
  onOpenChange,
  user,
  onSubmit,
  isPending,
}: RoleEditorProps) {
  const { hasRole } = useAuth();
  const isSuperAdmin = hasRole("super_admin");
  const [selectedRoles, setSelectedRoles] = useState<string[]>(user.roles);

  useEffect(() => {
    setSelectedRoles(user.roles);
  }, [user.roles]);

  function toggleRole(role: string) {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  async function handleSave() {
    await onSubmit(selectedRoles);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Roles — {user.full_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {ROLES.map((role) => {
            const isAdminRole = role === "admin" || role === "super_admin";
            const disabled = isAdminRole && !isSuperAdmin;

            return (
              <div key={role} className="flex items-center gap-2">
                <Checkbox
                  id={`role-${role}`}
                  checked={selectedRoles.includes(role)}
                  onCheckedChange={() => toggleRole(role)}
                  disabled={disabled}
                />
                <Label
                  htmlFor={`role-${role}`}
                  className={disabled ? "text-muted-foreground" : ""}
                >
                  {roleLabels[role]}
                  {disabled && " (super admin only)"}
                </Label>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isPending || selectedRoles.length === 0}
          >
            {isPending ? "Saving..." : "Save Roles"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
