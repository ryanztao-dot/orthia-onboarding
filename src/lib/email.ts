import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEditLink(
  to: string,
  practiceName: string,
  editUrl: string
) {
  try {
    await resend.emails.send({
      from: "Orthia Onboarding <noreply@orthia.io>",
      to,
      subject: `Your Orthia onboarding edit link — ${practiceName}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="font-size: 20px; font-weight: 700; color: #111827; margin: 0;">Orthia <span style="font-weight: 300; color: #9ca3af;">AI</span></h1>
          </div>
          <p style="font-size: 15px; color: #374151; line-height: 1.6;">
            Hi there,
          </p>
          <p style="font-size: 15px; color: #374151; line-height: 1.6;">
            Thank you for submitting your onboarding form for <strong>${practiceName}</strong>. If you ever need to make changes, use the link below:
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${editUrl}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-size: 15px; font-weight: 600;">
              Edit Your Submission
            </a>
          </div>
          <p style="font-size: 13px; color: #6b7280; line-height: 1.6;">
            Or copy this link:<br />
            <a href="${editUrl}" style="color: #2563eb; word-break: break-all;">${editUrl}</a>
          </p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
          <p style="font-size: 12px; color: #9ca3af; text-align: center;">
            This link is unique to your submission. Please keep it safe and do not share it with others.
          </p>
        </div>
      `,
    });
  } catch (err) {
    console.error("Failed to send edit link email:", err);
    // Don't throw — email failure shouldn't block submission
  }
}
