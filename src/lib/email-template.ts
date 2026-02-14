type BrandedEmailReason =
  | {
      type: "subscription";
      manageUrl: string;
    }
  | {
      type: "required";
    };

type BrandedEmailOptions = {
  title: string;
  preheader?: string;
  body: string;
  actionLabel?: string;
  actionUrl?: string;
  reason: BrandedEmailReason;
  siteUrl: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderBrandedEmail(options: BrandedEmailOptions) {
  const safeTitle = escapeHtml(options.title);
  const safeBody = escapeHtml(options.body).replace(/\n/g, "<br />");
  const safePreheader = escapeHtml(options.preheader ?? options.body).slice(0, 160);
  const safeSiteUrl = escapeHtml(options.siteUrl);
  const actionUrl = options.actionUrl ? escapeHtml(options.actionUrl) : "";
  const actionLabel = options.actionLabel ? escapeHtml(options.actionLabel) : "";

  const reasonHtml =
    options.reason.type === "subscription"
      ? `Why you're receiving this email: You are subscribed to everybody.bike notifications. You can manage notification categories in <a href="${escapeHtml(options.reason.manageUrl)}" style="color:#2d5016;text-decoration:underline;">Notifications settings</a>.`
      : "Why you're receiving this email: This is an account access or security message for everybody.bike. Required account emails cannot be unsubscribed.";

  const reasonText =
    options.reason.type === "subscription"
      ? `Why you're receiving this email: You are subscribed to everybody.bike notifications. Manage preferences: ${options.reason.manageUrl}`
      : "Why you're receiving this email: This is an account access or security message for everybody.bike. Required account emails cannot be unsubscribed.";

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${safeTitle}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f5f3ef;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;">
    <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${safePreheader}</span>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f5f3ef;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;background-color:#ffffff;border:1px solid #d6d3d1;border-radius:12px;">
            <tr>
              <td style="background-color:#2d5016;padding:18px 24px;border-radius:12px 12px 0 0;">
                <p style="margin:0;font-size:14px;line-height:20px;color:#d6f5c2;font-weight:700;letter-spacing:0.4px;">EVERYBODY.BIKE</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px;">
                <h1 style="margin:0 0 12px 0;font-size:22px;line-height:28px;color:#1c1917;word-break:break-word;overflow-wrap:anywhere;">${safeTitle}</h1>
                <p style="margin:0;font-size:15px;line-height:24px;color:#44403c;word-break:break-word;overflow-wrap:anywhere;">${safeBody}</p>
              </td>
            </tr>
            ${
              actionUrl && actionLabel
                ? `<tr>
              <td style="padding:0 20px 20px 20px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td bgcolor="#ea580c" style="border-radius:8px;">
                      <a href="${actionUrl}" style="display:inline-block;padding:12px 18px;font-size:14px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none;">${actionLabel}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`
                : ""
            }
            <tr>
              <td style="padding:0 20px 16px 20px;">
                <p style="margin:0;font-size:12px;line-height:18px;color:#57534e;word-break:break-word;overflow-wrap:anywhere;">${reasonHtml}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 20px 20px 20px;">
                <p style="margin:0;font-size:12px;line-height:18px;color:#78716c;word-break:break-word;overflow-wrap:anywhere;">
                  everybody.bike<br />
                  <a href="${safeSiteUrl}" style="color:#2d5016;text-decoration:underline;word-break:break-all;">${safeSiteUrl}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const textParts = [options.title, "", options.body];
  if (options.actionUrl) {
    textParts.push("", options.actionUrl);
  }
  textParts.push("", reasonText, "", `everybody.bike: ${options.siteUrl}`);

  return {
    html,
    text: textParts.join("\n"),
  };
}
