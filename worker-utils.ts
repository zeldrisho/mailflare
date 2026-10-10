import { z } from "zod";
import type { InboundQueueMessage } from "./src/lib/email/inbound";
import type { OutboundQueueMessage } from "./src/lib/email/send";
import type { WebhookRetryMessage } from "./src/lib/email/webhooks";

const inboundQueueMessageSchema = z.object({
  from: z.string(),
  to: z.string(),
  rawR2Key: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
});

const webhookRetryMessageSchema = z.object({
  kind: z.literal("webhook.retry"),
  deliveryId: z.string(),
});

const agentDraftMessageSchema = z.object({
  kind: z.literal("agent.draft"),
  jobId: z.string(),
});

const outboundQueueMessageSchema = z.object({
  kind: z.literal("email.scheduled"),
  jobId: z.string(),
  messageId: z.string(),
  scheduledAt: z.string(),
});

export function isInboundQueueMessage(payload: unknown): payload is InboundQueueMessage {
  return inboundQueueMessageSchema.safeParse(payload).success;
}

export function isWebhookRetryMessage(payload: unknown): payload is WebhookRetryMessage {
  return webhookRetryMessageSchema.safeParse(payload).success;
}

export function isAgentDraftMessage(
  payload: unknown,
): payload is { kind: "agent.draft"; jobId: string } {
  return agentDraftMessageSchema.safeParse(payload).success;
}

export function getQueueRetryDelaySeconds(attempts: number): number {
  return Math.min(10 * 2 ** Math.max(attempts - 1, 0), 300);
}

export function isOutboundQueueMessage(payload: unknown): payload is OutboundQueueMessage {
  return outboundQueueMessageSchema.safeParse(payload).success;
}
