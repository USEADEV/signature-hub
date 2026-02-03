import { config } from '../config';
import { getExpiredRequests, updateRequestStatus } from '../db/queries';
import { sendWebhookCallback } from './signature';
import { sendExpirationNotificationEmail } from './email';

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export async function processExpiredRequests(): Promise<void> {
  try {
    const expired = await getExpiredRequests();
    if (expired.length === 0) return;

    console.log(`[Expiration] Found ${expired.length} expired request(s)`);

    // Phase 1: Update all statuses first to prevent re-processing on next interval
    for (const request of expired) {
      try {
        await updateRequestStatus(request.id, 'expired');
      } catch (error) {
        console.error(`[Expiration] Failed to update status for ${request.id}:`, error);
      }
    }

    // Phase 2: Send notifications (failures won't cause re-processing)
    for (const request of expired) {
      try {
        if (request.callback_url) {
          try {
            await sendWebhookCallback(request, 'signature.expired');
          } catch (error) {
            console.error(`[Expiration] Failed to send webhook for ${request.id}:`, error);
          }
        }

        if (!config.demoMode && request.signer_email) {
          try {
            await sendExpirationNotificationEmail(
              request.signer_email,
              request.signer_name,
              request.document_name
            );
          } catch (error) {
            console.error(`[Expiration] Failed to send email for ${request.id}:`, error);
          }
        }
      } catch (error) {
        console.error(`[Expiration] Failed to notify for ${request.id}:`, error);
      }
    }

    console.log(`[Expiration] Processed ${expired.length} expired request(s)`);
  } catch (error) {
    console.error('[Expiration] Failed to process expired requests:', error);
  }
}

export function startExpirationChecker(): void {
  const intervalMs = config.expiration.checkIntervalMinutes * 60 * 1000;

  console.log(`[Expiration] Starting checker (interval: ${config.expiration.checkIntervalMinutes} minutes)`);

  // Run immediately on startup
  processExpiredRequests();

  // Then repeat on interval
  intervalHandle = setInterval(processExpiredRequests, intervalMs);
}

export function stopExpirationChecker(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log('[Expiration] Checker stopped');
  }
}
