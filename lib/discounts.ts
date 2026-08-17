/**
 * Content for /discounts.
 *
 * `kind` drives the pill colour and, for `referral`, the disclosure marker and
 * `rel="sponsored"` on the anchor. Every referral link on this page pays the
 * project if you sign up, so they are all labelled rather than blended in.
 */
export type DiscountLinkKind = 'referral' | 'membership' | 'resource' | 'partner';

export type DiscountLink = {
  title: string;
  href: string;
  /** One line. This is the part people actually read, so keep it concrete. */
  description: string;
  /** Headline value, shown as the pill people scan for. Omit when there is no stated offer. */
  deal?: string;
  /** Code the provider may ask you to type by hand; the link alone is not always enough. */
  code?: string;
  kind: DiscountLinkKind;
};

export type DiscountSection = {
  id: string;
  title: string;
  description: string;
  footnote?: string;
  items: DiscountLink[];
};

export const discountSections: DiscountSection[] = [
  {
    id: 'tesla-ev',
    title: 'Tesla & EV',
    description: 'Referral credit on the car itself, plus logging and accessories built for it.',
    footnote: 'Tesla changes referral rewards often — the credit shown at checkout is the real one.',
    items: [
      {
        title: 'Tesla vehicle referral',
        href: 'https://ts.la/bryan627261',
        description: 'Order a new Tesla through this link to claim whatever referral credit Tesla is running at the time.',
        deal: 'Referral credit',
        kind: 'referral'
      },
      {
        title: 'TeslaFi',
        href: 'https://www.teslafi.com/signup.php?referred=KOV2GO',
        description: 'Tesla logging: drives, charging costs, efficiency, and battery degradation tracked over time.',
        deal: '$10 off',
        kind: 'referral'
      },
      {
        title: 'EVBASE',
        href: 'https://www.evbase.com/?bg_ref=PdfYNb0dyV',
        description: 'Tesla-specific interior trim, storage, screen mounts, and charging accessories.',
        kind: 'referral'
      },
      {
        title: 'T Sportline',
        href: 'https://tsportline.com/?sca_ref=9830647.pqBEvt1iTi8Kekf&utm_source=uppa&utm_medium=0&utm_campaign=0',
        description: 'Aftermarket wheels, suspension, and styling parts for Model 3, Y, S, X, and Cybertruck.',
        kind: 'referral'
      },
      {
        title: 'Drift',
        href: 'https://fbuy.io/drift/ksnd5e9b',
        description: 'Car air fresheners on subscription, in wood and stone housings rather than hanging cardboard.',
        deal: '50% off first order',
        kind: 'referral'
      }
    ]
  },
  {
    id: 'charging-programs',
    title: 'Charging networks',
    description: 'Programs that reduce public charging costs or unlock member pricing.',
    footnote: 'Cost-saving programs, not paid placements — none of these are referral links.',
    items: [
      {
        title: 'Tesla charging',
        href: 'https://www.tesla.com/charging',
        description: 'Compare Supercharging and destination charging options before longer trips.',
        deal: 'Network info',
        kind: 'membership'
      },
      {
        title: 'Electrify America Pass+',
        href: 'https://www.electrifyamerica.com/pass-plus/',
        description: 'Monthly plan that drops the per-minute rate if you fast-charge on the network often.',
        deal: 'Member pricing',
        kind: 'membership'
      },
      {
        title: 'EVgo',
        href: 'https://www.evgo.com/',
        description: 'Plan options, Autocharge+ setup, and public fast-charging locations.',
        deal: 'Member pricing',
        kind: 'membership'
      },
      {
        title: 'ChargePoint',
        href: 'https://www.chargepoint.com/drivers',
        description: 'Driver tools, roaming access to partner networks, and station availability.',
        deal: 'Driver tools',
        kind: 'membership'
      }
    ]
  },
  {
    id: 'planning-tools',
    title: 'Trip planning',
    description: 'Checking stations and staying connected before you leave.',
    items: [
      {
        title: 'PlugShare',
        href: 'https://www.plugshare.com/',
        description: 'Station reviews, route gaps, and charger reliability reports from other drivers.',
        deal: 'Free',
        kind: 'resource'
      },
      {
        title: 'Alternative Fuels Data Center',
        href: 'https://afdc.energy.gov/fuels/electricity-locations',
        description: 'Public station data, filters, and corridor coverage straight from the Department of Energy.',
        deal: 'Official data',
        kind: 'resource'
      },
      {
        title: 'Starlink',
        href: 'https://starlink.com/residential?referral=RC-4509047-46429-69',
        description: 'Satellite internet for RVs, cabins, and off-grid stops — first month free on a new residential plan.',
        deal: '1 month free',
        kind: 'referral'
      },
      {
        title: 'AAA roadside',
        href: 'https://www.aaa.com/',
        description: 'Worth comparing if you want towing and travel coverage bundled together.',
        deal: 'Roadside',
        kind: 'partner'
      }
    ]
  },
  {
    id: 'incentives',
    title: 'Incentives & rebates',
    description: 'Government and utility money that stacks on top of charging savings.',
    footnote: 'Official sources only — incentive rules change, so check the effective date.',
    items: [
      {
        title: 'Federal EV tax credit',
        href: 'https://fueleconomy.gov/feg/taxevb.shtml',
        description: 'Which vehicles qualify, for how much, and under what income and assembly rules.',
        deal: 'Tax credit',
        kind: 'resource'
      },
      {
        title: 'State incentive lookup',
        href: 'https://afdc.energy.gov/laws/state',
        description: 'Search state and local EV laws, rebates, and charger installation programs.',
        deal: 'State programs',
        kind: 'resource'
      }
    ]
  },
  {
    id: 'cashback',
    title: 'Cash back & rewards',
    description: 'Apps that pay a little back on fuel, groceries, and everyday orders.',
    footnote: 'These pay in points or rebates, not instant discounts — the payout takes a cycle or two.',
    items: [
      {
        title: 'Upside',
        href: 'https://upside.app.link/GBNRJ',
        description: 'Cash back on gas, groceries, and restaurants — worth having for road trips and rentals.',
        deal: 'Cash back on fuel',
        kind: 'referral'
      },
      {
        title: 'Rakuten',
        href: 'https://www.rakuten.com/r/B2BRB9?eeid=28187',
        description: 'Cash back on online orders through partner retailers, paid out on a quarterly cycle.',
        deal: 'Signup bonus',
        kind: 'referral'
      },
      {
        title: 'Ibotta',
        href: 'https://ibotta.onelink.me/iUfE/1005cd3f?friend_code=chlaojv',
        description: 'Grocery and retail rebates from scanned receipts and linked store loyalty cards.',
        deal: 'Referral bonus',
        code: 'chlaojv',
        kind: 'referral'
      },
      {
        title: 'Fetch',
        href: 'https://referral.fetch.com/vvv3/referralsocial?code=4TC22',
        description: 'Points for scanned receipts, redeemable as gift cards. The code goes in at signup.',
        deal: 'Bonus points',
        code: '4TC22',
        kind: 'referral'
      },
      {
        title: 'SurveySavvy',
        href: 'https://www.surveysavvy.com/?m=7690803',
        description: 'Paid research panel. The monthly payout comes from SavvyConnect, which meters your browsing.',
        deal: '$3 per month',
        kind: 'referral'
      }
    ]
  },
  {
    id: 'everyday',
    title: 'Everyday deals',
    description: 'Off-topic for an EV app, but they are live offers and they are here rather than hidden.',
    items: [
      {
        title: 'Visible Wireless',
        href: 'https://www.visible.com/get/?3SL9ZDM',
        description: 'Prepaid phone plans on the Verizon network; the code takes money off your first month.',
        deal: 'Referral discount',
        code: '3SL9ZDM',
        kind: 'referral'
      },
      {
        title: 'Comfrt',
        href: 'https://comfrt.com/KLAIRE11',
        description: 'Hoodies and loungewear. The discount applies automatically through this link.',
        deal: '15% off',
        kind: 'referral'
      },
      {
        title: 'Firmoo',
        href: 'https://www.firmoo.com/?invite_code=eb59917f65',
        description: 'Budget prescription glasses and sunglasses, discounted through the invite link.',
        deal: 'Invite discount',
        kind: 'referral'
      },
      {
        title: 'Venice AI',
        href: 'https://venice.ai/chat?ref=_5Ak-c',
        description: 'Private AI chat and image generation that runs without an account by default.',
        deal: '$10 credit',
        kind: 'referral'
      }
    ]
  }
];

export const discountSummary = {
  sectionCount: discountSections.length,
  itemCount: discountSections.reduce((count, section) => count + section.items.length, 0),
  referralCount: discountSections.reduce(
    (count, section) => count + section.items.filter((item) => item.kind === 'referral').length,
    0
  )
};
