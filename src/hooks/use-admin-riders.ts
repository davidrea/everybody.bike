"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export type RiderParentRelationship =
  | "parent"
  | "guardian"
  | "emergency_contact";

export interface AdminRider {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  group_id: string | null;
  group_name: string | null;
  group_color: string | null;
  parents: {
    id: string;
    full_name: string;
    email: string | null;
    relationship: RiderParentRelationship;
    is_primary: boolean;
  }[];
}

export function useAdminRiders() {
  return useQuery({
    queryKey: ["admin-riders"],
    queryFn: async (): Promise<AdminRider[]> => {
      const res = await fetch("/api/admin/riders");
      if (!res.ok) throw new Error("Failed to fetch riders");
      return res.json();
    },
  });
}

export function useUpdateRiderGroup() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      riderId,
      groupId,
    }: {
      riderId: string;
      groupId: string;
    }) => {
      const res = await fetch(`/api/admin/riders/${riderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: groupId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to update rider group");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-riders"] });
      qc.invalidateQueries({ queryKey: ["groups"] });
    },
  });
}

export function useAddRiderAdultLink() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      riderId,
      adultId,
      relationship,
      isPrimary,
    }: {
      riderId: string;
      adultId: string;
      relationship: RiderParentRelationship;
      isPrimary: boolean;
    }) => {
      const res = await fetch(`/api/admin/riders/${riderId}/parents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adult_id: adultId,
          relationship,
          is_primary: isPrimary,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to add adult link");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-riders"] });
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useUpdateRiderAdultLink() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      riderId,
      adultId,
      relationship,
      isPrimary,
    }: {
      riderId: string;
      adultId: string;
      relationship: RiderParentRelationship;
      isPrimary: boolean;
    }) => {
      const res = await fetch(`/api/admin/riders/${riderId}/parents`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adult_id: adultId,
          relationship,
          is_primary: isPrimary,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to update adult link");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-riders"] });
    },
  });
}

export function useRemoveRiderAdultLink() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      riderId,
      adultId,
    }: {
      riderId: string;
      adultId: string;
    }) => {
      const params = new URLSearchParams({ adult_id: adultId });
      const res = await fetch(`/api/admin/riders/${riderId}/parents?${params}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to remove adult link");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-riders"] });
    },
  });
}
