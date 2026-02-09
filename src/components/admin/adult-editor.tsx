"use client";

import { useMemo, useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ROLES, type Profile } from "@/types";
import { useAuth } from "@/hooks/use-auth";
import {
  type AdminUserLinkedRider,
  useAdminUserRiders,
  useCreateAdminUserRider,
  useUnlinkAdminUserRider,
  useUpdateAdminUserRider,
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
import { Textarea } from "@/components/ui/textarea";
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
  onSubmitEmail: (email: string) => Promise<void>;
  isSavingEmail: boolean;
  onSubmitSafety: (medicalAlerts: string, mediaOptOut: boolean) => Promise<void>;
  isSavingSafety: boolean;
  onSubmitRoles: (roles: string[]) => Promise<void>;
  isSavingRoles: boolean;
}

export function AdultEditor({
  open,
  onOpenChange,
  user,
  onSubmitName,
  isSavingName,
  onSubmitEmail,
  isSavingEmail,
  onSubmitSafety,
  isSavingSafety,
  onSubmitRoles,
  isSavingRoles,
}: AdultEditorProps) {
  const { hasRole } = useAuth();
  const isSuperAdmin = hasRole("super_admin");

  const [fullName, setFullName] = useState(user.full_name);
  const [email, setEmail] = useState(user.email);
  const [medicalAlerts, setMedicalAlerts] = useState(user.medical_alerts ?? "");
  const [mediaOptOut, setMediaOptOut] = useState(user.media_opt_out ?? false);
  const [selectedRoles, setSelectedRoles] = useState<string[]>(user.roles);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [groupId, setGroupId] = useState("");
  const [relationship, setRelationship] =
    useState<RiderParentRelationship>("parent");
  const [isPrimary, setIsPrimary] = useState(true);
  const [childMedicalAlerts, setChildMedicalAlerts] = useState("");
  const [childMediaOptOut, setChildMediaOptOut] = useState(false);

  const { data: groups } = useGroups();
  const { data: linkedRiders, isLoading: linkedRidersLoading } = useAdminUserRiders(
    open ? user.id : undefined,
  );
  const createRider = useCreateAdminUserRider();
  const updateRider = useUpdateAdminUserRider();
  const unlinkRider = useUnlinkAdminUserRider();

  const canSaveName =
    fullName.trim().length > 0 && fullName.trim() !== user.full_name;
  const canSaveEmail =
    email.trim().length > 0 &&
    email.trim().toLowerCase() !== user.email.toLowerCase();
  const canSaveSafety =
    medicalAlerts.trim() !== (user.medical_alerts ?? "") ||
    mediaOptOut !== (user.media_opt_out ?? false);

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

  async function handleSaveEmail() {
    try {
      await onSubmitEmail(email.trim().toLowerCase());
      toast.success("Email updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update email");
    }
  }

  async function handleSaveSafety() {
    try {
      await onSubmitSafety(medicalAlerts, mediaOptOut);
      toast.success("Safety preferences updated");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update safety preferences",
      );
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
          medical_alerts: childMedicalAlerts,
          media_opt_out: childMediaOptOut,
        },
      });
      toast.success("Child added and linked");
      setFirstName("");
      setLastName("");
      setDob("");
      setGroupId("");
      setRelationship("parent");
      setIsPrimary(true);
      setChildMedicalAlerts("");
      setChildMediaOptOut(false);
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
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor={`adult-email-${user.id}`}>Email</Label>
                <Input
                  id={`adult-email-${user.id}`}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                />
              </div>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveEmail}
                disabled={!canSaveEmail || isSavingEmail}
              >
                {isSavingEmail ? "Saving..." : "Save Email"}
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`adult-medical-alerts-${user.id}`}>Medical Alerts</Label>
              <Textarea
                id={`adult-medical-alerts-${user.id}`}
                value={medicalAlerts}
                onChange={(e) => setMedicalAlerts(e.target.value)}
                placeholder="Allergies, medications, emergency considerations..."
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch checked={mediaOptOut} onCheckedChange={setMediaOptOut} />
                <Label>Media opt-out</Label>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveSafety}
                disabled={!canSaveSafety || isSavingSafety}
              >
                {isSavingSafety ? "Saving..." : "Save Safety"}
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
                  <AdminRiderSafetyCard
                    key={`${rider.rider_id}-${rider.medical_alerts ?? ""}-${rider.media_opt_out}`}
                    rider={rider}
                    userId={user.id}
                    onUnlink={handleUnlinkRider}
                    onSave={async (values) => {
                      await updateRider.mutateAsync({
                        userId: user.id,
                        values,
                      });
                    }}
                    isBusy={unlinkRider.isPending || updateRider.isPending}
                  />
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
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Medical Alerts</Label>
                <Textarea
                  value={childMedicalAlerts}
                  onChange={(e) => setChildMedicalAlerts(e.target.value)}
                  placeholder="Allergies, medications, emergency considerations..."
                />
              </div>
              <div className="flex items-end pb-2">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={childMediaOptOut}
                    onCheckedChange={setChildMediaOptOut}
                  />
                  <Label>Media opt-out</Label>
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

function AdminRiderSafetyCard({
  rider,
  userId,
  onSave,
  onUnlink,
  isBusy,
}: {
  rider: AdminUserLinkedRider;
  userId: string;
  onSave: (values: {
    rider_id: string;
    first_name: string;
    last_name: string;
    date_of_birth?: string;
    medical_alerts?: string;
    media_opt_out: boolean;
    relationship: RiderParentRelationship;
    is_primary: boolean;
  }) => Promise<void>;
  onUnlink: (riderId: string) => Promise<void>;
  isBusy: boolean;
}) {
  const [medicalAlerts, setMedicalAlerts] = useState(rider.medical_alerts ?? "");
  const [mediaOptOut, setMediaOptOut] = useState(rider.media_opt_out);

  const canSave =
    medicalAlerts !== (rider.medical_alerts ?? "") ||
    mediaOptOut !== rider.media_opt_out;

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-start justify-between gap-3">
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
          onClick={() => onUnlink(rider.rider_id)}
          disabled={isBusy}
          aria-label={`Unlink ${rider.first_name} ${rider.last_name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`admin-rider-medical-${userId}-${rider.rider_id}`}>
          Medical Alerts
        </Label>
        <Textarea
          id={`admin-rider-medical-${userId}-${rider.rider_id}`}
          value={medicalAlerts}
          onChange={(e) => setMedicalAlerts(e.target.value)}
          placeholder="Allergies, medications, emergency considerations..."
        />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch checked={mediaOptOut} onCheckedChange={setMediaOptOut} />
          <Label>Media opt-out</Label>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() =>
            onSave({
              rider_id: rider.rider_id,
              first_name: rider.first_name,
              last_name: rider.last_name,
              date_of_birth: rider.date_of_birth ?? undefined,
              medical_alerts: medicalAlerts,
              media_opt_out: mediaOptOut,
              relationship: rider.relationship,
              is_primary: rider.is_primary,
            }).then(() => toast.success("Child safety updated"))
          }
          disabled={!canSave || isBusy}
        >
          <Save className="mr-2 h-4 w-4" />
          Save
        </Button>
      </div>
    </div>
  );
}
