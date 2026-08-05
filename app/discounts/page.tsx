import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, BadgePercent, ExternalLink, Link2, TicketPercent } from 'lucide-react';
import { discountSections, discountSummary } from '@/lib/discounts';

export const metadata: Metadata = {
  title: 'Discounts | OpenNav',
  description: 'Charging memberships, trip-planning links, and other savings resources for OpenNav drivers.'
};

const badgeStyles: Record<string, string> = {
  membership: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100',
  partner: 'border-amber-400/25 bg-amber-400/10 text-amber-100',
  referral: 'border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-100',
  resource: 'border-sky-400/25 bg-sky-400/10 text-sky-100'
};

export default function DiscountsPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#0f172a_0%,#020617_55%,#01040b_100%)] px-4 py-6 text-slate-100">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-[2rem] border border-border bg-slate-950/70 p-5 shadow-panel backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-slate-900/80 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to map
            </Link>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/25 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-sky-100">
              <BadgePercent className="h-4 w-4" />
              Discounts hub
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
            <section>
              <div className="max-w-3xl">
                <div className="text-xs uppercase tracking-[0.28em] text-slate-400">OpenNav savings</div>
                <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">Useful savings links, without the clutter.</h1>
                <p className="mt-4 text-base leading-7 text-slate-300">
                  This hub keeps charging memberships, trip-planning tools, and future OpenNav partner offers in one place.
                  App-specific promo codes are only shown when they exist.
                </p>
                <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200">
                  <span className="rounded-full border border-border bg-slate-900/70 px-3 py-1">
                    {discountSummary.sectionCount} categories
                  </span>
                  <span className="rounded-full border border-border bg-slate-900/70 px-3 py-1">
                    {discountSummary.itemCount} active links
                  </span>
                  <span className="rounded-full border border-border bg-slate-900/70 px-3 py-1">
                    {discountSummary.appOfferCount > 0 ? `${discountSummary.appOfferCount} app offer${discountSummary.appOfferCount === 1 ? '' : 's'}` : 'No app-specific promos'}
                  </span>
                </div>
              </div>
            </section>

            <aside className="rounded-[1.75rem] border border-border bg-slate-900/70 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <TicketPercent className="h-4 w-4 text-sky-300" />
                How this page is organized
              </div>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <p>Categories separate app-specific offers from general EV savings resources.</p>
                <p>Every link opens directly to the provider or official information page.</p>
                <p>Empty sections stay visible so future offer updates only touch one shared content file.</p>
              </div>
            </aside>
          </div>

          <div className="mt-8 grid gap-4 xl:grid-cols-2">
            {discountSections.map((section) => (
              <section key={section.id} className="rounded-[1.75rem] border border-border bg-slate-900/60 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold text-white">{section.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{section.description}</p>
                  </div>
                  <Link2 className="mt-1 h-5 w-5 text-slate-500" />
                </div>

                {section.items.length === 0 ? (
                  <div className="mt-5 rounded-2xl border border-dashed border-border bg-slate-950/40 p-4">
                    <div className="text-sm font-medium text-slate-200">{section.emptyStateTitle}</div>
                    <div className="mt-2 text-sm leading-6 text-slate-400">{section.emptyStateDescription}</div>
                  </div>
                ) : (
                  <div className="mt-5 space-y-3">
                    {section.items.map((item) => (
                      <a
                        key={`${section.id}-${item.title}`}
                        href={item.href}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-2xl border border-border bg-slate-950/45 p-4 transition hover:border-slate-600 hover:bg-slate-900/80"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="text-base font-semibold text-white">{item.title}</div>
                            <div className="mt-2 text-sm leading-6 text-slate-300">{item.description}</div>
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
                  <div className="mt-4 text-xs leading-5 text-slate-500">{section.footnote}</div>
                ) : null}
              </section>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-[1.75rem] border border-border bg-slate-900/60 p-5">
            <div>
              <div className="text-sm font-semibold text-white">Keep this list maintainable</div>
              <div className="mt-1 text-sm text-slate-400">Future offer changes only need an update in `lib/discounts.ts`.</div>
            </div>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-slate-950/60 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-800"
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
