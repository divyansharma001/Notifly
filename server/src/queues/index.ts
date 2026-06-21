import { Queue } from "bullmq";
import { connection } from "./connection.js";
import type { Channel } from "../types.js";

// The payload that travels from the API to a worker. Everything the worker
// needs to actually send — it never re-reads the DB to send (keeps it fast).
// eventId lets the worker find and update the right notification_log row.
export interface SendJob {
  eventId: string;
  channel: Channel;
  to: string;
  subject: string;
  body: string;
}

// One queue PER CHANNEL. This is the key isolation property: if the SMS
// provider is down and its queue backs up, the email and push queues — and
// their workers — keep flowing. A single outage can't block other channels.
const queues: Record<Channel, Queue<SendJob>> = {
  email: new Queue<SendJob>("email", { connection }),
  sms: new Queue<SendJob>("sms", { connection }),
  push: new Queue<SendJob>("push", { connection }),
};

export function queueFor(channel: Channel): Queue<SendJob> {
  return queues[channel];
}
