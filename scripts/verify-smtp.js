#!/usr/bin/env node
//
// Verify SMTP configuration by connecting, upgrading to TLS, and authenticating.
// Uses only Node.js built-in modules (no dependencies).
//
// Usage:
//   node scripts/verify-smtp.js                          (reads from .env)
//   node scripts/verify-smtp.js .env.local               (reads from specific file)
//   docker run --rm --env-file .env -v $(pwd)/scripts:/scripts node:22-alpine node /scripts/verify-smtp.js
//
// Environment variables:
//   SMTP_HOST  — SMTP server hostname (required)
//   SMTP_PORT  — SMTP server port (default: 587)
//   SMTP_USER  — SMTP username (required)
//   SMTP_PASS  — SMTP password (required)
//

const net = require("net");
const tls = require("tls");
const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Load env file
// ---------------------------------------------------------------------------

function loadEnv() {
  const arg = process.argv[2];
  const envPath = arg
    ? path.resolve(process.cwd(), arg)
    : path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    if (arg) {
      console.error(`Error: env file not found: ${envPath}`);
      process.exit(1);
    }
    return;
  }
  console.log(`Loading env from: ${envPath}\n`);
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnv();

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const HOST = process.env.SMTP_HOST;
const PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const USER = process.env.SMTP_USER;
const PASS = process.env.SMTP_PASS;

if (!HOST || !USER || !PASS) {
  console.error("Error: SMTP_HOST, SMTP_USER, and SMTP_PASS are required.");
  console.error("Set them in .env or pass as environment variables.");
  process.exit(1);
}

console.log("SMTP Verification");
console.log(`  Host: ${HOST}`);
console.log(`  Port: ${PORT}`);
console.log(`  User: ${USER}`);
console.log(`  Pass: ${"*".repeat(Math.min(PASS.length, 20))}`);
console.log("");

// ---------------------------------------------------------------------------
// Minimal async SMTP client using built-in net/tls
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 15000;

function createSmtpClient(host, port) {
  let socket = null;
  let buffer = "";
  let dataHandler = null;

  // Wait for a complete SMTP response (handles multiline 250-... / 250 ...)
  function waitForResponse() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timed out waiting for response (${TIMEOUT_MS / 1000}s)`));
      }, TIMEOUT_MS);

      function check() {
        // Find a final response line: 3 digits followed by a space
        const lines = buffer.split("\r\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].length >= 4 && lines[i][3] === " ") {
            const code = lines[i].slice(0, 3);
            const full = lines.slice(0, i + 1).join("\r\n");
            buffer = lines.slice(i + 1).join("\r\n");
            clearTimeout(timeout);
            dataHandler = null;
            resolve({ code, message: full });
            return;
          }
        }
        // Not complete yet — keep waiting
      }

      dataHandler = (data) => {
        buffer += data;
        check();
      };

      // Check if buffer already has a complete response
      check();
    });
  }

  return {
    async connect() {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Connection timed out (${TIMEOUT_MS / 1000}s)`));
        }, TIMEOUT_MS);

        socket = net.createConnection({ host, port }, () => {
          clearTimeout(timeout);
          resolve();
        });

        socket.setEncoding("utf8");
        socket.on("data", (data) => {
          if (dataHandler) dataHandler(data);
        });
        socket.on("error", (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    },

    async readResponse() {
      return waitForResponse();
    },

    async send(command) {
      socket.write(command + "\r\n");
      return waitForResponse();
    },

    async upgradeTls() {
      return new Promise((resolve, reject) => {
        const tlsSocket = tls.connect(
          { socket, servername: host, rejectUnauthorized: true },
          () => resolve()
        );
        tlsSocket.setEncoding("utf8");
        tlsSocket.on("data", (data) => {
          if (dataHandler) dataHandler(data);
        });
        tlsSocket.on("error", (err) => reject(err));
        socket = tlsSocket;
      });
    },

    close() {
      if (socket) socket.destroy();
    },
  };
}

// ---------------------------------------------------------------------------
// Run verification
// ---------------------------------------------------------------------------

function ok(label) {
  console.log(`  [OK] ${label}`);
}

function expect(response, code, label) {
  if (response.code !== code) {
    throw new Error(
      `${label}: expected ${code}, got ${response.code} — ${response.message.split("\r\n").pop()}`
    );
  }
  ok(label);
}

async function main() {
  const client = createSmtpClient(HOST, PORT);

  try {
    await client.connect();
    const greeting = await client.readResponse();
    expect(greeting, "220", "Connect");

    const ehlo1 = await client.send("EHLO localhost");
    expect(ehlo1, "250", "EHLO");

    const starttls = await client.send("STARTTLS");
    expect(starttls, "220", "STARTTLS");

    await client.upgradeTls();
    ok("TLS Upgrade");

    const ehlo2 = await client.send("EHLO localhost");
    expect(ehlo2, "250", "EHLO (TLS)");

    const authLogin = await client.send("AUTH LOGIN");
    expect(authLogin, "334", "AUTH LOGIN");

    const userResp = await client.send(Buffer.from(USER).toString("base64"));
    expect(userResp, "334", "Username accepted");

    const passResp = await client.send(Buffer.from(PASS).toString("base64"));
    expect(passResp, "235", "Authentication");

    await client.send("QUIT");
    ok("QUIT");

    console.log("");
    console.log("SMTP verification passed! Email delivery should work.");
    process.exit(0);
  } catch (err) {
    console.error(`  FAILED: ${err.message}`);
    console.error("");
    console.error(
      "Check your SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS in .env"
    );
    client.close();
    process.exit(1);
  }
}

main();
