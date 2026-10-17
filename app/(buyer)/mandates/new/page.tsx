import type { Metadata } from "next";
import { Suspense } from "react";
import { MandateBuilder } from "@/components/mandate/MandateBuilder";
import { BuyerHeader, PageFrame } from "@/components/shell/Shell";
import s from "../mandates.module.css";

export const metadata: Metadata = {
  title: "New mandate",
  description: "Say what your agent may buy. Review each term before you sign.",
};

export default function NewMandatePage() {
  return (
    <PageFrame header={<BuyerHeader />}>
      <main id="main" className={s.main}>
        <div className={s.intro}>
          <h1>New mandate</h1>
          <p>Say what your agent may buy. Review each term before you sign.</p>
        </div>
        <Suspense fallback={<p className={s.loading}>Loading.</p>}>
          <MandateBuilder />
        </Suspense>
      </main>
    </PageFrame>
  );
}
