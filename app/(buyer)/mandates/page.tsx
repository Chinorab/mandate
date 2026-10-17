import { redirect } from "next/navigation";

// The mandate list lives in History (US4); Mandates opens the builder until then.
export default function MandatesIndex() {
  redirect("/mandates/new");
}
