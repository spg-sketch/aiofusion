import { db, contactSubmissionsTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import {
  ContactEmailNotAccepted,
  sendBookDemoInternalAlert, sendBookDemoConfirmation,
  sendEnquiryInternalAlert, sendEnquiryConfirmation,
} from "../lib/notify-email";

export class UnknownContactDelivery extends Error {}

type MessageKind = "internal" | "customer";

/**
 * Claim a message by committing an unknown state before calling the provider.
 * An interrupted send or an acceptance-state write failure remains unknown
 * across processes/restarts; only a confirmed rejection can restore retryability.
 */
async function sendPending(
  id: number, kind: MessageKind, send: () => Promise<void>,
): Promise<string | null> {
  const column = kind === "internal"
    ? contactSubmissionsTable.internalEmailAccepted
    : contactSubmissionsTable.customerEmailAccepted;
  const [claimed] = await db.update(contactSubmissionsTable)
    .set({ [kind === "internal" ? "internalEmailAccepted" : "customerEmailAccepted"]: null, updatedAt: new Date() })
    .where(and(eq(contactSubmissionsTable.id, id), eq(column, false)))
    .returning({ id: contactSubmissionsTable.id });
  if (!claimed) throw new UnknownContactDelivery("Delivery state changed. Refresh the lead before retrying.");

  try {
    await send();
  } catch (err) {
    if (err instanceof ContactEmailNotAccepted) {
      await db.update(contactSubmissionsTable)
        .set({ [kind === "internal" ? "internalEmailAccepted" : "customerEmailAccepted"]: false, updatedAt: new Date() })
        .where(and(eq(contactSubmissionsTable.id, id), isNull(column)));
    }
    // Transport errors and missing provider receipts are indeterminate: never
    // turn the pre-send unknown claim back into a retryable false.
    return `${kind === "internal" ? "Internal alert" : "Customer confirmation"}: ${String(err)}`;
  }

  await db.update(contactSubmissionsTable)
    .set({ [kind === "internal" ? "internalEmailAccepted" : "customerEmailAccepted"]: true, updatedAt: new Date() })
    .where(and(eq(contactSubmissionsTable.id, id), isNull(column)));
  return null;
}

export async function deliverContactEmails(id: number): Promise<string[]> {
  const [row] = await db.select().from(contactSubmissionsTable)
    .where(eq(contactSubmissionsTable.id, id)).limit(1);
  if (!row) throw new Error("Submission not found");
  if (row.internalEmailAccepted === null || row.customerEmailAccepted === null) {
    throw new UnknownContactDelivery("Delivery state is unknown. Check provider records before sending manually.");
  }
  if (row.type !== "book-demo" && row.type !== "enquiry") {
    throw new Error(`Unknown submission type: ${row.type}`);
  }

  const errors: string[] = [];
  if (!row.internalEmailAccepted) {
    const error = await sendPending(id, "internal", () => row.type === "book-demo"
      ? sendBookDemoInternalAlert({ submissionId: id, name: row.name, email: row.email, company: row.company, goal: row.goal ?? "" })
      : sendEnquiryInternalAlert({ submissionId: id, name: row.name, email: row.email, company: row.company, subject: row.subject ?? "", message: row.message ?? "" }));
    if (error) errors.push(error);
  }
  if (!row.customerEmailAccepted) {
    const error = await sendPending(id, "customer", () => row.type === "book-demo"
      ? sendBookDemoConfirmation({ submissionId: id, name: row.name, toEmail: row.email })
      : sendEnquiryConfirmation({ submissionId: id, name: row.name, toEmail: row.email }));
    if (error) errors.push(error);
  }
  if (errors.length === 0) {
    await db.update(contactSubmissionsTable)
      .set({ emailFailed: false, updatedAt: new Date() })
      .where(and(eq(contactSubmissionsTable.id, id),
        eq(contactSubmissionsTable.internalEmailAccepted, true),
        eq(contactSubmissionsTable.customerEmailAccepted, true)));
  }
  return errors;
}