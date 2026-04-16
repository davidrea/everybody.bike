"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Plus, GripVertical } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useGroups, useCreateGroup, useReorderGroups } from "@/hooks/use-groups";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GroupForm } from "./group-form";
import type { Group } from "@/types";
import type { GroupFormValues } from "@/lib/validators";

function GroupCard({ group, isDragOverlay }: { group: Group; isDragOverlay?: boolean }) {
  return (
    <Card className={`transition-colors hover:bg-muted/50${isDragOverlay ? " shadow-lg" : ""}`}>
      <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
        <div
          className="h-4 w-4 shrink-0 rounded-full"
          style={{ backgroundColor: group.color }}
        />
        <CardTitle className="text-lg">{group.name}</CardTitle>
      </CardHeader>
      {group.description && (
        <CardContent>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {group.description}
          </p>
        </CardContent>
      )}
    </Card>
  );
}

function SortableGroupCard({ group }: { group: Group }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: group.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-stretch gap-2${isDragging ? " opacity-30" : ""}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="flex items-center px-1 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
        aria-label="Drag to reorder"
        tabIndex={-1}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Link href={`/groups/${group.id}`} className="flex-1 min-w-0">
        <GroupCard group={group} />
      </Link>
    </div>
  );
}

export function GroupList() {
  const { data: groups, isLoading } = useGroups();
  const { isAdmin } = useAuth();
  const createGroup = useCreateGroup();
  const reorderGroups = useReorderGroups();
  const [showCreate, setShowCreate] = useState(false);
  const [localGroups, setLocalGroups] = useState<Group[]>([]);
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  // Prevents server data from overwriting a pending local reorder
  const reorderPending = useRef(false);

  const adminUser = isAdmin();

  // Sync server data into local state whenever it changes and no reorder is in flight
  useEffect(() => {
    if (groups && !reorderPending.current) {
      setLocalGroups(groups);
    }
  }, [groups]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  async function handleCreate(values: GroupFormValues) {
    try {
      await createGroup.mutateAsync(values);
      toast.success("Group created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create group");
      throw err;
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const group = localGroups.find((g) => g.id === event.active.id);
    setActiveGroup(group ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveGroup(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = localGroups.findIndex((g) => g.id === active.id);
    const newIndex = localGroups.findIndex((g) => g.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(localGroups, oldIndex, newIndex);
    // Update local state immediately — no frame gap, no jump
    setLocalGroups(reordered);
    reorderPending.current = true;

    reorderGroups.mutate(reordered.map((g) => g.id), {
      onError: () => {
        reorderPending.current = false;
        setLocalGroups(groups ?? []);
        toast.error("Failed to save group order");
      },
      onSettled: () => {
        reorderPending.current = false;
        // Cache invalidation triggers a refetch; useEffect will sync once it lands
      },
    });
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }

  return (
    <>
      {adminUser && (
        <div className="flex justify-end">
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Group
          </Button>
        </div>
      )}

      {localGroups.length === 0 ? (
        <div className="flex items-center justify-center rounded-lg border border-dashed p-12 text-muted-foreground">
          No groups yet. {adminUser && "Create your first group above."}
        </div>
      ) : adminUser ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={localGroups.map((g) => g.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-2">
              {localGroups.map((group) => (
                <SortableGroupCard key={group.id} group={group} />
              ))}
            </div>
          </SortableContext>
          <DragOverlay>
            {activeGroup && (
              <div className="flex items-stretch gap-2">
                <div className="flex items-center px-1 text-muted-foreground">
                  <GripVertical className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <GroupCard group={activeGroup} isDragOverlay />
                </div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="flex flex-col gap-2">
          {localGroups.map((group) => (
            <Link key={group.id} href={`/groups/${group.id}`}>
              <GroupCard group={group} />
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
