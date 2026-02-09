"use client";

import { useEffect, useMemo, useState } from "react";
import { KeyRound, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { useAuth } from "@/hooks/use-auth";
import {
  type MyLinkedRider,
  type RiderParentRelationship,
  useCreateMyRider,
  useMyRiders,
  useRemoveMyRiderLink,
  useUpdateMyRider,
} from "@/hooks/use-my-riders";
import { useGroups } from "@/hooks/use-groups";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SafetyIndicators } from "@/components/safety/safety-indicators";

const relationshipOptions: {
  value: RiderParentRelationship;
  label: string;
}[] = [
  { value: "parent", label: "Parent" },
  { value: "guardian", label: "Guardian" },
  { value: "emergency_contact", label: "Emergency Contact" },
];

export default function ProfilePage() {
  const qc = useQueryClient();
  const { user, profile, loading } = useAuth();
  const { data: groups } = useGroups();
  const { data: riders, isLoading: ridersLoading } = useMyRiders(user?.id);
  const createRider = useCreateMyRider();
  const updateRider = useUpdateMyRider();
  const removeRiderLink = useRemoveMyRiderLink();

  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [email, setEmail] = useState(profile?.email ?? "");
  const [medicalAlerts, setMedicalAlerts] = useState(profile?.medical_alerts ?? "");
  const [mediaOptOut, setMediaOptOut] = useState(profile?.media_opt_out ?? false);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [isSavingSafety, setIsSavingSafety] = useState(false);
  const [editingRiderId, setEditingRiderId] = useState<string | null>(null);
  const [isRegisteringPasskey, setIsRegisteringPasskey] = useState(false);
  const [passkeyName, setPasskeyName] = useState("");
  const [passkeys, setPasskeys] = useState<
    {
      id: string;
      name: string | null;
      device_type: string | null;
      backed_up: boolean;
      created_at: string;
      last_used_at: string | null;
    }[]
  >([]);
  const [isLoadingPasskeys, setIsLoadingPasskeys] = useState(false);
  const [isSavingPasskey, setIsSavingPasskey] = useState<string | null>(null);
  const [allowOverwritePasskey, setAllowOverwritePasskey] = useState(false);

  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newDob, setNewDob] = useState("");
  const [newRelationship, setNewRelationship] =
    useState<RiderParentRelationship>("parent");
  const [newIsPrimary, setNewIsPrimary] = useState(true);
  const [newGroupId, setNewGroupId] = useState("");
  const [newMedicalAlerts, setNewMedicalAlerts] = useState("");
  const [newMediaOptOut, setNewMediaOptOut] = useState(false);

  useEffect(() => {
    if (profile?.full_name) {
      setFullName(profile.full_name);
    }
    if (profile?.email) {
      setEmail(profile.email);
    }
    setMedicalAlerts(profile?.medical_alerts ?? "");
    setMediaOptOut(profile?.media_opt_out ?? false);
  }, [profile?.full_name, profile?.email, profile?.medical_alerts, profile?.media_opt_out]);

  useEffect(() => {
    if (user) {
      void loadPasskeys();
    }
  }, [user]);

  const canEditName = useMemo(
    () => profile && fullName.trim().length > 0 && fullName.trim() !== profile.full_name,
    [fullName, profile],
  );
  const canEditEmail = useMemo(
    () =>
      profile &&
      email.trim().length > 0 &&
      email.trim().toLowerCase() !== profile.email.toLowerCase(),
    [email, profile],
  );
  const canEditSafety = useMemo(
    () =>
      profile &&
      (medicalAlerts.trim() !== (profile.medical_alerts ?? "") ||
        mediaOptOut !== profile.media_opt_out),
    [medicalAlerts, mediaOptOut, profile],
  );

  async function handleSaveName() {
    if (!canEditName) return;
    setIsSavingName(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to update name");
      }
      toast.success("Name updated");
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update name");
    } finally {
      setIsSavingName(false);
    }
  }

  async function handleSaveEmail() {
    if (!canEditEmail) return;
    setIsSavingEmail(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to update email");
      }
      toast.success("Email updated");
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update email");
    } finally {
      setIsSavingEmail(false);
    }
  }

  async function handleSaveSafety() {
    if (!profile) return;
    setIsSavingSafety(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medical_alerts: medicalAlerts,
          media_opt_out: mediaOptOut,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to update safety preferences");
      }
      toast.success("Safety preferences updated");
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update safety preferences",
      );
    } finally {
      setIsSavingSafety(false);
    }
  }

  async function handlePasskeyRegister() {
    setIsRegisteringPasskey(true);
    try {
      const overwriteParam = allowOverwritePasskey ? "?overwrite=1" : "";
      const optionsRes = await fetch(`/api/auth/passkey/register${overwriteParam}`);
      if (!optionsRes.ok) throw new Error("Failed to get registration options");
      const options = await optionsRes.json();

      const credential = await startRegistration({ optionsJSON: options });

      const verifyRes = await fetch("/api/auth/passkey/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credential,
          passkeyName: passkeyName.trim() || null,
          allowOverwrite: allowOverwritePasskey,
        }),
      });

      if (!verifyRes.ok) {
        const data = await verifyRes.json();
        throw new Error(data.error || "Registration failed");
      }

      toast.success("Passkey registered");
      setPasskeyName("");
      await loadPasskeys();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Passkey registration failed";
      if (!message.includes("ceremony was cancelled") && !message.includes("AbortError")) {
        toast.error(message);
      }
    } finally {
      setIsRegisteringPasskey(false);
    }
  }

  async function loadPasskeys() {
    if (!user) return;
    setIsLoadingPasskeys(true);
    try {
      const res = await fetch("/api/passkeys");
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to load passkeys");
      }
      const data = await res.json();
      setPasskeys(Array.isArray(data.passkeys) ? data.passkeys : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load passkeys");
    } finally {
      setIsLoadingPasskeys(false);
    }
  }

  async function handleSavePasskeyName(id: string, name: string) {
    setIsSavingPasskey(id);
    try {
      const res = await fetch("/api/passkeys", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to update passkey");
      }
      toast.success("Passkey updated");
      await loadPasskeys();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update passkey");
    } finally {
      setIsSavingPasskey(null);
    }
  }

  async function handleRemovePasskey(id: string) {
    const confirmed = window.confirm(
      "Remove this passkey? You will no longer be able to sign in with it.",
    );
    if (!confirmed) return;
    setIsSavingPasskey(id);
    try {
      const res = await fetch("/api/passkeys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to remove passkey");
      }
      toast.success("Passkey removed");
      await loadPasskeys();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove passkey");
    } finally {
      setIsSavingPasskey(null);
    }
  }

  async function handleAddRider() {
    if (!newFirstName.trim() || !newLastName.trim()) {
      toast.error("First and last name are required");
      return;
    }
    try {
      await createRider.mutateAsync({
        first_name: newFirstName.trim(),
        last_name: newLastName.trim(),
        date_of_birth: newDob || undefined,
        group_id: newGroupId || undefined,
        relationship: newRelationship,
        is_primary: newIsPrimary,
        medical_alerts: newMedicalAlerts,
        media_opt_out: newMediaOptOut,
      });
      toast.success("Youth rider added");
      setNewFirstName("");
      setNewLastName("");
      setNewDob("");
      setNewRelationship("parent");
      setNewIsPrimary(true);
      setNewGroupId("");
      setNewMedicalAlerts("");
      setNewMediaOptOut(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add rider");
    }
  }

  async function handleSaveRider(rider: MyLinkedRider, values: {
    first_name: string;
    last_name: string;
    date_of_birth: string;
    medical_alerts: string;
    media_opt_out: boolean;
    relationship: RiderParentRelationship;
    is_primary: boolean;
  }) {
    try {
      await updateRider.mutateAsync({
        rider_id: rider.rider_id,
        first_name: values.first_name,
        last_name: values.last_name,
        date_of_birth: values.date_of_birth || undefined,
        relationship: values.relationship,
        is_primary: values.is_primary,
        medical_alerts: values.medical_alerts,
        media_opt_out: values.media_opt_out,
      });
      toast.success("Youth connection updated");
      setEditingRiderId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update rider");
    }
  }

  async function handleRemoveLink(riderId: string) {
    try {
      await removeRiderLink.mutateAsync(riderId);
      toast.success("Youth connection removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove connection");
    }
  }

  const initials = profile?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) ?? "?";

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Profile</h1>
          <p className="text-muted-foreground">Manage your account</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-12 text-muted-foreground">
            Loading...
          </div>
        ) : profile ? (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarFallback className="bg-primary/10 text-primary text-xl">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <span>{profile.full_name}</span>
                      <SafetyIndicators
                        medicalAlerts={profile.medical_alerts}
                        mediaOptOut={profile.media_opt_out}
                      />
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">{profile.email}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <p className="text-sm font-medium">Profile</p>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <div className="space-y-1.5">
                      <Label htmlFor="full-name">Full Name</Label>
                      <Input
                        id="full-name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Your full name"
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleSaveName}
                      disabled={!canEditName || isSavingName}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {isSavingName ? "Saving..." : "Save Name"}
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <div className="space-y-1.5">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Your email"
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleSaveEmail}
                      disabled={!canEditEmail || isSavingEmail}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {isSavingEmail ? "Saving..." : "Save Email"}
                    </Button>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="medical-alerts">Medical Alerts</Label>
                    <Textarea
                      id="medical-alerts"
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
                      disabled={!canEditSafety || isSavingSafety}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {isSavingSafety ? "Saving..." : "Save Safety"}
                    </Button>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Passkeys</p>
                      <p className="text-sm text-muted-foreground">
                        Add a passkey for faster sign-in on this device.
                      </p>
                    </div>
                    <div className="mt-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="passkey-name">Passkey name (optional)</Label>
                        <Input
                          id="passkey-name"
                          value={passkeyName}
                          onChange={(e) => setPasskeyName(e.target.value)}
                          placeholder="e.g. MacBook Touch ID"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handlePasskeyRegister}
                        disabled={isRegisteringPasskey}
                        className="mt-3"
                      >
                        {isRegisteringPasskey ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <KeyRound className="mr-2 h-4 w-4" />
                        )}
                        {isRegisteringPasskey ? "Registering..." : "Register passkey"}
                      </Button>
                      {process.env.NEXT_PUBLIC_WEBAUTHN_ALLOW_OVERWRITE_DEV === "true" && (
                        <div className="mt-3 flex items-center gap-2">
                          <Switch
                            checked={allowOverwritePasskey}
                            onCheckedChange={setAllowOverwritePasskey}
                          />
                          <Label>Allow overwrite (dev)</Label>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 space-y-3">
                      <p className="text-sm font-medium">Registered passkeys</p>
                      {isLoadingPasskeys ? (
                        <p className="text-sm text-muted-foreground">Loading passkeys...</p>
                      ) : passkeys.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No passkeys yet.</p>
                      ) : (
                        <div className="space-y-3">
                          {passkeys.map((passkey) => (
                            <PasskeyRow
                              key={passkey.id}
                              passkey={passkey}
                              isSaving={isSavingPasskey === passkey.id}
                              onSave={handleSavePasskeyName}
                              onRemove={handleRemovePasskey}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Roles</p>
                  <div className="flex flex-wrap gap-2">
                    {profile.roles.map((role) => (
                      <Badge key={role} variant="secondary">
                        {role.replace("_", " ")}
                      </Badge>
                    ))}
                    {profile.roles.length === 0 && (
                      <span className="text-sm text-muted-foreground">No roles assigned</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {profile.roles.includes("parent") && (
              <Card>
                <CardHeader>
                  <CardTitle>Youth Connections</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {ridersLoading ? (
                    <p className="text-sm text-muted-foreground">Loading youth riders...</p>
                  ) : riders && riders.length > 0 ? (
                    <div className="space-y-3">
                      {riders.map((rider) => (
                        <RiderConnectionCard
                          key={rider.rider_id}
                          rider={rider}
                          isEditing={editingRiderId === rider.rider_id}
                          onStartEdit={() => setEditingRiderId(rider.rider_id)}
                          onCancelEdit={() => setEditingRiderId(null)}
                          onSave={handleSaveRider}
                          onRemove={handleRemoveLink}
                          isUpdating={updateRider.isPending || removeRiderLink.isPending}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No youth riders linked yet.
                    </p>
                  )}

                  <div className="rounded-md border p-3">
                    <p className="mb-3 text-sm font-medium">Add Youth Rider</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>First Name</Label>
                        <Input
                          value={newFirstName}
                          onChange={(e) => setNewFirstName(e.target.value)}
                          placeholder="First name"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Last Name</Label>
                        <Input
                          value={newLastName}
                          onChange={(e) => setNewLastName(e.target.value)}
                          placeholder="Last name"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Date of Birth</Label>
                        <Input
                          type="date"
                          value={newDob}
                          onChange={(e) => setNewDob(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Group (optional)</Label>
                        <Select value={newGroupId} onValueChange={setNewGroupId}>
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
                          value={newRelationship}
                          onValueChange={(value) =>
                            setNewRelationship(value as RiderParentRelationship)
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
                      <div className="flex items-end">
                        <div className="flex items-center gap-2 pb-2">
                          <Switch
                            checked={newIsPrimary}
                            onCheckedChange={setNewIsPrimary}
                          />
                          <Label>Primary contact</Label>
                        </div>
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label>Medical Alerts</Label>
                        <Textarea
                          value={newMedicalAlerts}
                          onChange={(e) => setNewMedicalAlerts(e.target.value)}
                          placeholder="Allergies, medications, emergency considerations..."
                        />
                      </div>
                      <div className="flex items-end">
                        <div className="flex items-center gap-2 pb-2">
                          <Switch
                            checked={newMediaOptOut}
                            onCheckedChange={setNewMediaOptOut}
                          />
                          <Label>Media opt-out</Label>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Button
                        type="button"
                        onClick={handleAddRider}
                        disabled={createRider.isPending}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        {createRider.isPending ? "Adding..." : "Add Youth Rider"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

function PasskeyRow({
  passkey,
  isSaving,
  onSave,
  onRemove,
}: {
  passkey: {
    id: string;
    name: string | null;
    device_type: string | null;
    backed_up: boolean;
    created_at: string;
    last_used_at: string | null;
  };
  isSaving: boolean;
  onSave: (id: string, name: string) => void;
  onRemove: (id: string) => void;
}) {
  const [name, setName] = useState(passkey.name ?? "");
  const createdAt = new Date(passkey.created_at).toLocaleString();
  const lastUsedAt = passkey.last_used_at
    ? new Date(passkey.last_used_at).toLocaleString()
    : null;

  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="text-sm font-medium">
            {passkey.name?.trim() ? passkey.name : "Unnamed passkey"}
          </p>
          <p className="text-xs text-muted-foreground">
            Created {createdAt}
            {lastUsedAt ? ` • Last used ${lastUsedAt}` : ""}
          </p>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {passkey.device_type ? <span>Type: {passkey.device_type}</span> : null}
            <span>{passkey.backed_up ? "Backed up" : "Not backed up"}</span>
          </div>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
        <div className="space-y-1">
          <Label htmlFor={`passkey-${passkey.id}`}>Name</Label>
          <Input
            id={`passkey-${passkey.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. iPhone Face ID"
          />
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => onSave(passkey.id, name)}
          disabled={isSaving}
        >
          {isSaving ? "Saving..." : "Save name"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onRemove(passkey.id)}
          disabled={isSaving}
        >
          Remove
        </Button>
      </div>
    </div>
  );
}

function RiderConnectionCard({
  rider,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSave,
  onRemove,
  isUpdating,
}: {
  rider: MyLinkedRider;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
      onSave: (
    rider: MyLinkedRider,
    values: {
      first_name: string;
      last_name: string;
      date_of_birth: string;
      medical_alerts: string;
      media_opt_out: boolean;
      relationship: RiderParentRelationship;
      is_primary: boolean;
    },
  ) => Promise<void>;
  onRemove: (riderId: string) => Promise<void>;
  isUpdating: boolean;
}) {
  const [firstName, setFirstName] = useState(rider.first_name);
  const [lastName, setLastName] = useState(rider.last_name);
  const [dob, setDob] = useState(rider.date_of_birth ?? "");
  const [medicalAlerts, setMedicalAlerts] = useState(rider.medical_alerts ?? "");
  const [mediaOptOut, setMediaOptOut] = useState(rider.media_opt_out);
  const [relationship, setRelationship] =
    useState<RiderParentRelationship>(rider.relationship);
  const [isPrimary, setIsPrimary] = useState(rider.is_primary);

  if (!isEditing) {
    return (
      <div className="flex items-start justify-between rounded-md border p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            <span className="inline-flex items-center gap-2">
              <span>
                {rider.first_name} {rider.last_name}
              </span>
              <SafetyIndicators
                medicalAlerts={rider.medical_alerts}
                mediaOptOut={rider.media_opt_out}
              />
            </span>
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {rider.group_name ?? "No group"} · {rider.relationship}
            {rider.is_primary ? " · Primary" : ""}
            {rider.date_of_birth ? ` · DOB ${rider.date_of_birth}` : ""}
            {rider.media_opt_out ? " · Media opt-out" : ""}
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onStartEdit}
            disabled={isUpdating}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRemove(rider.rider_id)}
            disabled={isUpdating}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>First Name</Label>
          <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Last Name</Label>
          <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Date of Birth</Label>
          <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
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
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Medical Alerts</Label>
          <Textarea
            value={medicalAlerts}
            onChange={(e) => setMedicalAlerts(e.target.value)}
            placeholder="Allergies, medications, emergency considerations..."
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch checked={isPrimary} onCheckedChange={setIsPrimary} />
            <Label>Primary contact</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={mediaOptOut} onCheckedChange={setMediaOptOut} />
            <Label>Media opt-out</Label>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onCancelEdit}>
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() =>
              onSave(rider, {
                first_name: firstName.trim(),
                last_name: lastName.trim(),
                date_of_birth: dob,
                medical_alerts: medicalAlerts,
                media_opt_out: mediaOptOut,
                relationship,
                is_primary: isPrimary,
              })
            }
          >
            <Save className="mr-2 h-4 w-4" />
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
