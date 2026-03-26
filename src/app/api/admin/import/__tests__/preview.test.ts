import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

import { createClient } from "@/lib/supabase/server";
import { POST } from "@/app/api/admin/import/preview/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockQuery(data: unknown, error: unknown = null) {
  const result = { data, error };
  const obj: Record<string, unknown> = {};
  obj.select = vi.fn().mockReturnValue(obj);
  obj.eq = vi.fn().mockReturnValue(obj);
  obj.single = vi.fn().mockResolvedValue(result);
  obj.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return obj;
}

function makeRequest(body: object) {
  return new Request("http://localhost:3000/api/admin/import/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ADMIN_USER = { id: "admin-1" };

// Minimal groups and riders for rider import tests
const GROUPS = [{ id: "g-shredders", name: "Shredders" }];
const NO_EXISTING_RIDERS: never[] = [];

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

describe("POST /api/admin/import/preview", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = {
      auth: { getUser: vi.fn() },
      from: vi.fn(),
    };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(mockSupabase);
  });

  // ─── Auth guards ──────────────────────────────────────────────────────────

  describe("auth guards", () => {
    it("returns 401 when not authenticated", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });

      const res = await POST(makeRequest({ csv_text: "a,b\n1,2", import_type: "riders" }));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
    });

    it("returns 403 when user is not an admin", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: ADMIN_USER } });
      mockSupabase.from.mockReturnValue(mockQuery({ roles: ["parent"] }));

      const res = await POST(makeRequest({ csv_text: "a,b\n1,2", import_type: "riders" }));
      expect(res.status).toBe(403);
    });

    it("allows super_admin role", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: ADMIN_USER } });
      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return mockQuery({ roles: ["super_admin"] });
        return mockQuery([]);
      });

      const res = await POST(
        makeRequest({ csv_text: "first_name,last_name,group_name,parent_emails\nAlex,Lee,Shredders,p@example.com", import_type: "riders" }),
      );
      // Should not return 403
      expect(res.status).not.toBe(403);
    });
  });

  // ─── Input validation ─────────────────────────────────────────────────────

  describe("input validation", () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: ADMIN_USER } });
      mockSupabase.from.mockReturnValue(mockQuery({ roles: ["admin"] }));
    });

    it("returns 400 when csv_text is missing", async () => {
      const res = await POST(makeRequest({ import_type: "riders" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 when import_type is missing", async () => {
      const res = await POST(makeRequest({ csv_text: "a,b\n1,2" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 when CSV has no data rows", async () => {
      const res = await POST(makeRequest({ csv_text: "first_name,last_name", import_type: "riders" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for unknown import_type", async () => {
      const res = await POST(
        makeRequest({ csv_text: "a,b\n1,2", import_type: "vehicles" }),
      );
      expect(res.status).toBe(400);
    });
  });

  // ─── Rider import preview ─────────────────────────────────────────────────

  describe("rider import preview", () => {
    function setupRiderImport({
      groups = GROUPS,
      existingRiders = NO_EXISTING_RIDERS as unknown[],
    } = {}) {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: ADMIN_USER } });
      let callCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++;
        if (callCount === 1 && table === "profiles") return mockQuery({ roles: ["admin"] });
        if (table === "groups") return mockQuery(groups);
        if (table === "riders") return mockQuery(existingRiders);
        return mockQuery([]);
      });
    }

    it("returns 200 with preview array for valid riders import", async () => {
      setupRiderImport();
      const csv = "first_name,last_name,group_name,parent_emails\nAlex,Lee,Shredders,parent@example.com";
      const res = await POST(makeRequest({ csv_text: csv, import_type: "riders" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.import_type).toBe("riders");
      expect(body.preview).toHaveLength(1);
    });

    it("assigns action 'create' for a new rider with known group", async () => {
      setupRiderImport();
      const csv = "first_name,last_name,group_name,parent_emails\nAlex,Lee,Shredders,parent@example.com";
      const { preview } = await POST(makeRequest({ csv_text: csv, import_type: "riders" })).then(r => r.json());
      expect(preview[0].action).toBe("create");
      expect(preview[0].errors).toHaveLength(0);
    });

    it("assigns action 'skip' when group name is unknown", async () => {
      setupRiderImport();
      const csv = "first_name,last_name,group_name,parent_emails\nAlex,Lee,UnknownGroup,parent@example.com";
      const { preview } = await POST(makeRequest({ csv_text: csv, import_type: "riders" })).then(r => r.json());
      expect(preview[0].action).toBe("skip");
      expect(preview[0].errors.some((e: string) => e.includes("Unknown group"))).toBe(true);
    });

    it("group matching is case-insensitive", async () => {
      setupRiderImport();
      const csv = "first_name,last_name,group_name,parent_emails\nAlex,Lee,SHREDDERS,parent@example.com";
      const { preview } = await POST(makeRequest({ csv_text: csv, import_type: "riders" })).then(r => r.json());
      expect(preview[0].action).toBe("create");
    });

    it("assigns action 'update' when rider already exists (name + dob match)", async () => {
      setupRiderImport({
        existingRiders: [
          { id: "r-1", first_name: "Alex", last_name: "Lee", date_of_birth: "2015-03-10" },
        ],
      });
      const csv = "first_name,last_name,date_of_birth,group_name,parent_emails\nAlex,Lee,2015-03-10,Shredders,parent@example.com";
      const { preview } = await POST(makeRequest({ csv_text: csv, import_type: "riders" })).then(r => r.json());
      expect(preview[0].action).toBe("update");
    });

    it("duplicate check is case-insensitive on name", async () => {
      setupRiderImport({
        existingRiders: [
          { id: "r-1", first_name: "alex", last_name: "lee", date_of_birth: "2015-03-10" },
        ],
      });
      const csv = "first_name,last_name,date_of_birth,group_name,parent_emails\nAlex,Lee,2015-03-10,Shredders,parent@example.com";
      const { preview } = await POST(makeRequest({ csv_text: csv, import_type: "riders" })).then(r => r.json());
      expect(preview[0].action).toBe("update");
    });

    it("does not flag as duplicate when DOB differs", async () => {
      setupRiderImport({
        existingRiders: [
          { id: "r-1", first_name: "Alex", last_name: "Lee", date_of_birth: "2015-03-10" },
        ],
      });
      const csv = "first_name,last_name,date_of_birth,group_name,parent_emails\nAlex,Lee,2016-05-20,Shredders,parent@example.com";
      const { preview } = await POST(makeRequest({ csv_text: csv, import_type: "riders" })).then(r => r.json());
      expect(preview[0].action).toBe("create");
    });

    it("assigns action 'skip' for invalid parent email", async () => {
      setupRiderImport();
      const csv = "first_name,last_name,group_name,parent_emails\nAlex,Lee,Shredders,not-an-email";
      const { preview } = await POST(makeRequest({ csv_text: csv, import_type: "riders" })).then(r => r.json());
      expect(preview[0].action).toBe("skip");
      expect(preview[0].errors.some((e: string) => e.includes("Invalid email"))).toBe(true);
    });

    it("accepts multiple parent emails separated by commas (quoted field)", async () => {
      setupRiderImport();
      // parent_emails must be a quoted CSV field so the comma is treated as
      // a separator within the field, not a column delimiter
      const csv = 'first_name,last_name,group_name,parent_emails\nAlex,Lee,Shredders,"mom@example.com,dad@example.com"';
      const { preview } = await POST(makeRequest({ csv_text: csv, import_type: "riders" })).then(r => r.json());
      expect(preview[0].action).toBe("create");
      expect(preview[0].errors).toHaveLength(0);
    });

    it("accepts multiple parent emails separated by semicolons", async () => {
      setupRiderImport();
      const csv = "first_name,last_name,group_name,parent_emails\nAlex,Lee,Shredders,\"mom@example.com;dad@example.com\"";
      const { preview } = await POST(makeRequest({ csv_text: csv, import_type: "riders" })).then(r => r.json());
      expect(preview[0].action).toBe("create");
      expect(preview[0].errors).toHaveLength(0);
    });

    it("assigns row_number starting at 2 (header is row 1)", async () => {
      setupRiderImport();
      const csv = [
        "first_name,last_name,group_name,parent_emails",
        "Alex,Lee,Shredders,parent@example.com",
        "Sam,Kim,Shredders,other@example.com",
      ].join("\n");
      const { preview } = await POST(makeRequest({ csv_text: csv, import_type: "riders" })).then(r => r.json());
      expect(preview[0].row_number).toBe(2);
      expect(preview[1].row_number).toBe(3);
    });

    it("handles multiple rows with mixed outcomes", async () => {
      setupRiderImport({
        existingRiders: [
          { id: "r-1", first_name: "Alex", last_name: "Lee", date_of_birth: null },
        ],
      });
      const csv = [
        "first_name,last_name,group_name,parent_emails",
        "Alex,Lee,Shredders,parent@example.com",        // update (dup — no DOB)
        "Sam,Kim,Shredders,other@example.com",           // create
        "Jo,Doe,UnknownGroup,other@example.com",         // skip (bad group)
      ].join("\n");
      const { preview } = await POST(makeRequest({ csv_text: csv, import_type: "riders" })).then(r => r.json());
      expect(preview).toHaveLength(3);
      expect(preview[0].action).toBe("update");
      expect(preview[1].action).toBe("create");
      expect(preview[2].action).toBe("skip");
    });
  });

  // ─── Adult import preview ─────────────────────────────────────────────────

  describe("adult import preview", () => {
    function setupAdultImport({ existingProfiles = [] as unknown[] } = {}) {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: ADMIN_USER } });
      let callCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++;
        if (callCount === 1 && table === "profiles") return mockQuery({ roles: ["admin"] });
        if (table === "profiles") return mockQuery(existingProfiles);
        return mockQuery([]);
      });
    }

    it("returns 200 with preview array for valid adults import", async () => {
      setupAdultImport();
      const csv = "full_name,email,roles\nCoach Dave,dave@example.com,roll_model";
      const res = await POST(makeRequest({ csv_text: csv, import_type: "adults" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.import_type).toBe("adults");
      expect(body.preview).toHaveLength(1);
    });

    it("assigns action 'create' for a new email address", async () => {
      setupAdultImport();
      const csv = "full_name,email,roles\nCoach Dave,dave@example.com,roll_model";
      const { preview } = await POST(makeRequest({ csv_text: csv, import_type: "adults" })).then(r => r.json());
      expect(preview[0].action).toBe("create");
      expect(preview[0].errors).toHaveLength(0);
    });

    it("assigns action 'update' when email already exists", async () => {
      setupAdultImport({
        existingProfiles: [{ id: "p-1", email: "dave@example.com", roles: ["parent"] }],
      });
      const csv = "full_name,email,roles\nCoach Dave,dave@example.com,roll_model";
      const { preview } = await POST(makeRequest({ csv_text: csv, import_type: "adults" })).then(r => r.json());
      expect(preview[0].action).toBe("update");
    });

    it("email matching is case-insensitive", async () => {
      setupAdultImport({
        existingProfiles: [{ id: "p-1", email: "Dave@Example.COM", roles: ["parent"] }],
      });
      const csv = "full_name,email,roles\nCoach Dave,dave@example.com,roll_model";
      const { preview } = await POST(makeRequest({ csv_text: csv, import_type: "adults" })).then(r => r.json());
      expect(preview[0].action).toBe("update");
    });

    it("assigns action 'skip' for an invalid role", async () => {
      setupAdultImport();
      const csv = "full_name,email,roles\nCoach Dave,dave@example.com,coach";
      const { preview } = await POST(makeRequest({ csv_text: csv, import_type: "adults" })).then(r => r.json());
      expect(preview[0].action).toBe("skip");
      expect(preview[0].errors.some((e: string) => e.includes("Invalid role"))).toBe(true);
    });

    it("accepts multiple roles separated by commas", async () => {
      setupAdultImport();
      const csv = "full_name,email,roles\nAdmin Sarah,sarah@example.com,\"admin,parent\"";
      const { preview } = await POST(makeRequest({ csv_text: csv, import_type: "adults" })).then(r => r.json());
      expect(preview[0].action).toBe("create");
      expect(preview[0].errors).toHaveLength(0);
    });

    it("accepts multiple roles separated by semicolons", async () => {
      setupAdultImport();
      const csv = "full_name,email,roles\nAdmin Sarah,sarah@example.com,\"admin;parent\"";
      const { preview } = await POST(makeRequest({ csv_text: csv, import_type: "adults" })).then(r => r.json());
      expect(preview[0].action).toBe("create");
      expect(preview[0].errors).toHaveLength(0);
    });

    it("rejects super_admin as an importable role", async () => {
      setupAdultImport();
      const csv = "full_name,email,roles\nSuperuser,su@example.com,super_admin";
      const { preview } = await POST(makeRequest({ csv_text: csv, import_type: "adults" })).then(r => r.json());
      // super_admin is not in the allowed import roles list
      expect(preview[0].action).toBe("skip");
    });

    it("assigns row_number starting at 2 (header is row 1)", async () => {
      setupAdultImport();
      const csv = [
        "full_name,email,roles",
        "Coach Dave,dave@example.com,roll_model",
        "Admin Sarah,sarah@example.com,admin",
      ].join("\n");
      const { preview } = await POST(makeRequest({ csv_text: csv, import_type: "adults" })).then(r => r.json());
      expect(preview[0].row_number).toBe(2);
      expect(preview[1].row_number).toBe(3);
    });

    it("handles mixed create/update/skip outcomes across rows", async () => {
      setupAdultImport({
        existingProfiles: [{ id: "p-1", email: "existing@example.com", roles: ["parent"] }],
      });
      const csv = [
        "full_name,email,roles",
        "New User,new@example.com,roll_model",            // create
        "Existing User,existing@example.com,parent",     // update
        "Bad Role,bad@example.com,coach",                // skip
      ].join("\n");
      const { preview } = await POST(makeRequest({ csv_text: csv, import_type: "adults" })).then(r => r.json());
      expect(preview).toHaveLength(3);
      expect(preview[0].action).toBe("create");
      expect(preview[1].action).toBe("update");
      expect(preview[2].action).toBe("skip");
    });
  });
});
