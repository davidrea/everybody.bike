import { describe, it, expect } from "vitest";
import { renderBrandedEmail } from "../email-template";

const base = {
  title: "Hello World",
  body: "This is the message body.",
  siteUrl: "https://everybody.bike",
  reason: { type: "required" as const },
};

// ─── HTML structure ──────────────────────────────────────────────────────────

describe("renderBrandedEmail — HTML structure", () => {
  it("includes the title in HTML", () => {
    const { html } = renderBrandedEmail(base);
    expect(html).toContain("Hello World");
  });

  it("includes the body in HTML", () => {
    const { html } = renderBrandedEmail(base);
    expect(html).toContain("This is the message body.");
  });

  it("includes the site URL in HTML", () => {
    const { html } = renderBrandedEmail(base);
    expect(html).toContain("https://everybody.bike");
  });

  it("includes EVERYBODY.BIKE brand header", () => {
    const { html } = renderBrandedEmail(base);
    expect(html).toContain("EVERYBODY.BIKE");
  });

  it("is a complete HTML document", () => {
    const { html } = renderBrandedEmail(base);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("</html>");
  });

  it("converts newlines in body to <br /> tags", () => {
    const { html } = renderBrandedEmail({ ...base, body: "Line 1\nLine 2" });
    expect(html).toContain("<br />");
  });
});

// ─── HTML escaping ───────────────────────────────────────────────────────────

describe("renderBrandedEmail — HTML escaping", () => {
  it("escapes & in title", () => {
    const { html } = renderBrandedEmail({ ...base, title: "Ride & Race" });
    expect(html).toContain("Ride &amp; Race");
    expect(html).not.toContain("Ride & Race");
  });

  it("escapes < and > in title", () => {
    const { html } = renderBrandedEmail({ ...base, title: "Event <Special>" });
    expect(html).toContain("Event &lt;Special&gt;");
    expect(html).not.toContain("Event <Special>");
  });

  it('escapes " in title', () => {
    const { html } = renderBrandedEmail({ ...base, title: 'Event "Title"' });
    expect(html).toContain("Event &quot;Title&quot;");
    expect(html).not.toContain('Event "Title"');
  });

  it("escapes ' in title", () => {
    const { html } = renderBrandedEmail({ ...base, title: "Rider's Event" });
    expect(html).toContain("Rider&#39;s Event");
    expect(html).not.toContain("Rider's Event");
  });

  it("escapes script tags in body to prevent XSS", () => {
    const { html } = renderBrandedEmail({
      ...base,
      body: "<script>alert('xss')</script>",
    });
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("escapes HTML in body", () => {
    const { html } = renderBrandedEmail({
      ...base,
      body: "<b>Bold</b> & <i>italic</i>",
    });
    expect(html).toContain("&lt;b&gt;Bold&lt;/b&gt;");
    expect(html).not.toContain("<b>Bold</b>");
  });

  it("escapes HTML in siteUrl", () => {
    const { html } = renderBrandedEmail({
      ...base,
      siteUrl: 'https://everybody.bike?x="y"',
    });
    expect(html).toContain("&quot;y&quot;");
    expect(html).not.toContain('"y"');
  });
});

// ─── Preheader ───────────────────────────────────────────────────────────────

describe("renderBrandedEmail — preheader", () => {
  it("falls back to body when no preheader is given", () => {
    const { html } = renderBrandedEmail(base);
    // The hidden preheader span will contain the body text
    expect(html).toContain("This is the message body.");
  });

  it("uses explicit preheader over body", () => {
    const { html } = renderBrandedEmail({
      ...base,
      preheader: "Custom teaser text",
    });
    expect(html).toContain("Custom teaser text");
  });

  it("truncates preheader at 160 characters", () => {
    const longPreheader = "x".repeat(200);
    const { html } = renderBrandedEmail({ ...base, preheader: longPreheader });
    expect(html).toContain("x".repeat(160));
    expect(html).not.toContain("x".repeat(161));
  });

  it("escapes HTML in preheader", () => {
    const { html } = renderBrandedEmail({
      ...base,
      preheader: "<em>teaser</em>",
    });
    expect(html).toContain("&lt;em&gt;teaser&lt;/em&gt;");
    expect(html).not.toContain("<em>teaser</em>");
  });
});

// ─── Action button ───────────────────────────────────────────────────────────

describe("renderBrandedEmail — action button", () => {
  it("renders button when both actionLabel and actionUrl are provided", () => {
    const { html } = renderBrandedEmail({
      ...base,
      actionLabel: "View Event",
      actionUrl: "https://everybody.bike/events/123",
    });
    expect(html).toContain("View Event");
    expect(html).toContain("https://everybody.bike/events/123");
  });

  it("omits button when actionUrl is not provided", () => {
    const { html } = renderBrandedEmail({ ...base, actionLabel: "View Event" });
    // The label should not appear as a button since there's no URL
    expect(html).not.toContain("View Event");
  });

  it("omits button when actionLabel is not provided", () => {
    const { html } = renderBrandedEmail({
      ...base,
      actionUrl: "https://everybody.bike/events/123",
    });
    // The URL should not appear in the HTML since there's no label
    expect(html).not.toContain("https://everybody.bike/events/123");
  });

  it("escapes HTML in action URL", () => {
    const { html } = renderBrandedEmail({
      ...base,
      actionLabel: "Click",
      actionUrl: 'https://everybody.bike?r="evil"',
    });
    expect(html).toContain("&quot;evil&quot;");
    expect(html).not.toContain('"evil"');
  });

  it("escapes HTML in action label", () => {
    const { html } = renderBrandedEmail({
      ...base,
      actionLabel: 'Click "Here"',
      actionUrl: "https://everybody.bike/events/123",
    });
    expect(html).toContain("&quot;Here&quot;");
    expect(html).not.toContain('"Here"');
  });
});

// ─── Reason footer ───────────────────────────────────────────────────────────

describe("renderBrandedEmail — reason footer", () => {
  it("renders required-account message for reason type 'required'", () => {
    const { html } = renderBrandedEmail({
      ...base,
      reason: { type: "required" },
    });
    expect(html).toContain(
      "Required account emails cannot be unsubscribed",
    );
  });

  it("renders subscription message with manage URL for reason type 'subscription'", () => {
    const { html } = renderBrandedEmail({
      ...base,
      reason: {
        type: "subscription",
        manageUrl: "https://everybody.bike/notifications",
      },
    });
    expect(html).toContain("subscribed to everybody.bike notifications");
    expect(html).toContain("https://everybody.bike/notifications");
  });

  it("escapes manage URL in subscription reason", () => {
    const { html } = renderBrandedEmail({
      ...base,
      reason: {
        type: "subscription",
        manageUrl: 'https://everybody.bike?x="y"',
      },
    });
    expect(html).toContain("&quot;y&quot;");
  });

  it("does not include subscription reason text for required emails", () => {
    const { html } = renderBrandedEmail({
      ...base,
      reason: { type: "required" },
    });
    // These phrases only appear in the subscription variant of the footer
    expect(html).not.toContain("subscribed to everybody.bike notifications");
    expect(html).not.toContain("Notifications settings");
  });
});

// ─── Plain text output ───────────────────────────────────────────────────────

describe("renderBrandedEmail — text output", () => {
  it("includes title in plain text", () => {
    const { text } = renderBrandedEmail(base);
    expect(text).toContain("Hello World");
  });

  it("includes body in plain text", () => {
    const { text } = renderBrandedEmail(base);
    expect(text).toContain("This is the message body.");
  });

  it("includes site URL in plain text footer", () => {
    const { text } = renderBrandedEmail(base);
    expect(text).toContain("everybody.bike: https://everybody.bike");
  });

  it("includes action URL in plain text when provided", () => {
    const { text } = renderBrandedEmail({
      ...base,
      actionUrl: "https://everybody.bike/events/42",
    });
    expect(text).toContain("https://everybody.bike/events/42");
  });

  it("does not include action URL in plain text when not provided", () => {
    const { text } = renderBrandedEmail(base);
    // No action URL, so no events/ path in text
    expect(text).not.toContain("/events/");
  });

  it("includes required reason in plain text", () => {
    const { text } = renderBrandedEmail({
      ...base,
      reason: { type: "required" },
    });
    expect(text).toContain("Required account emails cannot be unsubscribed");
  });

  it("includes subscription reason with manage URL in plain text", () => {
    const { text } = renderBrandedEmail({
      ...base,
      reason: {
        type: "subscription",
        manageUrl: "https://everybody.bike/notifications",
      },
    });
    expect(text).toContain("Manage preferences: https://everybody.bike/notifications");
  });

  it("does not HTML-escape special chars in plain text", () => {
    const { text } = renderBrandedEmail({ ...base, title: "Ride & Race" });
    // Plain text should have raw & not &amp;
    expect(text).toContain("Ride & Race");
    expect(text).not.toContain("&amp;");
  });

  it("title appears before body in plain text", () => {
    const { text } = renderBrandedEmail(base);
    const titleIdx = text.indexOf("Hello World");
    const bodyIdx = text.indexOf("This is the message body.");
    expect(titleIdx).toBeLessThan(bodyIdx);
  });
});
