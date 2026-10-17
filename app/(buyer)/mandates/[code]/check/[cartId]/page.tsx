import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckPage } from "@/components/check/CheckPage";
import { BuyerHeader, PageFrame } from "@/components/shell/Shell";

export const metadata: Metadata = { title: "Mandate check" };

async function Check({ params }: { params: Promise<{ code: string; cartId: string }> }) {
  const { code, cartId } = await params;
  return <CheckPage code={code} cartId={cartId} />;
}

export default function CheckRoute(props: PageProps<"/mandates/[code]/check/[cartId]">) {
  return (
    <PageFrame header={<BuyerHeader />}>
      <Suspense fallback={<p style={{ padding: 32 }}>Loading.</p>}>
        <Check params={props.params} />
      </Suspense>
    </PageFrame>
  );
}
