import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getVapidPublicKey } from "../push-server";

describe("getVapidPublicKey", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.VAPID_PUBLIC_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns the key from VAPID_PUBLIC_KEY env var", () => {
    const key = "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8p8REfWRk";
    process.env.VAPID_PUBLIC_KEY = key;
    expect(getVapidPublicKey()).toBe(key);
  });

  it("throws when VAPID_PUBLIC_KEY is not set", () => {
    expect(() => getVapidPublicKey()).toThrow("VAPID_PUBLIC_KEY is not set");
  });

  it("throws when VAPID_PUBLIC_KEY is an empty string", () => {
    process.env.VAPID_PUBLIC_KEY = "";
    expect(() => getVapidPublicKey()).toThrow("VAPID_PUBLIC_KEY is not set");
  });
});
