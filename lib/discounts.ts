export type DiscountLinkKind = 'membership' | 'resource' | 'partner' | 'referral';

export type DiscountLink = {
  title: string;
  href: string;
  description: string;
  badge: string;
  kind: DiscountLinkKind;
};

export type DiscountSection = {
  id: string;
  title: string;
  description: string;
  emptyStateTitle: string;
  emptyStateDescription: string;
  footnote?: string;
  items: DiscountLink[];
};

export const discountSections: DiscountSection[] = [
  {
    id: 'app-offers',
    title: 'LibreNav offers',
    description: 'App-specific codes and affiliate campaigns live here when they are available.',
    emptyStateTitle: 'No active LibreNav offers',
    emptyStateDescription: 'LibreNav does not have any live coupon codes, referrals, or affiliate links configured right now.',
    footnote: 'Keeping this section visible means future partner changes only need one content edit.',
    items: []
  },
  {
    id: 'charging-programs',
    title: 'Charging memberships',
    description: 'Programs that can reduce public charging costs or unlock member pricing.',
    emptyStateTitle: 'No charging memberships listed',
    emptyStateDescription: 'Add only programs that clearly help drivers compare member pricing or charging access.',
    footnote: 'These are practical cost-saving programs, not paid placements.',
    items: [
      {
        title: 'Tesla charging',
        href: 'https://www.tesla.com/charging',
        description: 'Compare Supercharging and destination charging options before longer trips.',
        badge: 'Network',
        kind: 'membership'
      },
      {
        title: 'Electrify America Pass',
        href: 'https://www.electrifyamerica.com/pass-plus/',
        description: 'Member plan details for drivers who charge often on Electrify America.',
        badge: 'Member pricing',
        kind: 'membership'
      },
      {
        title: 'EVgo memberships',
        href: 'https://www.evgo.com/',
        description: 'Review plan options, Autocharge+, and public fast-charging locations.',
        badge: 'Fast charge',
        kind: 'membership'
      },
      {
        title: 'ChargePoint driver savings',
        href: 'https://www.chargepoint.com/drivers',
        description: 'Find driver tools, roaming access, and network information in one place.',
        badge: 'Driver tools',
        kind: 'membership'
      }
    ]
  },
  {
    id: 'planning-tools',
    title: 'Planning tools',
    description: 'Useful links for comparing prices, mapping stops, and reducing trip friction.',
    emptyStateTitle: 'No planning tools listed',
    emptyStateDescription: 'Keep route-planning and station-comparison links here when they directly help drivers spend less time or money.',
    footnote: 'General travel links stay out unless they directly support EV trip savings.',
    items: [
      {
        title: 'PlugShare trip planner',
        href: 'https://www.plugshare.com/',
        description: 'Check station reviews, route gaps, and charger reliability before departure.',
        badge: 'Trip planning',
        kind: 'resource'
      },
      {
        title: 'Alternative Fuels Data Center',
        href: 'https://afdc.energy.gov/fuels/electricity-locations',
        description: 'Browse public station data, filters, and corridor coverage from DOE.',
        badge: 'Official data',
        kind: 'resource'
      },
      {
        title: 'AAA roadside overview',
        href: 'https://www.aaa.com/',
        description: 'Evaluate roadside plans if you want towing and travel coverage in one bundle.',
        badge: 'Roadside',
        kind: 'partner'
      }
    ]
  },
  {
    id: 'incentives',
    title: 'Savings research',
    description: 'Track government or utility incentives that can stack with charging savings.',
    emptyStateTitle: 'No savings research links listed',
    emptyStateDescription: 'Government and utility incentive links belong here when they are broad enough to help most drivers.',
    footnote: 'Official or quasi-official sources are preferred for incentive research.',
    items: [
      {
        title: 'Federal EV tax credit guide',
        href: 'https://fueleconomy.gov/feg/taxevb.shtml',
        description: 'Federal EV tax credit and incentive reference from FuelEconomy.gov.',
        badge: 'Tax credit',
        kind: 'resource'
      },
      {
        title: 'State incentive lookup',
        href: 'https://afdc.energy.gov/laws/state',
        description: 'Search state and local EV laws, rebates, and infrastructure programs.',
        badge: 'State programs',
        kind: 'resource'
      }
    ]
  }
];

export const hasAppSpecificDiscounts = discountSections.some(
  (section) => section.id === 'app-offers' && section.items.length > 0
);

export const discountSummary = {
  sectionCount: discountSections.length,
  itemCount: discountSections.reduce((count, section) => count + section.items.length, 0),
  appOfferCount: discountSections.find((section) => section.id === 'app-offers')?.items.length ?? 0
};
