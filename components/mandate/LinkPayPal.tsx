"use client";

/**
 * Links the buyer's PayPal to a signed mandate with the PayPal JS SDK v6 "save without purchase"
 * flow. The only PayPal visual is the official button rendered by the SDK (constitution VII).
 *
 * Flow: browser safe client token (our server) -> createInstance -> eligibility for
 * VAULT_WITHOUT_PAYMENT -> createPayPalSavePaymentSession -> on click, start() with a setup token
 * created by our server -> onApprove sends the setup token back, our server swaps it for a payment
 * token that never reaches the browser.
 * The exact start() promise shape is confirmed by sandbox script 02 (T014).
 */
import { useEffect, useRef, useState } from "react";
import { StateIcon } from "@/components/ui/icons";
import { ApiCallError, mandateApi, type MandateView } from "@/lib/client/api";
import s from "./builder.module.css";

const SDK_URL = "https://www.sandbox.paypal.com/web-sdk/v6/core";

type SaveSession = {
  start: (options: { presentationMode: "auto" }, setupToken: Promise<{ vaultSetupToken: string }>) => Promise<void>;
};
type SdkInstance = {
  findEligibleMethods: (o: { currencyCode: string; paymentFlow: string }) => Promise<{ isEligible: (m: string) => boolean }>;
  createPayPalSavePaymentSession: (o: {
    onApprove: (data: { vaultSetupToken: string }) => Promise<void> | void;
    onCancel: () => void;
    onError: (e: unknown) => void;
  }) => SaveSession;
};
declare global {
  interface Window {
    paypal?: { createInstance: (o: { clientToken: string; components: string[]; pageType: string }) => Promise<SdkInstance> };
  }
}

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "paypal-button": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { type?: string };
    }
  }
}

let sdkPromise: Promise<void> | null = null;
function loadSdk(): Promise<void> {
  sdkPromise ??= new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = SDK_URL;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      sdkPromise = null;
      reject(new Error("PayPal SDK failed to load"));
    };
    document.head.appendChild(el);
  });
  return sdkPromise;
}

type State =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "linking" }
  | { kind: "cancelled" }
  | { kind: "unavailable"; message: string }
  | { kind: "error"; message: string };

export function LinkPayPal({ code, onLinked }: { code: string; onLinked: (m: MandateView) => void }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const session = useRef<SaveSession | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { accessToken } = await mandateApi.clientToken();
        await loadSdk();
        if (!window.paypal) throw new Error("PayPal SDK missing");
        const sdk = await window.paypal.createInstance({ clientToken: accessToken, components: ["paypal-payments"], pageType: "checkout" });
        const eligible = await sdk.findEligibleMethods({ currencyCode: "USD", paymentFlow: "VAULT_WITHOUT_PAYMENT" });
        if (!eligible.isEligible("paypal")) throw new Error("not eligible");
        session.current = sdk.createPayPalSavePaymentSession({
          onApprove: async ({ vaultSetupToken }) => {
            setState({ kind: "linking" });
            try {
              const r = await mandateApi.confirmLink(code, vaultSetupToken);
              onLinked(r.mandate);
            } catch (e) {
              setState({ kind: "error", message: e instanceof ApiCallError ? e.message : "PayPal could not be linked. Try again." });
            }
          },
          onCancel: () => setState({ kind: "cancelled" }),
          onError: () => setState({ kind: "error", message: "PayPal could not be linked. Try again." }),
        });
        if (alive) setState({ kind: "ready" });
      } catch (e) {
        if (!alive) return;
        if (e instanceof ApiCallError && e.status === 503) setState({ kind: "unavailable", message: e.message });
        else setState({ kind: "error", message: "PayPal is not available right now. Reload the page to try again." });
      }
    })();
    return () => {
      alive = false;
    };
  }, [code, onLinked]);

  const start = () => {
    if (!session.current) return;
    // Not awaited before start(): the SDK needs the click's transient activation.
    const setup = mandateApi.setupToken(code).then((r) => ({ vaultSetupToken: r.setupTokenId }));
    session.current.start({ presentationMode: "auto" }, setup).catch(() =>
      setState({ kind: "error", message: "PayPal could not be opened. Try again." }),
    );
  };

  const message =
    state.kind === "loading"
      ? "Loading PayPal."
      : state.kind === "linking"
        ? "Linking PayPal to this mandate."
        : state.kind === "cancelled"
          ? "PayPal was not linked. You can try again."
          : null;
  const showButton = state.kind === "ready" || state.kind === "cancelled";

  return (
    <div className={s.field}>
      {showButton ? (
        <div className={s.paypalSlot}>
          <paypal-button type="pay" onClick={start} />
        </div>
      ) : null}
      <p className={s.linkState} role="status" aria-busy={state.kind === "loading" || state.kind === "linking"} hidden={!message}>
        {message}
      </p>
      {state.kind === "unavailable" || state.kind === "error" ? (
        <div className={`${s.alert} ${state.kind === "unavailable" ? s.info : ""}`} role="alert">
          <StateIcon name="info" size={16} />
          <span>{state.message}</span>
        </div>
      ) : null}
    </div>
  );
}
