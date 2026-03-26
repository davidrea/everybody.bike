import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isEmailConfigured } from "../email";

describe("isEmailConfigured", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns true when all three SMTP vars are set", () => {
    process.env.SMTP_HOST = "smtp.mailgun.org";
    process.env.SMTP_USER = "user@domain.com";
    process.env.SMTP_PASS = "s3cr3t";
    expect(isEmailConfigured()).toBe(true);
  });

  it("returns false when SMTP_HOST is missing", () => {
    process.env.SMTP_USER = "user@domain.com";
    process.env.SMTP_PASS = "s3cr3t";
    expect(isEmailConfigured()).toBe(false);
  });

  it("returns false when SMTP_USER is missing", () => {
    process.env.SMTP_HOST = "smtp.mailgun.org";
    process.env.SMTP_PASS = "s3cr3t";
    expect(isEmailConfigured()).toBe(false);
  });

  it("returns false when SMTP_PASS is missing", () => {
    process.env.SMTP_HOST = "smtp.mailgun.org";
    process.env.SMTP_USER = "user@domain.com";
    expect(isEmailConfigured()).toBe(false);
  });

  it("returns false when all SMTP vars are absent", () => {
    expect(isEmailConfigured()).toBe(false);
  });

  it("returns false when SMTP_HOST is an empty string", () => {
    process.env.SMTP_HOST = "";
    process.env.SMTP_USER = "user@domain.com";
    process.env.SMTP_PASS = "s3cr3t";
    expect(isEmailConfigured()).toBe(false);
  });

  it("returns false when SMTP_USER is an empty string", () => {
    process.env.SMTP_HOST = "smtp.mailgun.org";
    process.env.SMTP_USER = "";
    process.env.SMTP_PASS = "s3cr3t";
    expect(isEmailConfigured()).toBe(false);
  });

  it("returns false when SMTP_PASS is an empty string", () => {
    process.env.SMTP_HOST = "smtp.mailgun.org";
    process.env.SMTP_USER = "user@domain.com";
    process.env.SMTP_PASS = "";
    expect(isEmailConfigured()).toBe(false);
  });
});
