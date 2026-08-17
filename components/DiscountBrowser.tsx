'use client';

import { useMemo, useState } from 'react';
import { BatteryCharging, Car, Landmark, Map, ScanEye, Search, ShoppingBag, Wallet, X } from 'lucide-react';
import type { DiscountLink, DiscountLinkKind, DiscountSection } from '@/lib/discounts';
import { cn } from '@/lib/utils';

type Props = { sections: DiscountSection[] };

/** Pill colours by link kind. Referral stays visually distinct on purpose. */
const DEAL_TONE: Record<DiscountLinkKind, string> = {
  referral: 'border-emerald-500/40 bg-emerald-400/15 text-emerald-800 dark:text-emerald-100',
  membership: 'border-sky-500/40 bg-sky-400/15 text-sky-800 dark:text-sky-100',
  resource: 'border-slate-500/30 bg-slate-400/10 text-slate-700 dark:text-slate-100',
  partner: 'border-amber-500/40 bg-amber-400/15 text-amber-800 dark:text-amber-100'
};

const SECTION_ICON: Record<string, typeof Car> = {
  'tesla-ev': Car,
  'charging-programs': BatteryCharging,
  'planning-tools': Map,
  incentives: Landmark,
  privacy: ScanEye,
  cashback: Wallet,
  everyday: ShoppingBag
};

/** Where a link actually goes, so the destination is readable before clicking. */
function hostOf(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return href;
  }
}

function matches(item: DiscountLink, query: string): boolean {
  const haystack = `${item.title} ${item.description} ${item.deal ?? ''} ${hostOf(item.href)}`.toLowerCase();
  return query.split(/\s+/).every((word) => haystack.includes(word));
}

function DiscountCard({ item }: { item: DiscountLink }) {
  const referral = item.kind === 'referral';

  return (
    <a
      href={item.href}
      target="_blank"
      // `sponsored` on the paid links keeps the markup honest, not just the copy.
      rel={referral ? 'noreferrer noopener sponsored' : 'noreferrer noopener'}
      className="group flex h-full flex-col rounded-2xl border border-line bg-raised p-4 transition hover:border-sky-400/50 hover:bg-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[0.975rem] font-semibold leading-6 text-fg">{item.title}</h3>
        {item.deal ? (
          <span
            className={cn(
              'shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold',
              DEAL_TONE[item.kind]
            )}
          >
            {item.deal}
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-sm leading-6 text-muted">{item.description}</p>

      {item.code ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted">
          <span>Code if asked:</span>
          <code className="rounded-md border border-line bg-surface px-2 py-1 font-mono text-[0.8rem] font-semibold text-fg">
            {item.code}
          </code>
        </div>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-3 pt-3 text-xs text-subtle">
        <span className="truncate group-hover:text-muted">{hostOf(item.href)}</span>
        {referral ? <span className="shrink-0 text-emerald-700 dark:text-emerald-300/80">Referral link</span> : null}
      </div>
    </a>
  );
}

export function DiscountBrowser({ sections }: Props) {
  const [query, setQuery] = useState('');
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const trimmed = query.trim().toLowerCase();

  const visible = useMemo(() => {
    return sections
      .filter((section) => !activeSection || section.id === activeSection)
      .map((section) => ({
        ...section,
        items: trimmed ? section.items.filter((item) => matches(item, trimmed)) : section.items
      }))
      .filter((section) => section.items.length > 0);
  }, [sections, activeSection, trimmed]);

  const resultCount = visible.reduce((count, section) => count + section.items.length, 0);
  const filtering = Boolean(trimmed) || Boolean(activeSection);

  return (
    <div>
      <div className="flex flex-col gap-3">
        <label className="relative block">
          <span className="sr-only">Search discounts</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search discounts, e.g. Tesla, cash back, free"
            className="w-full rounded-full border border-line bg-surface py-3 pl-11 pr-4 text-base text-fg placeholder:text-subtle focus:border-sky-400/60 focus:outline-none"
          />
        </label>

        {/* Seven chips wrap to four rows on a phone and push the first card off
            screen, so below `sm` they scroll sideways on one line instead. */}
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          <button
            type="button"
            onClick={() => setActiveSection(null)}
            aria-pressed={activeSection === null}
            className={cn(
              'shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium transition',
              activeSection === null
                ? 'border-sky-400/50 bg-sky-400/15 text-fg'
                : 'border-line bg-surface text-muted hover:bg-strong hover:text-fg'
            )}
          >
            All
          </button>
          {sections.map((section) => {
            const Icon = SECTION_ICON[section.id];
            const active = activeSection === section.id;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(active ? null : section.id)}
                aria-pressed={active}
                className={cn(
                  'inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-medium transition',
                  active
                    ? 'border-sky-400/50 bg-sky-400/15 text-fg'
                    : 'border-line bg-surface text-muted hover:bg-strong hover:text-fg'
                )}
              >
                {Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
                {section.title}
              </button>
            );
          })}
        </div>

        {filtering ? (
          <div className="flex items-center gap-3 text-sm text-muted">
            <span>
              {resultCount} {resultCount === 1 ? 'link' : 'links'}
            </span>
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setActiveSection(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-medium text-muted transition hover:bg-strong hover:text-fg"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Clear
            </button>
          </div>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-line bg-surface p-6 text-center">
          <div className="text-base font-medium text-fg">Nothing matches “{query.trim()}”</div>
          <p className="mt-2 text-sm leading-6 text-muted">Try a shorter word, or clear the filters to see every link.</p>
        </div>
      ) : (
        <div className="mt-8 space-y-10">
          {visible.map((section) => {
            const Icon = SECTION_ICON[section.id];
            return (
              <section key={section.id} id={section.id} className="scroll-mt-6">
                <div className="flex items-baseline gap-2.5">
                  {Icon ? <Icon className="h-5 w-5 shrink-0 translate-y-0.5 text-sky-700 dark:text-sky-300" aria-hidden /> : null}
                  <h2 className="text-xl font-semibold tracking-tight text-fg">{section.title}</h2>
                  <span className="text-sm text-subtle">{section.items.length}</span>
                </div>
                <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted">{section.description}</p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {section.items.map((item) => (
                    <DiscountCard key={item.href} item={item} />
                  ))}
                </div>

                {section.footnote ? (
                  <p className="mt-3 max-w-2xl text-xs leading-5 text-subtle">{section.footnote}</p>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
