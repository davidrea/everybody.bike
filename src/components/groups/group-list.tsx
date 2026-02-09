"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useGroups, useCreateGroup } from "@/hooks/use-groups";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { GroupForm } from "./group-form";
import type { GroupFormValues } from "@/lib/validators";

export function GroupList() {
  const { data: groups, isLoading } = useGroups();
  const { isAdmin } = useAuth();
  const createGroup = useCreateGroup();
  const [showCreate, setShowCreate] = useState(false);

  async function handleCreate(values: GroupFormValues) {
    try {
      await createGroup.mutateAsync(values);
      toast.success("Group created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create group");
      throw err;
    }
  }

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  return (
    <>
      {isAdmin() && (
        <div className="flex justify-end">
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Group
          </Button>
        </div>
      )}

      {groups && groups.length === 0 ? (
        <div className="flex items-center justify-center rounded-lg border border-dashed p-12 text-muted-foreground">
          No groups yet. {isAdmin() && "Create your first group above."}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {groups?.map((group) => (
            <Link key={group.id} href={`/groups/${group.id}`}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                  <div
                    className="h-4 w-4 rounded-full"
                    style={{ backgroundColor: group.color }}
                  />
                  <CardTitle className="text-lg">{group.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  {group.description && (
                    <p className="mb-2 text-sm text-muted-foreground line-clamp-2">
                      {group.description}
                    </p>
                  )}
                  <Badge variant="secondary" className="text-xs">
                    Order: {group.sort_order}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <GroupForm
        open={showCreate}
        onOpenChange={setShowCreate}
        onSubmit={handleCreate}
        isPending={createGroup.isPending}
      />
    </>
  );
}
