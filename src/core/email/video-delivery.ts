import type { EmailProvider } from '@/core/email';
import { CloudflareEmailProvider } from '@/core/email/cloudflare';
import { ResendProvider } from '@/core/email/resend';

export function videoEmailProvider(
  configs: Record<string, string>
): EmailProvider | null {
  if (configs.email_provider === 'cloudflare') {
    if (
      !configs.cloudflare_email_api_token ||
      !configs.cloudflare_email_account_id ||
      !configs.cloudflare_email_sender_email
    )
      return null;
    return new CloudflareEmailProvider({
      apiToken: configs.cloudflare_email_api_token,
      accountId: configs.cloudflare_email_account_id,
      defaultFrom: configs.cloudflare_email_sender_email,
    });
  }
  return configs.resend_api_key && configs.resend_sender_email
    ? new ResendProvider({
        apiKey: configs.resend_api_key,
        defaultFrom: configs.resend_sender_email,
      })
    : null;
}
