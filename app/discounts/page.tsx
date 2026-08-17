import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Coffee, Info } from 'lucide-react';
import { DiscountBrowser } from '@/components/DiscountBrowser';
import { discountSections, discountSummary } from '@/lib/discounts';

export const metadata: Metadata = {
  title: 'Discounts | LibreNav',
  description: 'Charging memberships, EV referrals, cash-back apps, and trip-planning links for LibreNav drivers.'
};

export default function DiscountsPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#0f172a_0%,#020617_55%,#01040b_100%)] px-4 py-6 text-fg">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-[2rem] border border-line bg-surface p-5 shadow-panel sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium text-muted transition hover:bg-strong hover:text-fg"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to map
            </Link>
            <a
              href="https://buymeacoffee.com/myevcompanionapp"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/15 px-4 py-2 text-sm font-semibold text-fg transition hover:bg-amber-500/25"
            >
              <Coffee className="h-4 w-4" aria-hidden />
              Support this project
            </a>
          </div>

          <header className="mt-8 max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Discounts</h1>
            <p className="mt-3 text-base leading-7 text-muted">
              {discountSummary.itemCount} links in {discountSummary.sectionCount} groups — EV referrals, charging
              memberships, incentive research, and cash-back apps. Search or filter to find one.
            </p>
          </header>

          {/*
            FTC guidance is to disclose before the link, not in a footer. It also
            answers the question a reader has anyway — why is this list here.
          */}
          <div className="mt-6 flex max-w-3xl items-start gap-3 rounded-2xl border border-line bg-raised p-4">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" aria-hidden />
            <p className="text-sm leading-6 text-muted">
              <span className="font-semibold text-fg">{discountSummary.referralCount} are referral links</span>, marked as
              such on the card. Using one supports LibreNav at no extra cost to you. The rest are plain links to networks
              and official sources.
            </p>
          </div>

          <div className="mt-8">
            <DiscountBrowser sections={discountSections} />
          </div>

          <footer className="mt-12 border-t border-line pt-6 text-sm leading-6 text-subtle">
            Offers change without notice — the terms shown by the provider at checkout are the ones that apply. Spotted a
            dead link?{' '}
            <a
              href="https://github.com/rike4545/LibreNav/issues"
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium text-sky-300 underline underline-offset-4 hover:text-sky-200"
            >
              Open an issue
            </a>
            .
          </footer>
        </div>
      </div>
    </main>
  );
}
