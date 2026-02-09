"use client";

import { useForm } from "react-hook-form";
import { formResolver } from "@/lib/utils";
import { inviteSchema, type InviteFormValues } from "@/lib/validators";
import { ROLES } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  roll_model: "Roll Model",
  parent: "Parent",
  rider: "Rider",
};

interface InviteFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: InviteFormValues) => Promise<void>;
  isPending: boolean;
}

export function InviteForm({
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: InviteFormProps) {
  const form = useForm<InviteFormValues>({
    resolver: formResolver(inviteSchema),
    defaultValues: {
      full_name: "",
      email: "",
      roles: [],
    },
  });

  async function handleSubmit(values: InviteFormValues) {
    await onSubmit(values);
    form.reset();
    onOpenChange(false);
  }

  // Exclude super_admin from the invite form — can only be set by existing super admins via role editor
  const invitableRoles = ROLES.filter((r) => r !== "super_admin");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite New User</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Jane Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="jane@example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="roles"
              render={() => (
                <FormItem>
                  <FormLabel>Roles</FormLabel>
                  <div className="space-y-2">
                    {invitableRoles.map((role) => (
                      <FormField
                        key={role}
                        control={form.control}
                        name="roles"
                        render={({ field }) => (
                          <FormItem className="flex items-center gap-2 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value?.includes(role)}
                                onCheckedChange={(checked) => {
                                  const current = field.value ?? [];
                                  field.onChange(
                                    checked
                                      ? [...current, role]
                                      : current.filter((r) => r !== role),
                                  );
                                }}
                              />
                            </FormControl>
                            <FormLabel className="font-normal">
                              {roleLabels[role]}
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Sending..." : "Send Invite"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
