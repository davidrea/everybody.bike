import { describe, it, expect } from "vitest";
import { parseCsv } from "../csv-parser";

describe("parseCsv", () => {
  describe("basic parsing", () => {
    it("parses a simple CSV with headers and rows", () => {
      const csv = "Name,Email,Role\nAlice,alice@example.com,parent\nBob,bob@example.com,admin";
      const result = parseCsv(csv);

      expect(result.headers).toEqual(["name", "email", "role"]);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual({
        name: "Alice",
        email: "alice@example.com",
        role: "parent",
      });
      expect(result.rows[1]).toEqual({
        name: "Bob",
        email: "bob@example.com",
        role: "admin",
      });
    });

    it("returns empty arrays for empty input", () => {
      const result = parseCsv("");
      expect(result.headers).toEqual([]);
      expect(result.rows).toEqual([]);
    });

    it("returns headers-only when no data rows", () => {
      const result = parseCsv("Name,Email");
      expect(result.headers).toEqual(["name", "email"]);
      expect(result.rows).toEqual([]);
    });

    it("handles single column CSV", () => {
      const result = parseCsv("Name\nAlice\nBob");
      expect(result.headers).toEqual(["name"]);
      expect(result.rows).toEqual([{ name: "Alice" }, { name: "Bob" }]);
    });
  });

  describe("quoted fields", () => {
    it("handles fields with commas inside quotes", () => {
      const csv = 'Name,Address\nAlice,"123 Main St, Apt 4"';
      const result = parseCsv(csv);
      expect(result.rows[0].address).toBe("123 Main St, Apt 4");
    });

    it("handles escaped quotes (doubled)", () => {
      const csv = 'Name,Note\nAlice,"She said ""hello"""';
      const result = parseCsv(csv);
      expect(result.rows[0].note).toBe('She said "hello"');
    });

    it("handles empty quoted fields", () => {
      const csv = 'Name,Note\nAlice,""';
      const result = parseCsv(csv);
      expect(result.rows[0].note).toBe("");
    });

    it("handles quoted fields with newlines in content via field separation", () => {
      // Note: this parser splits on \n first, so embedded newlines in quotes
      // would only work if on the same line. Testing the quote toggle behavior.
      const csv = 'Name,Value\nAlice,"some value"';
      const result = parseCsv(csv);
      expect(result.rows[0].value).toBe("some value");
    });
  });

  describe("whitespace handling", () => {
    it("trims field values", () => {
      const csv = "Name,Email\n  Alice  ,  alice@example.com  ";
      const result = parseCsv(csv);
      expect(result.rows[0].name).toBe("Alice");
      expect(result.rows[0].email).toBe("alice@example.com");
    });

    it("ignores empty lines", () => {
      const csv = "Name\n\nAlice\n\n\nBob\n";
      const result = parseCsv(csv);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].name).toBe("Alice");
      expect(result.rows[1].name).toBe("Bob");
    });

    it("ignores whitespace-only lines", () => {
      const csv = "Name\n   \nAlice";
      const result = parseCsv(csv);
      expect(result.rows).toHaveLength(1);
    });
  });

  describe("line endings", () => {
    it("handles Windows CRLF line endings", () => {
      const csv = "Name,Email\r\nAlice,alice@example.com\r\nBob,bob@example.com";
      const result = parseCsv(csv);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].name).toBe("Alice");
    });

    it("handles Unix LF line endings", () => {
      const csv = "Name,Email\nAlice,alice@example.com";
      const result = parseCsv(csv);
      expect(result.rows).toHaveLength(1);
    });
  });

  describe("header normalization", () => {
    it("lowercases headers", () => {
      const csv = "First Name,LAST NAME\nAlice,Smith";
      const result = parseCsv(csv);
      expect(result.headers).toEqual(["first_name", "last_name"]);
    });

    it("replaces spaces and dashes with underscores", () => {
      const csv = "First Name,Last-Name,Date of Birth\nA,B,C";
      const result = parseCsv(csv);
      expect(result.headers).toEqual(["first_name", "last_name", "date_of_birth"]);
    });

    it("removes special characters from headers", () => {
      const csv = "Name!,Email@Address,Role#1\nA,B,C";
      const result = parseCsv(csv);
      expect(result.headers).toEqual(["name", "emailaddress", "role1"]);
    });

    it("trims headers", () => {
      const csv = "  Name  , Email \nAlice,a@b.com";
      const result = parseCsv(csv);
      expect(result.headers).toEqual(["name", "email"]);
    });
  });

  describe("missing/extra columns", () => {
    it("fills missing columns with empty strings", () => {
      const csv = "A,B,C\n1";
      const result = parseCsv(csv);
      expect(result.rows[0]).toEqual({ a: "1", b: "", c: "" });
    });

    it("ignores extra columns beyond headers", () => {
      const csv = "A,B\n1,2,3,4";
      const result = parseCsv(csv);
      // Only headers a and b should be in the row
      expect(result.rows[0].a).toBe("1");
      expect(result.rows[0].b).toBe("2");
      expect(Object.keys(result.rows[0])).toEqual(["a", "b"]);
    });
  });

  describe("realistic CSV import data", () => {
    it("parses a rider import CSV", () => {
      const csv = [
        "First Name,Last Name,Date of Birth,Group Name,Parent Emails",
        "Sam,Lee,2015-03-10,Shredders,parent1@example.com",
        'Jane,Doe,2014-08-22,Trail Blazers,"mom@example.com, dad@example.com"',
      ].join("\n");

      const result = parseCsv(csv);
      expect(result.headers).toEqual([
        "first_name",
        "last_name",
        "date_of_birth",
        "group_name",
        "parent_emails",
      ]);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].first_name).toBe("Sam");
      expect(result.rows[0].group_name).toBe("Shredders");
      expect(result.rows[1].parent_emails).toBe("mom@example.com, dad@example.com");
    });

    it("parses an adult import CSV", () => {
      const csv = [
        "Full Name,Email,Roles",
        "Coach Dave,dave@example.com,roll_model",
        'Admin Sarah,sarah@example.com,"admin, parent"',
      ].join("\n");

      const result = parseCsv(csv);
      expect(result.headers).toEqual(["full_name", "email", "roles"]);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[1].roles).toBe("admin, parent");
    });
  });
});
