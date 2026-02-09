"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  useAddRiderAdultLink,
  useRemoveRiderAdultLink,
  useUpdateRiderAdultLink,
  type AdminRider,
  type RiderParentRelationship,
} from "@/hooks/use-admin-riders";
import type { Profile } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const RELATIONSHIP_OPTIONS: {
  value: RiderParentRelationship;
  label: string;
}[] = [
  { value: "parent", label: "Parent" },
  { value: "guardian", label: "Guardian" },
  { value: "emergency_contact", label: "Emergency Contact" },
];

interface RiderAdultLinksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rider: AdminRider | null;
  adults: Profile[] | undefined;
}

export function RiderAdultLinksDialog({
  open,
  onOpenChange,
  rider,
  adults,
}: RiderAdultLinksDialogProps) {
  const addLink = useAddRiderAdultLink();
  const updateLink = useUpdateRiderAdultLink();
  const removeLink = useRemoveRiderAdultLink();

  const [selectedAdultId, setSelectedAdultId] = useState("");
  const [newRelationship, setNewRelationship] =
    useState<RiderParentRelationship>("parent");
  const [newIsPrimary, setNewIsPrimary] = useState(false);
  const [busyAdultId, setBusyAdultId] = useState<string | null>(null);

  const linkedAdultIds = useMemo(
    () => new Set((rider?.parents ?? []).map((p) => p.id)),
    [rider?.parents],
  );

  const availableAdults = useMemo(
    () => (adults ?? []).filter((adult) => !linkedAdultIds.has(adult.id)),
    [adults, linkedAdultIds],
  );

  useEffect(() => {
    if (!open) return;
    setSelectedAdultId("");
    setNewRelationship("parent");
    setNewIsPrimary(false);
    setBusyAdultId(null);
  }, [open, rider?.id]);

  async function handleAddLink() {
    if (!rider) return;
    if (!selectedAdultId) {
      toast.error("Select an adult to link");
      return;
    }

    try {
      await addLink.mutateAsync({
        riderId: rider.id,
        adultId: selectedAdultId,
        relationship: newRelationship,
        isPrimary: newIsPrimary,
      });
      toast.success("Adult linked");
      setSelectedAdultId("");
      setNewRelationship("parent");
      setNewIsPrimary(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add link");
    }
  }

  async function handleUpdateLink(
    adultId: string,
    values: {
      relationship: RiderParentRelationship;
      is_primary: boolean;
    },
  ) {
    if (!rider) return;
    setBusyAdultId(adultId);

    try {
      await updateLink.mutateAsync({
        riderId: rider.id,
        adultId,
        relationship: values.relationship,
        isPrimary: values.is_primary,
      });
      toast.success("Link updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update link");
    } finally {
      setBusyAdultId(null);
    }
  }

  async function handleRemoveLink(adultId: string) {
    if (!rider) return;
    setBusyAdultId(adultId);

    try {
      await removeLink.mutateAsync({ riderId: rider.id, adultId });
      toast.success("Link removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove link");
    } finally {
      setBusyAdultId(null);
    }
  }

  const addingIsDisabled = addLink.isPending || !selectedAdultId;
  const hasAnyPrimary = (rider?.parents ?? []).some((p) => p.is_primary);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage Adult Links</DialogTitle>
          <DialogDescription>
            {rider
              ? `Update which adults are linked to ${rider.first_name} ${rider.last_name}.`
              : "Select a rider to manage links."}
          </DialogDescription>
        </DialogHeader>

        {!rider ? null : (
          <div className="space-y-5">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Linked Adults</h3>
              {rider.parents.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  No adults linked yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {rider.parents.map((parent) => {
                    const disabled = busyAdultId === parent.id;
                    const preventTurningOffPrimary =
                      parent.is_primary &&
                      rider.parents.some((p) => p.id !== parent.id);

                    return (
                      <div
                        key={parent.id}
                        className="space-y-3 rounded-md border p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {parent.full_name}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {parent.email ?? "No email"}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            disabled={disabled}
                            onClick={() => handleRemoveLink(parent.id)}
                            aria-label={`Remove ${parent.full_name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                          <div className="min-w-0 space-y-1.5">
                            <Label className="text-xs text-muted-foreground">
                              Relationship
                            </Label>
                            <Select
                              value={parent.relationship}
                              disabled={disabled}
                              onValueChange={(value) =>
                                handleUpdateLink(parent.id, {
                                  relationship: value as RiderParentRelationship,
                                  is_primary: parent.is_primary,
                                })
                              }
                            >
                              <SelectTrigger className="w-full min-w-0">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {RELATIONSHIP_OPTIONS.map((option) => (
                                  <SelectItem
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="flex items-center gap-2 pt-5 sm:pt-0">
                            <Switch
                              checked={parent.is_primary}
                              disabled={disabled}
                              onCheckedChange={(checked) => {
                                if (!checked && preventTurningOffPrimary) return;
                                handleUpdateLink(parent.id, {
                                  relationship: parent.relationship,
                                  is_primary: checked,
                                });
                              }}
                            />
                            <Label className="text-xs text-muted-foreground">
                              Primary
                            </Label>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {hasAnyPrimary ? null : (
                <p className="text-xs text-amber-600">
                  Set one linked adult as primary contact.
                </p>
              )}
            </div>

            <div className="space-y-3 rounded-md border p-3">
              <h3 className="text-sm font-semibold">Add Adult Link</h3>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="min-w-0 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Adult</Label>
                  <Select
                    value={selectedAdultId}
                    onValueChange={setSelectedAdultId}
                    disabled={addLink.isPending || availableAdults.length === 0}
                  >
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue placeholder="Select adult" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableAdults.map((adult) => (
                        <SelectItem key={adult.id} value={adult.id}>
                          {adult.full_name} ({adult.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="min-w-0 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Relationship
                  </Label>
                  <Select
                    value={newRelationship}
                    onValueChange={(value) =>
                      setNewRelationship(value as RiderParentRelationship)
                    }
                    disabled={addLink.isPending}
                  >
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RELATIONSHIP_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={newIsPrimary}
                    onCheckedChange={setNewIsPrimary}
                    disabled={addLink.isPending}
                  />
                  <Label className="text-xs text-muted-foreground">
                    Set as primary contact
                  </Label>
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={addingIsDisabled}
                  onClick={handleAddLink}
                >
                  Link Adult
                </Button>
              </div>

              {availableAdults.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  All adults are already linked to this rider.
                </p>
              ) : null}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
