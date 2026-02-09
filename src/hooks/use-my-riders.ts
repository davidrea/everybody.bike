"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type RiderParentRelationship =
  | "parent"
  | "guardian"
  | "emergency_contact";

export interface MyLinkedRider {
  rider_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  group_id: string | null;
  group_name: string | null;
  group_color: string | null;
  relationship: RiderParentRelationship;
  is_primary: boolean;
}

export function useMyRiders(userId: string | undefined) {
  return useQuery({
    queryKey: ["my-riders", userId],
    enabled: !!userId,
    queryFn: async (): Promise<MyLinkedRider[]> => {
      const res = await fetch("/api/riders/mine");
      if (!res.ok) throw new Error("Failed to fetch riders");
      return res.json();
    },
  });
}

export function useCreateMyRider() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (values: {
      first_name: string;
      last_name: string;
      date_of_birth?: string;
      group_id?: string;
      relationship: RiderParentRelationship;
      is_primary: boolean;
    }) => {
      const res = await fetch("/api/riders/mine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to create rider");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-riders"] });
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
}

export function useUpdateMyRider() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (values: {
      rider_id: string;
      first_name: string;
      last_name: string;
      date_of_birth?: string;
      relationship: RiderParentRelationship;
      is_primary: boolean;
    }) => {
      const res = await fetch("/api/riders/mine", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to update rider");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-riders"] });
    },
  });
}

export function useRemoveMyRiderLink() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (riderId: string) => {
      const res = await fetch(`/api/riders/mine?rider_id=${riderId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to remove rider link");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-riders"] });
    },
  });
}
