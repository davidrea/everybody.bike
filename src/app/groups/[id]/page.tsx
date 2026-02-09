import { AppShell } from "@/components/layout/app-shell";
import { GroupDetail } from "@/components/groups/group-detail";

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <AppShell>
      <GroupDetail groupId={id} />
    </AppShell>
  );
}
