"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useGroup, useUpdateGroup, useDeleteGroup, useRemoveMember } from "@/hooks/use-groups";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { GroupForm } from "./group-form";
import { MemberAssignmentDialog } from "./member-assignment-dialog";
import type { GroupFormValues } from "@/lib/validators";
import Link from "next/link";

export function GroupDetail({ groupId }: { groupId: string }) {
  const { data: group, isLoading } = useGroup(groupId);
  const { isAdmin } = useAuth();
  const updateGroup = useUpdateGroup();
  const deleteGroup = useDeleteGroup();
  const removeMember = useRemoveMember();
  const router = useRouter();

  const [showEdit, setShowEdit] = useState(false);
  const [assignType, setAssignType] = useState<
    "rider" | "adult_rider" | "roll_model" | null
  >(null);

  async function handleUpdate(values: GroupFormValues) {
    try {
      await updateGroup.mutateAsync({ id: groupId, values });
      toast.success("Group updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
      throw err;
    }
  }

  async function handleDelete() {
    try {
      await deleteGroup.mutateAsync(groupId);
      toast.success("Group deleted");
      router.push("/groups");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  async function handleRemove(
    type: "rider" | "adult_rider" | "roll_model",
    memberId: string,
  ) {
    try {
      await removeMember.mutateAsync({ groupId, type, memberId });
      toast.success("Member removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!group) {
    return <p className="text-muted-foreground">Group not found.</p>;
  }

  const admin = isAdmin();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <Link
            href="/groups"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            All Groups
          </Link>
          <div className="flex items-center gap-3">
            <div
              className="h-5 w-5 rounded-full"
              style={{ backgroundColor: group.color }}
            />
            <h1 className="font-heading text-3xl font-bold tracking-tight">
              {group.name}
            </h1>
          </div>
          {group.description && (
            <p className="text-muted-foreground">{group.description}</p>
          )}
        </div>
        {admin && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEdit(true)}
            >
              <Pencil className="mr-1 h-4 w-4" />
              Edit
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="mr-1 h-4 w-4" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete group?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove the group. Members will be unassigned. This
                    action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      <Tabs defaultValue="riders">
        <TabsList>
          <TabsTrigger value="riders">
            Riders
            <Badge variant="secondary" className="ml-2">
              {group.riders.length + group.adult_riders.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="roll_models">
            Roll Models
            <Badge variant="secondary" className="ml-2">
              {group.roll_models.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="riders" className="space-y-4">
          {admin && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAssignType("rider")}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add Minor Rider
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAssignType("adult_rider")}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add Adult Rider
              </Button>
            </div>
          )}

          {group.riders.length + group.adult_riders.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No riders assigned to this group yet.
            </p>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Minor Riders</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {group.riders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None</p>
                ) : (
                  group.riders.map((rider) => (
                    <div
                      key={rider.id}
                      className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted"
                    >
                      <span className="text-sm">
                        {rider.first_name} {rider.last_name}
                      </span>
                      {admin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemove("rider", rider.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
              <CardHeader>
                <CardTitle className="text-base">Adult Riders</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {group.adult_riders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None</p>
                ) : (
                  group.adult_riders.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted"
                    >
                      <div>
                        <span className="text-sm">{p.full_name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {p.email}
                        </span>
                      </div>
                      {admin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemove("adult_rider", p.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="roll_models" className="space-y-4">
          {admin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAssignType("roll_model")}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add Roll Model
            </Button>
          )}

          {group.roll_models.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No roll models assigned to this group yet.
            </p>
          ) : (
            <Card>
              <CardContent className="space-y-2 pt-4">
                {group.roll_models.map((rm) => (
                  <div
                    key={rm.id}
                    className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted"
                  >
                    <div>
                      <span className="text-sm">{rm.full_name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {rm.email}
                      </span>
                    </div>
                    {admin && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemove("roll_model", rm.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {group && showEdit && (
        <GroupForm
          open={showEdit}
          onOpenChange={setShowEdit}
          group={group}
          onSubmit={handleUpdate}
          isPending={updateGroup.isPending}
        />
      )}

      {assignType && (
        <MemberAssignmentDialog
          open={!!assignType}
          onOpenChange={(open) => !open && setAssignType(null)}
          groupId={groupId}
          type={assignType}
          existingIds={
            assignType === "rider"
              ? group.riders.map((r) => r.id)
              : assignType === "adult_rider"
                ? group.adult_riders.map((p) => p.id)
                : group.roll_models.map((rm) => rm.id)
          }
        />
      )}
    </div>
  );
}
