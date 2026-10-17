import { Mark } from "@/components/ui/Mark";
import styles from "./page.module.css";

// Placeholder until the landing page (US7) is built from design/project/Main.dc.html.
export default function Home() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.inner}>
          <span className={styles.brand}>
            <Mark />
            <span className={styles.wordmark}>Mandate</span>
          </span>
        </div>
      </header>
      <main id="main" className={styles.main}>
        <h1 className={styles.title}>Proof of what your agent was allowed to buy.</h1>
        <p className={styles.lede}>
          Write a mandate in plain words. Your agent shops inside it, and every PayPal payment
          carries the record.
        </p>
      </main>
      <footer className={styles.footer}>
        <div className={styles.inner}>
          © 2026 Mandate. PayPal is a trademark of its owner. Mandate is not affiliated with PayPal.
        </div>
      </footer>
    </div>
  );
}
