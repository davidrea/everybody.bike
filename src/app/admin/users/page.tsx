import { AppShell } from "@/components/layout/app-shell";
import { PeopleTabsClient } from "@/components/admin/people-tabs";

export default function AdminUsersPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            People Management
          </h1>
          <p className="text-muted-foreground">
            Manage adults, minor riders, roles, and invitations
          </p>
        </div>
        <PeopleTabsClient />
      </div>
    </AppShell>
  );
}
