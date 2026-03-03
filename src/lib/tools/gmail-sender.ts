import nodemailer from 'nodemailer';

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendEmail(
  to: string[],
  subject: string,
  html: string
): Promise<EmailResult> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error('GMAIL_USER or GMAIL_APP_PASSWORD is not set');

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const info = await transporter.sendMail({
        from: user,
        to: to.join(', '),
        subject,
        html,
      });
      return { success: true, messageId: info.messageId };
    } catch (error) {
      if (attempt === 3) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  return { success: false, error: 'Max retries reached' };
}
