import type { Metadata } from "next";
import { ClaimDispute } from "@/components/dispute/ClaimDispute";
import { MerchantHeader, PageFrame } from "@/components/shell/Shell";

export const metadata: Metadata = {
  title: "Disputes",
  description: "Answer a PayPal dispute on an agent order with the signed mandate as evidence.",
};

export default function DisputesPage() {
  return (
    <PageFrame header={<MerchantHeader />} wide>
      <ClaimDispute />
    </PageFrame>
  );
}
