// Minimal email helper using Resend. Lazy-loads the SDK so missing
// RESEND_API_KEY doesn't crash module init at build time.

interface SendArgs {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail({ to, subject, text, html }: SendArgs): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.TEAM_EMAIL_FROM || "Orthia <onboarding@resend.dev>";

  if (!apiKey) {
    // Dev fallback: log the message so the user can grab the link from server logs.
    console.log("[email:dev-fallback] No RESEND_API_KEY set. Would have sent:");
    console.log(`  To: ${to}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Body:\n${text}`);
    return { ok: true };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to,
      subject,
      text,
      html: html || text,
    });
    if (error) return { ok: false, error: error.message || String(error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Email failed" };
  }
}
