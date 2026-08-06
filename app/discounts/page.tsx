import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, BadgePercent, Coffee, ExternalLink, Link2, TicketPercent } from 'lucide-react';
import { discountSections, discountSummary } from '@/lib/discounts';

export const metadata: Metadata = {
  title: 'Discounts | LibreNav',
  description: 'Charging memberships, trip-planning links, and other savings resources for LibreNav drivers.'
};

const badgeStyles: Record<string, string> = {
  membership: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100',
  partner: 'border-amber-400/25 bg-amber-400/10 text-amber-100',
  referral: 'border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-100',
  resource: 'border-sky-400/25 bg-sky-400/10 text-sky-100'
};

export default function DiscountsPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#0f172a_0%,#020617_55%,#01040b_100%)] px-4 py-6 text-fg">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-[2rem] border border-line bg-surface/95 p-5 shadow-panel backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/95 px-4 py-2 text-sm font-medium text-muted transition hover:bg-strong"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to map
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href="https://buymeacoffee.com/myevcompanionapp"
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/15 px-4 py-2 text-sm font-semibold text-fg transition hover:bg-amber-500/25"
              >
                <Coffee className="h-4 w-4" />
                Support this project
              </a>
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/25 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-sky-100">
                <BadgePercent className="h-4 w-4" />
                Discounts hub
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
            <section>
              <div className="max-w-3xl">
                <div className="text-xs uppercase tracking-[0.28em] text-subtle">LibreNav savings</div>
                <h1 className="mt-3 text-4xl font-semibold tracking-tight text-fg">Useful savings links, without the clutter.</h1>
                <p className="mt-4 text-base leading-7 text-muted">
                  This hub keeps charging memberships, trip-planning tools, and future LibreNav partner offers in one place.
                  App-specific promo codes are only shown when they exist.
                </p>
                <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  <span className="rounded-full border border-line bg-surface/95 px-3 py-1">
                    {discountSummary.sectionCount} categories
                  </span>
                  <span className="rounded-full border border-line bg-surface/95 px-3 py-1">
                    {discountSummary.itemCount} active links
                  </span>
                  <span className="rounded-full border border-line bg-surface/95 px-3 py-1">
                    {discountSummary.appOfferCount > 0 ? `${discountSummary.appOfferCount} app offer${discountSummary.appOfferCount === 1 ? '' : 's'}` : 'No app-specific promos'}
                  </span>
                </div>
              </div>
            </section>

            <aside className="rounded-[1.75rem] border border-line bg-surface/95 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-fg">
                <TicketPercent className="h-4 w-4 text-sky-300" />
                How this page is organized
              </div>
              <div className="mt-4 space-y-3 text-sm text-muted">
                <p>Categories separate app-specific offers from general EV savings resources.</p>
                <p>Every link opens directly to the provider or official information page.</p>
                <p>Empty sections stay visible so future offer updates only touch one shared content file.</p>
              </div>
            </aside>
          </div>

          <div className="mt-8 grid gap-4 xl:grid-cols-2">
            {discountSections.map((section) => (
              <section key={section.id} className="rounded-[1.75rem] border border-line bg-surface/60 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold text-fg">{section.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-subtle">{section.description}</p>
                  </div>
                  <Link2 className="mt-1 h-5 w-5 text-subtle" />
                </div>

                {section.items.length === 0 ? (
                  <div className="mt-5 rounded-2xl border border-dashed border-line bg-surface/40 p-4">
                    <div className="text-sm font-medium text-muted">{section.emptyStateTitle}</div>
                    <div className="mt-2 text-sm leading-6 text-subtle">{section.emptyStateDescription}</div>
                  </div>
                ) : (
                  <div className="mt-5 space-y-3">
                    {section.items.map((item) => (
                      <a
                        key={`${section.id}-${item.title}`}
                        href={item.href}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-2xl border border-line bg-surface/45 p-4 transition hover:border-line hover:bg-surface/95"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="text-base font-semibold text-fg">{item.title}</div>
                            <div className="mt-2 text-sm leading-6 text-muted">{item.description}</div>
                          </div>
                          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${badgeStyles[item.kind]}`}>
                            {item.badge}
                          </span>
                        </div>
                        <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-sky-200">
                          Open link
                          <ExternalLink className="h-4 w-4" />
                        </div>
                      </a>
                    ))}
                  </div>
                )}

                {section.footnote ? (
                  <div className="mt-4 text-xs leading-5 text-subtle">{section.footnote}</div>
                ) : null}
              </section>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-[1.75rem] border border-line bg-surface/60 p-5">
            <div>
              <div className="text-sm font-semibold text-fg">Keep this list maintainable</div>
              <div className="mt-1 text-sm text-subtle">Future offer changes only need an update in `lib/discounts.ts`.</div>
            </div>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/60 px-4 py-2 text-sm font-medium text-fg transition hover:bg-strong"
            >
              Return to navigation
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
