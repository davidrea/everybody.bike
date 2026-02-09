import { AppShell } from "@/components/layout/app-shell";
import { GroupList } from "@/components/groups/group-list";

export default function GroupsPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Groups</h1>
          <p className="text-muted-foreground">Rider groups and assignments</p>
        </div>
        <GroupList />
      </div>
    </AppShell>
  );
}
