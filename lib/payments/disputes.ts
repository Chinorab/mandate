/**
 * PayPal Customer Disputes v1 (research R5), sandbox only. Evidence goes through provide-evidence as
 * multipart form data: an "input" JSON part with evidences[] and the document files. Reading disputes
 * for the merchant agent goes through the Agent Toolkit (get_dispute); this module covers what the
 * toolkit does not: submitting evidence, listing for the operator's pool sync, and the sandbox only
 * require-evidence step.
 *
 * Submission is reached only from lib/disputes/submit.ts, after the merchant confirmed accuracy.
 */
import { createPayPalClient, getPayPal, type PayPalClient } from "./paypal-rest";

export type EvidenceType = "BILLING_AGREEMENT" | "PROOF_OF_FULFILLMENT" | "COPY_OF_CONTRACT" | "DETAILS_OF_PURCHASE";

export type Evidence = {
  evidence_type: EvidenceType;
  notes?: string;
  evidence_info?: { tracking_info: { carrier_name: string; tracking_number: string }[] };
  documents?: { name: string }[];
};

export type EvidenceSubmission = {
  evidences: Evidence[];
  files: { name: string; bytes: Uint8Array; type: "application/pdf" }[];
};

export type DisputesClient = {
  provideEvidence(paypalDisputeId: string, submission: EvidenceSubmission): Promise<{ status?: string }>;
};

/** Shape of a dispute in the v1 API and in CUSTOMER.DISPUTE.* webhook resources (fields we read). */
export type PayPalDispute = {
  dispute_id: string;
  create_time?: string;
  reason?: string;
  status?: string;
  dispute_life_cycle_stage?: string;
  dispute_amount?: { currency_code: string; value: string };
  seller_response_due_date?: string;
  disputed_transactions?: { seller_transaction_id?: string; custom?: string }[];
};

export function disputesConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET);
}

function safeId(id: string): string {
  if (!/^[A-Za-z0-9-]{4,64}$/.test(id)) throw new Error("Invalid dispute id");
  return encodeURIComponent(id);
}

export function createDisputesClient(client: PayPalClient = getPayPal()) {
  return {
    async provideEvidence(paypalDisputeId: string, submission: EvidenceSubmission) {
      const form = new FormData();
      form.append("input", new Blob([JSON.stringify({ evidences: submission.evidences })], { type: "application/json" }));
      submission.files.forEach((f, i) => form.append(`file${i + 1}`, new Blob([f.bytes as BlobPart], { type: f.type }), f.name));
      const res = await client.request<{ links?: unknown[] }>(`/v1/customer/disputes/${safeId(paypalDisputeId)}/provide-evidence`, {
        method: "POST",
        form,
      });
      void res;
      // PayPal answers with links only; the dispute moves to UNDER_REVIEW.
      return { status: "UNDER_REVIEW" };
    },
    async listOpen(): Promise<PayPalDispute[]> {
      const res = await client.request<{ items?: PayPalDispute[] }>("/v1/customer/disputes?dispute_state=REQUIRED_ACTION&page_size=50");
      return res?.items ?? [];
    },
    async get(paypalDisputeId: string): Promise<PayPalDispute> {
      return client.request<PayPalDispute>(`/v1/customer/disputes/${safeId(paypalDisputeId)}`);
    },
    /** Sandbox only: moves a dispute from UNDER_REVIEW to WAITING_FOR_SELLER_RESPONSE. */
    async requireEvidence(paypalDisputeId: string) {
      await client.request(`/v1/customer/disputes/${safeId(paypalDisputeId)}/require-evidence`, {
        method: "POST",
        json: { action: "SELLER_EVIDENCE" },
        requestId: `require-evidence-${paypalDisputeId}`,
      });
    },
  };
}

export type SandboxDisputes = ReturnType<typeof createDisputesClient>;

/** For scripts: a client bound to the given environment. */
export function sandboxDisputes(env: Record<string, string | undefined>) {
  return createDisputesClient(createPayPalClient({ env }));
}
