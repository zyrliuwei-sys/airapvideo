import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { assertVideoOrigin } from '@/core/auth/video-actor';
import { videoEmailProvider } from '@/core/email/video-delivery';
import { envConfigs } from '@/config';
import { getAllConfigs } from '@/modules/config/service';
import {
  claimRecoveryEmail,
  emailHasPurchases,
  saveToken,
} from '@/modules/video-purchases/service';
import { allowInWindow } from '@/lib/rate-limit';
import { respErr, respOk } from '@/lib/resp';
import { getLocale } from '@/paraglide/runtime.js';

async function POST({ request }: { request: Request }) {
  try {
    assertVideoOrigin(request);
    const ip =
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0] ||
      'local';
    if (!allowInWindow(`video-recover:${ip}`, 10, 60 * 60_000))
      return respErr('Please try again later', { status: 429 });
    const body = await request.json();
    const email = z
      .email()
      .max(191)
      .parse(
        String(body.email || '')
          .trim()
          .toLowerCase()
      );
    // Same response for missing, throttled, and existing email addresses.
    if (!(await claimRecoveryEmail(email))) return respOk();
    const configs = await getAllConfigs();
    const sender = videoEmailProvider(configs);
    if (sender && (await emailHasPurchases(email))) {
      const token = await saveToken('video-email', email, 15 * 60_000);
      const url = `${configs.app_url || envConfigs.app_url}/api/video-access/open?token=${encodeURIComponent(token)}`;
      const zh = String(getLocale()) === 'zh';
      const result = await sender.sendEmail({
        to: email,
        subject: zh
          ? `${envConfigs.app_name}：查看你的视频`
          : `${envConfigs.app_name}: access your videos`,
        text: zh
          ? `点击查看并下载你的视频：\n${url}\n\n链接15分钟内有效。若不是你本人请求，请忽略此邮件。`
          : `View and download your videos:\n${url}\n\nThis link expires in 15 minutes. If you did not request it, you can ignore this email.`,
      });
      if (!result.success)
        console.error('video recovery email delivery failed');
    }
    return respOk({ headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof z.ZodError)
      return respErr('Please enter a valid email address');
    console.error('video recovery failed', error);
    return respErr('Could not send the access link. Please try again.');
  }
}

export const Route = createFileRoute('/api/video-access/recover')({
  server: { handlers: { POST } },
});
