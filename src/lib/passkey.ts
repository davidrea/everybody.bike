// WebAuthn Relying Party configuration
export const rpID = process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID || "localhost";
export const rpName = process.env.NEXT_PUBLIC_WEBAUTHN_RP_NAME || "everybody.bike";
export const origin = process.env.NEXT_PUBLIC_WEBAUTHN_ORIGIN || "http://localhost:3000";
