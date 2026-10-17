import { PageFrame, PublicHeader } from "@/components/shell/Shell";
import styles from "./page.module.css";

// Placeholder until the landing page (US7) is built from design/project/Main.dc.html.
export default function Home() {
  return (
    <PageFrame header={<PublicHeader />}>
      <main id="main" className={styles.main}>
        <h1 className={styles.title}>Proof of what your agent was allowed to buy.</h1>
        <p className={styles.lede}>
          Write a mandate in plain words. Your agent shops inside it, and every PayPal payment carries the
          record.
        </p>
      </main>
    </PageFrame>
  );
}
