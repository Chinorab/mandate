import type { Metadata } from "next";
import { Suspense } from "react";
import { HistoryPage } from "@/components/history/HistoryPage";
import { BuyerHeader, PageFrame } from "@/components/shell/Shell";

export const metadata: Metadata = {
  title: "History",
  description: "Your mandates, what your agent did under each one, and their receipts.",
};

export default function History() {
  return (
    <PageFrame header={<BuyerHeader />}>
      <Suspense fallback={<p style={{ padding: 32 }}>Loading.</p>}>
        <HistoryPage />
      </Suspense>
    </PageFrame>
  );
}
