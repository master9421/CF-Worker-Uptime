import { Config, Monitor } from './types';

export async function sendNotification(
  env: any, // Use any to accept global bindings
  config: Config,
  monitor: Monitor,
  status: string,
  message: string
) {
  console.log(`[Notification] Monitor ${monitor.name} (${monitor.id}) changed to ${status}`);

  // ---------------------------------------------------------------------------
  // MESSAGE TEMPLATE GENERATION
  // ---------------------------------------------------------------------------
  const time = new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' });
  const emoji = status === 'UP' ? '✅' : (status === 'DOWN' ? '🔴' : '⚠️');
  
  const MSG = `
${emoji} **Status Change Notification**

📌 **Service**: ${monitor.name}
🆔 **ID**: ${monitor.id}
🔗 **URL**: ${monitor.url}
📊 **Status**: ${status}
📝 **Message**: ${message}
⏰ **Time**: ${time}
`.trim();

  // ---------------------------------------------------------------------------
  // CUSTOM NOTIFICATION LOGIC START
  // ---------------------------------------------------------------------------
  
  // Example: Send to Discord / Slack / Telegram / Feishu
  // Use the ${MSG} variable directly in your calls.
  
  // await sendToTelegram(config, MSG);
  // await sendToFeishu(config, MSG);
  await sendToResend(env, MSG, status, monitor.name);
  
  // ---------------------------------------------------------------------------
  // CUSTOM NOTIFICATION LOGIC END
  // ---------------------------------------------------------------------------

  // Default Webhook Implementation
  const url = config.settings.callback_url;
  if (url) {
    const payload = {
      monitor_id: monitor.id,
      monitor_name: monitor.name,
      status: status,
      message: message,
      timestamp: new Date().toISOString(),
      secret: config.settings.callback_secret,
    };

    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error(`Failed to send webhook for ${monitor.id}:`, error);
    }
  }
}

// --- Example Helpers ---

async function sendToResend(env: any, msg: string, status: string, monitorName: string) {
  if (!env.RESEND_KEY || !env.RESEND_SEND || !env.RESEND_RECEIVE) {
    console.warn('[Notification] Resend credentials not configured (RESEND_KEY, RESEND_SEND, RESEND_RECEIVE)');
    return;
  }

  // Convert html newlines for email body if needed, but msg is markdown-like text.
  // For Resend 'html' field, we might want to wrap it in <pre> or convert newlines to <br>.
  // Simple conversion:
  const htmlBody = `<pre style="font-family: sans-serif; white-space: pre-wrap;">${msg}</pre>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `Status Change Notification <${env.RESEND_SEND}>`,
        to: [env.RESEND_RECEIVE],
        subject: `[${status}] Monitor Alert: ${monitorName}`,
        html: htmlBody,
      })
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[Notification] Resend API Error:', err);
    } else {
      console.log('[Notification] Resend email sent successfully');
    }
  } catch (e) {
    console.error('[Notification] Failed to send Resend email:', e);
  }
}
