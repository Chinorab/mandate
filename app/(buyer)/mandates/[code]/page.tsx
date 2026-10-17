import type { Metadata } from "next";
import { Suspense } from "react";
import { AgentChat } from "@/components/agent/AgentChat";
import { BuyerHeader, PageFrame } from "@/components/shell/Shell";

export const metadata: Metadata = { title: "Shopping agent" };

async function Chat({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <AgentChat code={code} />;
}

export default function AgentPage(props: PageProps<"/mandates/[code]">) {
  return (
    <PageFrame header={<BuyerHeader />}>
      <Suspense fallback={<p style={{ padding: 32 }}>Loading.</p>}>
        <Chat params={props.params} />
      </Suspense>
    </PageFrame>
  );
}
