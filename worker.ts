import { withStorage } from "./src/lib/storage";
import vinextHandler from "vinext/server/fetch-handler";
import {
  processInboundMessage,
  storeRawToR2,
  type InboundQueueMessage,
} from "./src/lib/email/inbound";
import { processOutboundQueue } from "./src/lib/email/send";
import {
  isAgentDraftMessage,
  getQueueRetryDelaySeconds,
  isInboundQueueMessage,
  isOutboundQueueMessage,
  isWebhookRetryMessage,
} from "./worker-utils";
import { processWebhookRetry } from "./src/lib/email/webhooks";
import { resolveIncomingMail, forwardMessage } from "./src/lib/email/incoming";
import { getUserFromSession } from "./src/lib/auth/session";
import { getSessionTokenFromRequest } from "./src/lib/realtime/utils";
import { inboundAttachmentLimitReasonFromRaw } from "./src/lib/email/inbound-attachments";
import { hasValidSessionMutationOrigin } from "./src/lib/auth/origin";
import {
  getAccountForwardingDestination,
  MAILFLARE_FORWARDED_HEADER,
} from "./src/lib/email/account-forwarding";
import { runScheduledDatabaseBackup } from "./src/lib/backups/runner";
import { processAgentDraftJob } from "./src/lib/agent/jobs/utils";
import { runAgentMaintenance } from "./src/lib/agent/maintenance";
import { runTrashRetention } from "./src/lib/email/trash-retention";
import { runDriveTrashRetention } from "./src/lib/drive/retention";
export { RealtimeHub } from "./src/lib/realtime/hub";

export default {
  async fetch(request: Request, rawEnv: CloudflareEnv, ctx: ExecutionContext) {
    const env = withStorage(rawEnv);
    const url = new URL(request.url);
    if (url.pathname === "/api/realtime") {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return new Response("Expected WebSocket upgrade", { status: 426 });
      }
      if (!hasValidSessionMutationOrigin(request)) {
        return new Response("Invalid origin", { status: 403 });
      }

      const user = await getUserFromSession(env, getSessionTokenFromRequest(request));
      if (!user || user.disabled) {
        return new Response("Unauthorized", { status: 401 });
      }

      const hub = env.REALTIME.getByName(user.id);
      const hubRequest = new Request("https://mailflare-realtime/connect", request);
      hubRequest.headers.set("X-Mailflare-Realtime-User", user.id);
      return hub.fetch(hubRequest);
    }

    return vinextHandler.fetch(request, env, ctx);
  },

  async email(message: ForwardableEmailMessage, rawEnv: CloudflareEnv) {
    const env = withStorage(rawEnv);
    try {
      if (message.rawSize > 25 * 1024 * 1024) {
        message.setReject(
          "Message rejected: raw email exceeds the 25 MiB receiving limit. Send a download link instead.",
        );
        return;
      }
      // Domain routing rules are resolved here rather than in the queue because reject and
      // forward can only be actioned on the live ForwardableEmailMessage.
      const decision = await resolveIncomingMail(env, message.from, message.to);

      if (decision?.action === "reject") {
        message.setReject(decision.rejectReason ?? "Message rejected by routing rule");
        return;
      }

      // Parse one tee branch as a stream while the other is persisted; this avoids
      // retaining a second whole-message copy solely for attachment-limit checking.
      const [mimeStream, storageStream] = message.raw.tee();

      const [attachmentLimitReason, raw] = await Promise.all([
        inboundAttachmentLimitReasonFromRaw(mimeStream),
        new Response(storageStream).arrayBuffer(),
      ]);

      if (attachmentLimitReason) {
        message.setReject(attachmentLimitReason);
        return;
      }

      if (decision?.action === "forward" && decision.forwardTo) {
        const forwarded = await forwardMessage(message, decision.forwardTo);
        // A forward rule drops the message unless it was explicitly asked to keep a copy.
        // If the forward itself failed we still store it, so mail is never silently lost.
        if (forwarded && !decision.keepCopy) return;
      }

      if (message.headers.get(MAILFLARE_FORWARDED_HEADER) !== "1") {
        const forwardingDestination = await getAccountForwardingDestination(env, message.to);
        if (forwardingDestination) {
          await forwardMessage(message, forwardingDestination);
        }
      }
      const rawR2Key = await storeRawToR2(env, message.from, message.to, raw);
      const payload: InboundQueueMessage = {
        from: message.from,
        to: message.to,
        rawR2Key,
        headers: Object.fromEntries(message.headers),
      };
      await env.INBOUND_QUEUE.send(payload);
    } catch (err) {
      console.error(
        JSON.stringify({
          event: "email.inbound_enqueue_failed",
          error: err instanceof Error ? { name: err.name, message: err.message } : String(err),
        }),
      );
      message.setReject("Processing failed");
    }
  },

  async queue(batch: MessageBatch, rawEnv: CloudflareEnv): Promise<void> {
    const env = withStorage(rawEnv);
    for (const msg of batch.messages) {
      try {
        if (isInboundQueueMessage(msg.body)) {
          await processInboundMessage(env, msg.body);
        } else if (isAgentDraftMessage(msg.body)) {
          await processAgentDraftJob(env, msg.body.jobId);
        } else if (isWebhookRetryMessage(msg.body)) {
          await processWebhookRetry(env, msg.body);
        } else if (isOutboundQueueMessage(msg.body)) {
          await processOutboundQueue(env, msg.body);
        } else {
          throw new Error("Unknown queue message type");
        }
        msg.ack();
      } catch (err) {
        console.error(
          JSON.stringify({
            event: "queue.processing_failed",
            queue: batch.queue,
            messageId: msg.id,
            attempts: msg.attempts,
            error: err instanceof Error ? { name: err.name, message: err.message } : String(err),
          }),
        );
        // Queues provide at-least-once delivery. Exponential retry spacing avoids
        // repeatedly hitting a failing dependency; exhausted messages go to the configured DLQ.
        msg.retry({ delaySeconds: getQueueRetryDelaySeconds(msg.attempts) });
      }
    }
  },

  async scheduled(controller: ScheduledController, rawEnv: CloudflareEnv, ctx: ExecutionContext) {
    const env = withStorage(rawEnv);

    const scheduledAt = new Date(controller.scheduledTime);

    const scheduleTask = (task: string, work: Promise<unknown>) => {
      ctx.waitUntil(
        work.catch((error) => {
          console.error(
            JSON.stringify({
              event: "scheduled.task_failed",
              task,
              cron: controller.cron,
              scheduledTime: controller.scheduledTime,
              error:
                error instanceof Error
                  ? { name: error.name, message: error.message }
                  : String(error),
            }),
          );
        }),
      );
    };

    if (controller.cron === "0 2 * * *")
      scheduleTask("database_backup", runScheduledDatabaseBackup(env, scheduledAt));
    scheduleTask("agent_maintenance", runAgentMaintenance(env));
    scheduleTask("trash_retention", runTrashRetention(env, scheduledAt));

    // Drive trash is emptied once a day, with the 02:00 UTC cron; the 5-minute cron is for queue-like upkeep.
    if (controller.cron === "0 2 * * *")
      scheduleTask("drive_trash_retention", runDriveTrashRetention(env, scheduledAt));
  },
} satisfies ExportedHandler<CloudflareEnv>;
