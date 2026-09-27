import Link from "next/link";
import AppShell, { PageHeader } from "@/components/AppShell";
import EmptyState from "@/components/EmptyState";
import { loadBracket, loadRatings } from "@/lib/data";
import { renderRichText } from "@/lib/sanitize";

export const revalidate = 300;
export const metadata = { title: "About bracketology" };

/**
 * The explainer, written in the admin and stored as HTML.
 *
 * The only markup on the site that comes out of the database, so it goes
 * through `sanitizeHtml` on the way out rather than being trusted because of
 * who wrote it. Styled with a scoped rule block rather than per-element
 * classes, since the markup is authored elsewhere and cannot carry any.
 */
export default async function BracketAboutPage() {
  const [data, state] = await Promise.all([loadRatings(), loadBracket()]);
  const html = renderRichText(state.aboutHtml);

  return (
    <AppShell generated={data.generated}>
      <PageHeader
        title="About bracketology"
        actions={
          <Link href="/bracketology" className="btn">
            Back to the bracket
          </Link>
        }
      />

      {html ? (
        <section className="card p-6 sm:p-7">
          <div
            className="prose-bracket space-y-3.5 text-[15px] leading-relaxed"
            style={{ color: "rgb(var(--text-muted))" }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </section>
      ) : (
        <EmptyState
          icon="info"
          title="Nothing written yet"
          body="The explainer is edited under Admin → Bracketology → Settings."
        />
      )}
    </AppShell>
  );
}
