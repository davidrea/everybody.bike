"use client";

import { useState } from "react";
import { UserPlus, RotateCw, Settings, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  useUsers,
  useInviteUser,
  useResendInvite,
  useUpdateUserRoles,
  useDeleteUser,
  useUpdateUserName,
  useUpdateUserEmail,
  useUpdateUserSafety,
} from "@/hooks/use-users";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InviteForm } from "./invite-form";
import { AdultEditor } from "./adult-editor";
import { SafetyIndicators } from "@/components/safety/safety-indicators";
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
import type { InviteFormValues } from "@/lib/validators";
import type { Profile } from "@/types";

const roleBadgeVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  super_admin: "destructive",
  admin: "default",
  roll_model: "secondary",
  parent: "outline",
  rider: "outline",
};

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  roll_model: "Roll Model",
  parent: "Parent",
  rider: "Rider",
};

export function UserList() {
  const { user: currentUser, hasRole } = useAuth();
  const { data: users, isLoading } = useUsers();
  const inviteUser = useInviteUser();
  const resendInvite = useResendInvite();
  const updateRoles = useUpdateUserRoles();
  const updateName = useUpdateUserName();
  const updateEmail = useUpdateUserEmail();
  const updateSafety = useUpdateUserSafety();
  const deleteUser = useDeleteUser();

  const [showInvite, setShowInvite] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);

  async function handleInvite(values: InviteFormValues) {
    try {
      await inviteUser.mutateAsync(values);
      toast.success("Invite sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send invite");
      throw err;
    }
  }

  async function handleResend(userId: string) {
    try {
      await resendInvite.mutateAsync(userId);
      toast.success("Invite resent");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to resend invite",
      );
    }
  }

  async function handleUpdateRoles(roles: string[]) {
    if (!editingUser) return;
    try {
      await updateRoles.mutateAsync({
        userId: editingUser.id,
        values: { roles: roles as InviteFormValues["roles"] },
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update roles",
      );
      throw err;
    }
  }

  async function handleUpdateName(fullName: string) {
    if (!editingUser) return;
    try {
      await updateName.mutateAsync({
        userId: editingUser.id,
        fullName,
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update name",
      );
      throw err;
    }
  }

  async function handleUpdateEmail(email: string) {
    if (!editingUser) return;
    try {
      await updateEmail.mutateAsync({
        userId: editingUser.id,
        email,
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update email",
      );
      throw err;
    }
  }

  async function handleUpdateSafety(medicalAlerts: string, mediaOptOut: boolean) {
    if (!editingUser) return;
    try {
      await updateSafety.mutateAsync({
        userId: editingUser.id,
        medicalAlerts,
        mediaOptOut,
      });
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to update safety preferences",
      );
      throw err;
    }
  }

  async function handleDeleteUser() {
    if (!deleteTarget) return;
    try {
      await deleteUser.mutateAsync(deleteTarget.id);
      toast.success("User deleted");
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete user");
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setShowInvite(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Invite User
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-28">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users?.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">
                  <span className="inline-flex items-center gap-2">
                    <span>{user.full_name}</span>
                    <SafetyIndicators
                      medicalAlerts={user.medical_alerts}
                      mediaOptOut={user.media_opt_out}
                    />
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {user.email}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {user.roles.map((role) => (
                      <Badge
                        key={role}
                        variant={roleBadgeVariants[role] ?? "secondary"}
                        className="text-xs"
                      >
                        {roleLabels[role] ?? role}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      user.invite_status === "accepted"
                        ? "default"
                        : "secondary"
                    }
                    className="text-xs"
                  >
                    {user.invite_status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingUser(user)}
                      title="Manage adult"
                      aria-label={`Manage ${user.full_name}`}
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(user)}
                      title="Delete user"
                      aria-label={`Delete ${user.full_name}`}
                      disabled={user.id === currentUser?.id}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                    {user.invite_status === "pending" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleResend(user.id)}
                        disabled={resendInvite.isPending}
                        title="Resend invite"
                      >
                        <RotateCw className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {users?.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-muted-foreground"
                >
                  No users yet. Send your first invite.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <InviteForm
        open={showInvite}
        onOpenChange={setShowInvite}
        onSubmit={handleInvite}
        isPending={inviteUser.isPending}
      />

      {editingUser && (
        <AdultEditor
          key={editingUser.id}
          open={!!editingUser}
          onOpenChange={(open) => !open && setEditingUser(null)}
          user={editingUser}
          onSubmitName={handleUpdateName}
          isSavingName={updateName.isPending}
          onSubmitEmail={handleUpdateEmail}
          isSavingEmail={updateEmail.isPending}
          onSubmitSafety={handleUpdateSafety}
          isSavingSafety={updateSafety.isPending}
          onSubmitRoles={handleUpdateRoles}
          isSavingRoles={updateRoles.isPending}
        />
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `Delete ${deleteTarget.full_name}? This removes their account and cannot be undone.`
                : "Delete this user?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteUser.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDeleteUser}
              disabled={
                deleteUser.isPending ||
                (deleteTarget?.roles?.includes("admin") && !hasRole("super_admin")) ||
                (deleteTarget?.roles?.includes("super_admin") &&
                  !hasRole("super_admin"))
              }
            >
              {deleteUser.isPending ? "Deleting..." : "Delete User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
