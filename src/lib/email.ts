type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export async function sendTransactionalEmail(input: SendEmailInput) {
  const from =
    process.env.RESEND_FROM_EMAIL?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    "Wellness Tech <noreply@thewellnesstech.com>";
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const to = input.to.trim().toLowerCase();
  if (!to.includes("@")) {
    throw new Error("A valid recipient email is required.");
  }

  if (!resendKey) {
    const sandbox = (process.env.SANDBOX_AUTH || "").trim().toLowerCase() === "true";
    console.info("Email provider not configured. Logging magic-code email only.", {
      from,
      to,
      subject: input.subject,
      sandbox,
    });
    if (!sandbox) {
      throw new Error("RESEND_API_KEY is not configured.");
    }
    return { ok: true as const, provider: "log" as const };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend request failed: ${errorText.slice(0, 280)}`);
  }

  return { ok: true as const, provider: "resend" as const };
}

export async function sendMagicLoginCode(email: string, code: string) {
  const subject = "Your Wellness Tech login code";
  const text = [
    "Your Wellness Tech practice login code is:",
    "",
    code,
    "",
    "This code expires in 15 minutes. If you did not request it, you can ignore this email.",
  ].join("\n");
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#1a1a1a;max-width:480px">
      <p style="margin:0 0 12px">Your Wellness Tech practice login code is:</p>
      <p style="margin:0 0 18px;font-size:28px;letter-spacing:0.18em;font-weight:700">${code}</p>
      <p style="margin:0;color:#555;font-size:14px">This code expires in 15 minutes. If you did not request it, you can ignore this email.</p>
    </div>
  `.trim();

  return sendTransactionalEmail({ to: email, subject, text, html });
}
