"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AdminProfile } from "@/types";
import type { InviteFormValues, RoleUpdateValues } from "@/lib/validators";

function buildUserQueryString(filters?: { role?: string; invite_status?: string }): string {
  if (!filters) return "";
  const params = new URLSearchParams();
  if (filters.role) params.set("role", filters.role);
  if (filters.invite_status) params.set("invite_status", filters.invite_status);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function useUsers(filters?: { role?: string; invite_status?: string }) {
  return useQuery({
    queryKey: ["users", filters],
    queryFn: async (): Promise<AdminProfile[]> => {
      const res = await fetch(`/api/admin/users${buildUserQueryString(filters)}`);
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
  });
}

export function useInviteUser() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (values: InviteFormValues) => {
      const res = await fetch("/api/admin/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to send invite");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useResendInvite() {
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch("/api/admin/invite/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to resend invite");
      }
      return res.json();
    },
  });
}

export function useInviteLink() {
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch("/api/admin/invite/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to generate invite link");
      }
      return res.json() as Promise<{ link: string }>;
    },
  });
}

export function useUpdateUserRoles() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      values,
    }: {
      userId: string;
      values: RoleUpdateValues;
    }) => {
      const res = await fetch(`/api/admin/users/${userId}/roles`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to update roles");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to delete user");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["admin-riders"] });
      qc.invalidateQueries({ queryKey: ["admin-user-riders"] });
    },
  });
}

export function useUpdateUserName() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      fullName,
    }: {
      userId: string;
      fullName: string;
    }) => {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to update user name");
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
      qc.invalidateQueries({ queryKey: ["admin-user-riders", vars.userId] });
    },
  });
}

export function useUpdateUserEmail() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      email,
    }: {
      userId: string;
      email: string;
    }) => {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to update user email");
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
      qc.invalidateQueries({ queryKey: ["admin-user-riders", vars.userId] });
    },
  });
}

export function useUpdateUserSafety() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      medicalAlerts,
      mediaOptOut,
    }: {
      userId: string;
      medicalAlerts: string;
      mediaOptOut: boolean;
    }) => {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medical_alerts: medicalAlerts,
          media_opt_out: mediaOptOut,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to update user safety preferences");
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
      qc.invalidateQueries({ queryKey: ["admin-user-riders", vars.userId] });
    },
  });
}
