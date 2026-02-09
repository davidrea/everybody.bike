"use client";

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ROLES, type Profile } from "@/types";
import { useAuth } from "@/hooks/use-auth";
import {
  useAdminUserRiders,
  useCreateAdminUserRider,
  useUnlinkAdminUserRider,
  type RiderParentRelationship,
} from "@/hooks/use-admin-user-riders";
import { useGroups } from "@/hooks/use-groups";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  roll_model: "Roll Model",
  parent: "Parent",
  rider: "Rider",
};

const relationshipOptions: {
  value: RiderParentRelationship;
  label: string;
}[] = [
  { value: "parent", label: "Parent" },
  { value: "guardian", label: "Guardian" },
  { value: "emergency_contact", label: "Emergency Contact" },
];

interface AdultEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: Profile;
  onSubmitName: (fullName: string) => Promise<void>;
  isSavingName: boolean;
  onSubmitRoles: (roles: string[]) => Promise<void>;
  isSavingRoles: boolean;
}

export function AdultEditor({
  open,
  onOpenChange,
  user,
  onSubmitName,
  isSavingName,
  onSubmitRoles,
  isSavingRoles,
}: AdultEditorProps) {
  const { hasRole } = useAuth();
  const isSuperAdmin = hasRole("super_admin");

  const [fullName, setFullName] = useState(user.full_name);
  const [selectedRoles, setSelectedRoles] = useState<string[]>(user.roles);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [groupId, setGroupId] = useState("");
  const [relationship, setRelationship] =
    useState<RiderParentRelationship>("parent");
  const [isPrimary, setIsPrimary] = useState(true);

  const { data: groups } = useGroups();
  const { data: linkedRiders, isLoading: linkedRidersLoading } = useAdminUserRiders(
    open ? user.id : undefined,
  );
  const createRider = useCreateAdminUserRider();
  const unlinkRider = useUnlinkAdminUserRider();

  const canSaveName =
    fullName.trim().length > 0 && fullName.trim() !== user.full_name;

  const canSaveRoles = useMemo(
    () =>
      selectedRoles.length > 0 &&
      JSON.stringify([...selectedRoles].sort()) !==
        JSON.stringify([...user.roles].sort()),
    [selectedRoles, user.roles],
  );

  function toggleRole(role: string) {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  async function handleSaveRoles() {
    try {
      await onSubmitRoles(selectedRoles);
      toast.success("Roles updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update roles");
    }
  }

  async function handleSaveName() {
    try {
      await onSubmitName(fullName.trim());
      toast.success("Name updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update name");
    }
  }

  async function handleCreateChild() {
    if (!firstName.trim() || !lastName.trim() || !groupId) {
      toast.error("First name, last name, and group are required");
      return;
    }

    try {
      await createRider.mutateAsync({
        userId: user.id,
        values: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          date_of_birth: dob || undefined,
          group_id: groupId,
          relationship,
          is_primary: isPrimary,
        },
      });
      toast.success("Child added and linked");
      setFirstName("");
      setLastName("");
      setDob("");
      setGroupId("");
      setRelationship("parent");
      setIsPrimary(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add child");
    }
  }

  async function handleUnlinkRider(riderId: string) {
    try {
      await unlinkRider.mutateAsync({ userId: user.id, riderId });
      toast.success("Child unlinked");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to unlink child");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onOpenChange(false);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit Adult</DialogTitle>
          <DialogDescription>
            {user.full_name} ({user.email})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Profile</h3>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor={`adult-full-name-${user.id}`}>Full Name</Label>
                <Input
                  id={`adult-full-name-${user.id}`}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Full name"
                />
              </div>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveName}
                disabled={!canSaveName || isSavingName}
              >
                {isSavingName ? "Saving..." : "Save Name"}
              </Button>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Roles</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {ROLES.map((role) => {
                const isAdminRole = role === "admin" || role === "super_admin";
                const disabled = isAdminRole && !isSuperAdmin;

                return (
                  <div key={role} className="flex items-center gap-2">
                    <Checkbox
                      id={`role-${user.id}-${role}`}
                      checked={selectedRoles.includes(role)}
                      onCheckedChange={() => toggleRole(role)}
                      disabled={disabled}
                    />
                    <Label
                      htmlFor={`role-${user.id}-${role}`}
                      className={disabled ? "text-muted-foreground" : ""}
                    >
                      {roleLabels[role]}
                      {disabled ? " (super admin only)" : ""}
                    </Label>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                onClick={handleSaveRoles}
                disabled={!canSaveRoles || isSavingRoles}
              >
                {isSavingRoles ? "Saving..." : "Save Roles"}
              </Button>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Linked Children</h3>
            {linkedRidersLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : linkedRiders && linkedRiders.length > 0 ? (
              <div className="space-y-2">
                {linkedRiders.map((rider) => (
                  <div
                    key={rider.rider_id}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {rider.first_name} {rider.last_name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {rider.group_name ?? "No group"} · {rider.relationship}
                        {rider.is_primary ? " · Primary" : ""}
                        {rider.date_of_birth ? ` · DOB ${rider.date_of_birth}` : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleUnlinkRider(rider.rider_id)}
                      disabled={unlinkRider.isPending}
                      aria-label={`Unlink ${rider.first_name} ${rider.last_name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No linked children yet.
              </p>
            )}
          </section>

          <section className="space-y-3 rounded-md border p-3">
            <h3 className="text-sm font-semibold">Add Child</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`child-first-name-${user.id}`}>First Name</Label>
                <Input
                  id={`child-first-name-${user.id}`}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`child-last-name-${user.id}`}>Last Name</Label>
                <Input
                  id={`child-last-name-${user.id}`}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`child-dob-${user.id}`}>Date of Birth</Label>
                <Input
                  id={`child-dob-${user.id}`}
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Group</Label>
                <Select value={groupId} onValueChange={setGroupId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select group" />
                  </SelectTrigger>
                  <SelectContent>
                    {groups?.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Relationship</Label>
                <Select
                  value={relationship}
                  onValueChange={(value) =>
                    setRelationship(value as RiderParentRelationship)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {relationshipOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end pb-2">
                <div className="flex items-center gap-2">
                  <Switch checked={isPrimary} onCheckedChange={setIsPrimary} />
                  <Label>Primary contact</Label>
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleCreateChild}
                disabled={createRider.isPending}
              >
                {createRider.isPending ? "Adding..." : "Add and Link Child"}
              </Button>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
