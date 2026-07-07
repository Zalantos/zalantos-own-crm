type EmailDetail = {
  label: string;
  value: string | null | undefined;
};

type NotificationEmailInput = {
  eyebrow: string;
  title: string;
  intro: string;
  statusLabel: string;
  statusTone: "warning" | "danger" | "neutral";
  details: EmailDetail[];
  ctaLabel: string;
  ctaUrl: string;
  footer?: string;
};

const toneStyles = {
  warning: {
    background: "#fff7ed",
    color: "#9a3412",
    border: "#fed7aa",
  },
  danger: {
    background: "#fef2f2",
    color: "#991b1b",
    border: "#fecaca",
  },
  neutral: {
    background: "#f8fafc",
    color: "#334155",
    border: "#cbd5e1",
  },
};

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderDetails(details: EmailDetail[]) {
  const rows = details
    .filter((detail) => detail.value)
    .map(
      (detail) => `
        <tr>
          <td style="padding: 10px 0; color: #64748b; font-size: 13px; width: 140px; vertical-align: top;">${escapeHtml(detail.label)}</td>
          <td style="padding: 10px 0; color: #0f172a; font-size: 14px; font-weight: 600; vertical-align: top;">${escapeHtml(String(detail.value))}</td>
        </tr>
      `,
    )
    .join("");

  if (!rows) return "";

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-top: 18px; border-top: 1px solid #e2e8f0;">
      ${rows}
    </table>
  `;
}

export function renderNotificationEmail(input: NotificationEmailInput) {
  const tone = toneStyles[input.statusTone];
  const footer =
    input.footer ??
    "Este aviso fue enviado automaticamente por el CRM de Zalantos.";

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body style="margin: 0; padding: 0; background: #f6f8fb; font-family: Arial, Helvetica, sans-serif; color: #0f172a;">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">${escapeHtml(input.intro)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #f6f8fb; border-collapse: collapse;">
      <tr>
        <td align="center" style="padding: 32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 620px; border-collapse: collapse;">
            <tr>
              <td style="padding: 0 0 14px 0;">
                <div style="font-size: 14px; font-weight: 700; color: #0f172a;">CRM Zalantos</div>
              </td>
            </tr>
            <tr>
              <td style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden;">
                <div style="height: 6px; background: #0f766e;"></div>
                <div style="padding: 28px;">
                  <div style="font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #0f766e; margin-bottom: 10px;">${escapeHtml(input.eyebrow)}</div>
                  <h1 style="margin: 0 0 12px 0; color: #0f172a; font-size: 24px; line-height: 1.25; font-weight: 700;">${escapeHtml(input.title)}</h1>
                  <p style="margin: 0; color: #475569; font-size: 15px; line-height: 1.6;">${escapeHtml(input.intro)}</p>
                  <div style="display: inline-block; margin-top: 18px; padding: 8px 12px; background: ${tone.background}; color: ${tone.color}; border: 1px solid ${tone.border}; border-radius: 999px; font-size: 13px; font-weight: 700;">${escapeHtml(input.statusLabel)}</div>
                  ${renderDetails(input.details)}
                  <div style="margin-top: 26px;">
                    <a href="${escapeHtml(input.ctaUrl)}" style="display: inline-block; background: #0f766e; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; padding: 12px 18px; border-radius: 8px;">${escapeHtml(input.ctaLabel)}</a>
                  </div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding: 16px 4px 0 4px;">
                <p style="margin: 0; color: #94a3b8; font-size: 12px; line-height: 1.5;">${escapeHtml(footer)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
