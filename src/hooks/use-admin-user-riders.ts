"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type RiderParentRelationship =
  | "parent"
  | "guardian"
  | "emergency_contact";

export interface AdminUserLinkedRider {
  rider_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  group_id: string | null;
  group_name: string | null;
  group_color: string | null;
  medical_alerts: string | null;
  media_opt_out: boolean;
  relationship: RiderParentRelationship;
  is_primary: boolean;
}

export function useAdminUserRiders(userId: string | undefined) {
  return useQuery({
    queryKey: ["admin-user-riders", userId],
    enabled: !!userId,
    queryFn: async (): Promise<AdminUserLinkedRider[]> => {
      const res = await fetch(`/api/admin/users/${userId}/riders`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to fetch linked riders");
      }
      return res.json();
    },
  });
}

export function useCreateAdminUserRider() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      values,
    }: {
      userId: string;
      values: {
        first_name: string;
        last_name: string;
        date_of_birth?: string;
        group_id: string;
        medical_alerts?: string;
        media_opt_out: boolean;
        relationship: RiderParentRelationship;
        is_primary: boolean;
      };
    }) => {
      const res = await fetch(`/api/admin/users/${userId}/riders`, {
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
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["admin-user-riders", vars.userId] });
      qc.invalidateQueries({ queryKey: ["admin-riders"] });
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useUpdateAdminUserRider() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      values,
    }: {
      userId: string;
      values: {
        rider_id: string;
        first_name: string;
        last_name: string;
        date_of_birth?: string;
        medical_alerts?: string;
        media_opt_out: boolean;
        relationship: RiderParentRelationship;
        is_primary: boolean;
      };
    }) => {
      const res = await fetch(`/api/admin/users/${userId}/riders`, {
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
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["admin-user-riders", vars.userId] });
      qc.invalidateQueries({ queryKey: ["admin-riders"] });
    },
  });
}

export function useUnlinkAdminUserRider() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      riderId,
    }: {
      userId: string;
      riderId: string;
    }) => {
      const params = new URLSearchParams({ rider_id: riderId });
      const res = await fetch(`/api/admin/users/${userId}/riders?${params}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to unlink rider");
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["admin-user-riders", vars.userId] });
      qc.invalidateQueries({ queryKey: ["admin-riders"] });
    },
  });
}
