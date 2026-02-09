"use client";

import { useState } from "react";
import { UserPlus, RotateCw, Shield } from "lucide-react";
import { toast } from "sonner";
import { useUsers, useInviteUser, useResendInvite, useUpdateUserRoles } from "@/hooks/use-users";
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
import { RoleEditor } from "./role-editor";
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
  const { data: users, isLoading } = useUsers();
  const inviteUser = useInviteUser();
  const resendInvite = useResendInvite();
  const updateRoles = useUpdateUserRoles();

  const [showInvite, setShowInvite] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);

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
      toast.success("Roles updated");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update roles",
      );
      throw err;
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
                <TableCell className="font-medium">{user.full_name}</TableCell>
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
                      title="Edit roles"
                    >
                      <Shield className="h-4 w-4" />
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
        <RoleEditor
          open={!!editingUser}
          onOpenChange={(open) => !open && setEditingUser(null)}
          user={editingUser}
          onSubmit={handleUpdateRoles}
          isPending={updateRoles.isPending}
        />
      )}
    </>
  );
}
