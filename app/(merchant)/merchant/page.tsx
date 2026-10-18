import type { Metadata } from "next";
import { OrdersGrid } from "@/components/merchant/grid/OrdersGrid";
import { MerchantHeader, PageFrame } from "@/components/shell/Shell";

export const metadata: Metadata = {
  title: "Agent orders",
  description: "Orders placed by shopping agents under a signed mandate, for the demo store Sample Sports Outlet.",
};

export default function MerchantOrdersPage() {
  return (
    <PageFrame header={<MerchantHeader />} wide>
      <OrdersGrid />
    </PageFrame>
  );
}
