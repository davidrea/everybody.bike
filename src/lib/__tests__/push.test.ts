import { describe, it, expect, vi, afterEach } from "vitest";
import { urlBase64ToUint8Array, isPushSupported } from "../push";

describe("urlBase64ToUint8Array", () => {
  it("decodes a standard base64url VAPID key", () => {
    // Known test vector: the base64url encoding of bytes [0, 1, 2, 3]
    // Standard base64 of [0,1,2,3] is "AAECAw=="
    // base64url replaces + with - and / with _ and strips padding: "AAECAw"
    const result = urlBase64ToUint8Array("AAECAw");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(4);
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(1);
    expect(result[2]).toBe(2);
    expect(result[3]).toBe(3);
  });

  it("handles base64url characters (- and _)", () => {
    // Standard base64: "A+B/Cw==" → base64url: "A-B_Cw"
    // Decodes to bytes: [0x03, 0xe0, 0x7f, 0x0b]
    const result = urlBase64ToUint8Array("A-B_Cw");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(4);
    expect(result[0]).toBe(0x03);
    expect(result[1]).toBe(0xe0);
    expect(result[2]).toBe(0x7f);
    expect(result[3]).toBe(0x0b);
  });

  it("adds appropriate padding", () => {
    // "YQ" needs "==" padding → "YQ==" → decodes to "a" (0x61)
    const result = urlBase64ToUint8Array("YQ");
    expect(result.length).toBe(1);
    expect(result[0]).toBe(0x61); // 'a'
  });

  it("handles already-padded input", () => {
    const result = urlBase64ToUint8Array("YQ==");
    expect(result.length).toBe(1);
    expect(result[0]).toBe(0x61);
  });

  it("handles empty string", () => {
    const result = urlBase64ToUint8Array("");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(0);
  });

  it("decodes a realistic VAPID public key length", () => {
    // VAPID public keys are 65 bytes (uncompressed P-256 point)
    const vapidKey =
      "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8p8REfWRk";
    const result = urlBase64ToUint8Array(vapidKey);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(65);
  });
});

describe("isPushSupported", () => {
  it("returns false in Node.js environment (no window)", () => {
    // In Node environment, window is undefined, so push is not supported
    expect(isPushSupported()).toBe(false);
  });

  it("returns false when window exists but Notification is missing", () => {
    // @ts-expect-error — simulating partial browser env
    globalThis.window = {};
    try {
      expect(isPushSupported()).toBe(false);
    } finally {
      // @ts-expect-error — cleanup
      delete globalThis.window;
    }
  });
});
