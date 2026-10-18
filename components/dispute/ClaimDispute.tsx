"use client";

/**
 * Merchant "Disputes" entry (FR-032): claims this session's pool dispute and opens it. With nothing to
 * show, explains how a dispute reaches the demo.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { REPO_URL } from "@/components/shell/Shell";
import { ApiCallError, disputeApi } from "@/lib/client/api";
import s from "./dispute.module.css";

export function ClaimDispute() {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "none" | { error: string }>("loading");

  useEffect(() => {
    let stop = false;
    disputeApi
      .claim()
      .then((c) => {
        if (stop) return;
        if (c.disputeId) router.replace(`/merchant/disputes/${c.disputeId}${c.poolEmpty ? "?pool=empty" : ""}`);
        else setState("none");
      })
      .catch((e) => !stop && setState({ error: e instanceof ApiCallError ? e.message : "Disputes could not be loaded. Reload the page." }));
    return () => {
      stop = true;
    };
  }, [router]);

  if (state === "loading") {
    return (
      <main id="main" className={s.empty} aria-busy="true">
        <p role="status">Opening your dispute.</p>
      </main>
    );
  }
  return (
    <main id="main" className={s.empty}>
      <h1>No dispute to answer</h1>
      {typeof state === "object" ? (
        <p role="alert">{state.error}</p>
      ) : (
        <>
          <p>
            Disputes arrive from PayPal when a sandbox buyer reports a problem with an agent order. Each demo session answers one
            dispute from the pool, and every dispute in it has been answered.
          </p>
          <p>
            To open a new one in the PayPal sandbox, follow the <a href={`${REPO_URL}#open-a-sandbox-dispute`}>steps in the README</a>.
          </p>
        </>
      )}
      <Link href="/merchant">Back to all orders</Link>
    </main>
  );
}
