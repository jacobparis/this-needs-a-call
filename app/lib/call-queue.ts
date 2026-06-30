import { handleCallback, send } from "@vercel/queue";
import {
  addCallEvent,
  setActiveCallSession,
  type CallEvent,
} from "@/app/lib/calls";
import { withHydratedCallStore } from "@/app/lib/call-storage";

export const CALL_EVENTS_TOPIC = "this-needs-a-call-events";

export type QueuedCallEvent = {
  event: CallEvent;
};

export async function enqueueCallEvent(event: CallEvent): Promise<void> {
  try {
    await send<QueuedCallEvent>(
      CALL_EVENTS_TOPIC,
      { event },
      {
        idempotencyKey: event.id,
        retentionSeconds: 60 * 60 * 24,
      },
    );
  } catch (error) {
    console.warn("call queue publish failed", error);
  }
}

export const handleCallEventQueue = handleCallback<QueuedCallEvent>(
  async (message) => {
    await withHydratedCallStore(
      async () => {
        const event = message.event;
        if (!event || typeof event.id !== "string") {
          return;
        }

        if (event.sessionId) {
          setActiveCallSession(event.sessionId);
        }
        addCallEvent({
          type: event.type,
          detail: event.detail,
          payload: event.payload,
          id: event.id,
          sequence: event.sequence,
          batchId: event.batchId,
          createdAt: event.createdAt,
          delivered: event.delivered,
          publish: false,
        });
      },
      { persist: true },
    );
  },
  {
    visibilityTimeoutSeconds: 60,
    retry: () => ({ afterSeconds: 10 }),
  },
);
