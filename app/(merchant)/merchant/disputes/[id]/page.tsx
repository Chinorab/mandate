import type { Metadata } from "next";
import { Suspense } from "react";
import { DisputePage } from "@/components/dispute/DisputePage";
import { MerchantHeader, PageFrame } from "@/components/shell/Shell";

export const metadata: Metadata = {
  title: "Dispute",
  description: "A PayPal dispute on an agent order, its evidence file and the response to PayPal.",
};

async function Dispute({ params, searchParams }: PageProps<"/merchant/disputes/[id]">) {
  const { id } = await params;
  const { pool } = await searchParams;
  return <DisputePage id={id} poolEmpty={pool === "empty"} />;
}

export default function DisputeRoute(props: PageProps<"/merchant/disputes/[id]">) {
  return (
    <PageFrame header={<MerchantHeader />} wide>
      <Suspense fallback={<p style={{ padding: 32 }}>Loading.</p>}>
        <Dispute {...props} />
      </Suspense>
    </PageFrame>
  );
}
