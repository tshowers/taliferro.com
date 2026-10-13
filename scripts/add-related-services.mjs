import fs from 'fs'
import path from 'path'

const root = path.resolve('root/public')
const base = 'https://taliferro.com'

// Every consulting/product page that can appear as a "related" link.
// Only pages listed in TARGETS (below) get a block injected; the rest
// exist here purely as link targets for those pages.
const nodes = {
  'agile-coaching': {
    url: `${base}/agile-coaching/`,
    title: 'Agile Coaching & Scrum Consulting',
    blurb: 'Fix slow delivery and team coordination without a reorg.',
    kind: 'Consulting service'
  },
  'api-design-services': {
    url: `${base}/api-design-services/`,
    title: 'API Consulting & Design',
    blurb: "Design, harden, and integrate APIs that don't break in production.",
    kind: 'Consulting service'
  },
  'cloud-architecture-consulting': {
    url: `${base}/cloud-architecture-consulting/`,
    title: 'Cloud Architecture Consulting',
    blurb: "Find what's costing too much or breaking under load.",
    kind: 'Consulting service'
  },
  'ecommerce-development': {
    url: `${base}/ecommerce-development/`,
    title: 'E-Commerce Development',
    blurb: 'Custom Shopify and WooCommerce builds that convert and scale.',
    kind: 'Consulting service'
  },
  'fractional-cto': {
    url: `${base}/fractional-cto/`,
    title: 'Fractional CTO',
    blurb: 'Technology leadership without the full-time hire.',
    kind: 'Consulting service'
  },
  'it-consultant-seattle': {
    url: `${base}/it-consultant-seattle/`,
    title: 'IT Consultant Seattle',
    blurb: 'Cut cloud costs and untangle messy technology, flat fee.',
    kind: 'Consulting service'
  },
  'machine-learning-services': {
    url: `${base}/machine-learning-services/`,
    title: 'Machine Learning & AI Consulting',
    blurb: 'Turn data into predictions and automated decisions.',
    kind: 'Consulting service'
  },
  'small-business-it-consultant': {
    url: `${base}/small-business-it-consultant/`,
    title: 'Small Business IT Consultant',
    blurb: 'Senior IT help without enterprise pricing.',
    kind: 'Consulting service'
  },
  'website-development': {
    url: `${base}/website-development/`,
    title: 'Website Development',
    blurb:
      'Custom sites and software from a team that sticks around after launch.',
    kind: 'Consulting service'
  },
  'rescue-me': {
    url: `${base}/rescue-me/`,
    title: 'IT Rescue — $999 Flat',
    blurb: 'Diagnose the problem in 3 business days. No retainer.',
    kind: 'Consulting service'
  },
  todd: {
    url: `${base}/todd/`,
    title: 'TODD — Momentum System',
    blurb: 'The CRM replacement that keeps work tied to outcomes.',
    kind: 'Product'
  },
  'business-momentum-system': {
    url: `${base}/business-momentum-system/`,
    title: 'Momentum System',
    blurb: 'AI-powered execution — follow-ups, tasks, momentum. From $99/mo.',
    kind: 'Product'
  },
  'lead-vault': {
    url: `${base}/lead-vault/`,
    title: 'Lead Vault',
    blurb: 'Find buyers already looking for what you sell.',
    kind: 'Product'
  },

  // TODD ecosystem pages (free tools + TODD suite modules) — also used as
  // link targets by sibling pages in the same bucket.
  'ask-todd': {
    url: `${base}/ask-todd/`,
    title: 'Ask TODD',
    blurb: 'Talk to your business context instead of digging for it.',
    kind: 'TODD module'
  },
  'customer-acquisition-pipeline': {
    url: `${base}/customer-acquisition-pipeline/`,
    title: 'Customer Acquisition Pipeline',
    blurb: 'A $99 document that replaces guesswork with a repeatable pipeline.',
    kind: 'Paid resource'
  },
  docs: {
    url: `${base}/docs/`,
    title: 'Docs',
    blurb:
      'Keeps the right file tied to the work instead of buried in folders.',
    kind: 'TODD module'
  },
  'email-signature-builder': {
    url: `${base}/email-signature-builder/`,
    title: 'Email Signature Builder',
    blurb: 'Clean, consistent signatures across the whole team. Free.',
    kind: 'Free tool'
  },
  find: {
    url: `${base}/find/`,
    title: 'Find',
    blurb: 'One confident answer first, nine more if you need them.',
    kind: 'Free tool'
  },
  'laboratory-information-system': {
    url: `${base}/laboratory-information-system/`,
    title: 'Laboratory Information System',
    blurb:
      'Barcoded sample tracking and audit trails EHR/EMR systems can read.',
    kind: 'Product'
  },
  maya: {
    url: `${base}/maya/`,
    title: 'Maya',
    blurb:
      'A free marketing director that reviews your offer and tells you what to fix first.',
    kind: 'Free tool'
  },
  moves: {
    url: `${base}/moves/`,
    title: 'Moves',
    blurb:
      'Keeps the next action from disappearing after meetings and decisions.',
    kind: 'TODD module'
  },
  music: {
    url: `${base}/music/`,
    title: 'Taliferro Music Radio',
    blurb: "A live 24/7 stream from Taliferro's own artist roster.",
    kind: 'Product'
  },
  network: {
    url: `${base}/network/`,
    title: 'Network',
    blurb: 'Makes the right relationship visible before it goes cold.',
    kind: 'TODD module'
  },
  outreach: {
    url: `${base}/outreach/`,
    title: 'Outreach',
    blurb: 'Keeps the next message from going cold.',
    kind: 'TODD module'
  },
  pulse: {
    url: `${base}/pulse/`,
    title: 'Pulse',
    blurb: 'Turns one clear question into usable signal.',
    kind: 'TODD module'
  },
  sayit: {
    url: `${base}/sayit/`,
    title: 'Sayit',
    blurb: 'Turns what you mean into clean, usable wording.',
    kind: 'Free tool'
  },
  'social-media-management': {
    url: `${base}/social-media-management/`,
    title: 'Social Media Management',
    blurb: "Turns one offer into drafts shaped for each platform's own rhythm.",
    kind: 'TODD module'
  },

  // Lead Vault "base" vertical pages — referenced across geo-variant siblings.
  'lv-cloud-services': {
    url: `${base}/lead-vault/buyers/cloud-services.html`,
    title: 'Cloud Services Buyer Signals',
    blurb: 'What it looks like when a company is ready to buy cloud services.',
    kind: 'Buyer signals'
  },
  'lv-cybersecurity': {
    url: `${base}/lead-vault/buyers/cybersecurity.html`,
    title: 'Cybersecurity Buyer Signals',
    blurb: 'What it looks like when a company is ready to buy cybersecurity.',
    kind: 'Buyer signals'
  },
  'lv-technology-services': {
    url: `${base}/lead-vault/buyers/technology-services.html`,
    title: 'Technology Services Buyer Signals',
    blurb:
      'What it looks like when a company is ready to buy technology services.',
    kind: 'Buyer signals'
  },
  products: {
    url: `${base}/products/`,
    title: 'Products',
    blurb: 'Everything Taliferro has built, in one place.',
    kind: 'Hub'
  }
}

// Only pages with no existing related-content section get a block.
// heading is page-specific so the section reads as curated, not templated.
const targets = {
  'api-design-services': {
    heading: 'Adjacent problems worth solving together',
    related: [
      'cloud-architecture-consulting',
      'machine-learning-services',
      'fractional-cto'
    ]
  },
  'ecommerce-development': {
    heading: 'Related ways we help',
    related: [
      'website-development',
      'small-business-it-consultant',
      'rescue-me'
    ]
  },
  'machine-learning-services': {
    heading: 'Where ML work usually leads',
    related: [
      'api-design-services',
      'cloud-architecture-consulting',
      'fractional-cto'
    ]
  },
  'website-development': {
    heading: 'Other ways we help',
    related: [
      'ecommerce-development',
      'rescue-me',
      'small-business-it-consultant'
    ]
  },
  'business-momentum-system': {
    heading: 'Beyond the CRM replacement',
    related: ['agile-coaching', 'fractional-cto', 'it-consultant-seattle']
  },
  todd: {
    heading: 'Get more out of TODD',
    related: ['agile-coaching', 'fractional-cto', 'lead-vault']
  },
  'lead-vault': {
    heading: 'After the leads come in',
    related: ['business-momentum-system', 'todd', 'it-consultant-seattle']
  },
  'rescue-me': {
    heading: "If the $999 rescue isn't the full fix",
    related: [
      'it-consultant-seattle',
      'small-business-it-consultant',
      'fractional-cto'
    ]
  },

  // --- TODD ecosystem pages (14) ---
  'ask-todd': {
    heading: 'More from TODD',
    related: ['docs', 'moves', 'todd']
  },
  docs: {
    heading: 'More from TODD',
    related: ['ask-todd', 'moves', 'todd']
  },
  moves: {
    heading: 'More from TODD',
    related: ['outreach', 'network', 'todd']
  },
  network: {
    heading: 'More from TODD',
    related: ['outreach', 'pulse', 'todd']
  },
  outreach: {
    heading: 'More from TODD',
    related: ['network', 'social-media-management', 'todd']
  },
  pulse: {
    heading: 'More from TODD',
    related: ['network', 'sayit', 'todd']
  },
  maya: {
    heading: 'More free tools from Taliferro',
    related: ['sayit', 'social-media-management', 'todd']
  },
  sayit: {
    heading: 'More free tools from Taliferro',
    related: ['maya', 'social-media-management', 'docs']
  },
  'social-media-management': {
    heading: 'More from TODD',
    related: ['outreach', 'sayit', 'maya']
  },
  'email-signature-builder': {
    heading: 'More free tools from Taliferro',
    related: ['find', 'sayit', 'todd']
  },
  find: {
    heading: 'More free tools from Taliferro',
    related: ['lead-vault', 'email-signature-builder', 'todd']
  },
  'customer-acquisition-pipeline': {
    heading: 'Turn the pipeline into pipeline',
    related: ['lead-vault', 'find', 'todd']
  },
  'laboratory-information-system': {
    heading: 'Related engineering work',
    related: [
      'machine-learning-services',
      'api-design-services',
      'cloud-architecture-consulting'
    ]
  },
  music: {
    heading: 'More from Taliferro',
    related: ['products', 'todd', 'maya']
  },

  // --- Lead Vault buyer/sector pages (11) ---
  'lv-cloud-services': {
    file: 'lead-vault/buyers/cloud-services.html',
    heading: 'Other buyer signals worth tracking',
    related: ['lead-vault', 'todd', 'lv-cybersecurity']
  },
  'lv-cloud-services-seattle': {
    file: 'lead-vault/buyers/cloud-services-seattle.html',
    heading: 'Other buyer signals worth tracking',
    related: ['lead-vault', 'todd', 'lv-cybersecurity']
  },
  'lv-cloud-services-washington': {
    file: 'lead-vault/buyers/cloud-services-washington.html',
    heading: 'Other buyer signals worth tracking',
    related: ['lead-vault', 'todd', 'lv-cybersecurity']
  },
  'lv-cybersecurity': {
    file: 'lead-vault/buyers/cybersecurity.html',
    heading: 'Other buyer signals worth tracking',
    related: ['lead-vault', 'todd', 'lv-technology-services']
  },
  'lv-cybersecurity-seattle': {
    file: 'lead-vault/buyers/cybersecurity-seattle.html',
    heading: 'Other buyer signals worth tracking',
    related: ['lead-vault', 'todd', 'lv-technology-services']
  },
  'lv-cybersecurity-washington': {
    file: 'lead-vault/buyers/cybersecurity-washington.html',
    heading: 'Other buyer signals worth tracking',
    related: ['lead-vault', 'todd', 'lv-technology-services']
  },
  'lv-technology-services': {
    file: 'lead-vault/buyers/technology-services.html',
    heading: 'Other buyer signals worth tracking',
    related: ['lead-vault', 'todd', 'lv-cloud-services']
  },
  'lv-technology-services-seattle': {
    file: 'lead-vault/buyers/technology-services-seattle.html',
    heading: 'Other buyer signals worth tracking',
    related: ['lead-vault', 'todd', 'lv-cloud-services']
  },
  'lv-technology-services-washington': {
    file: 'lead-vault/buyers/technology-services-washington.html',
    heading: 'Other buyer signals worth tracking',
    related: ['lead-vault', 'todd', 'lv-cloud-services']
  },
  'lv-real-estate-investors': {
    file: 'lead-vault/buyers/real-estate-investors.html',
    heading: 'Other buyer signals worth tracking',
    related: ['lead-vault', 'todd', 'lv-cybersecurity']
  },
  'lv-healthcare': {
    file: 'lead-vault/sectors/healthcare.html',
    heading: 'Other buyer signals worth tracking',
    related: ['lead-vault', 'todd', 'laboratory-information-system']
  },

  // --- Rescue-me scenario pages (8) ---
  'rm-ai-in-engineering': {
    file: 'rescue-me/ai-in-engineering/index.html',
    heading: "If this isn't the whole problem",
    related: ['rescue-me', 'machine-learning-services', 'agile-coaching']
  },
  'rm-ai-without-risk': {
    file: 'rescue-me/ai-without-risk/index.html',
    heading: "If this isn't the whole problem",
    related: ['rescue-me', 'machine-learning-services', 'fractional-cto']
  },
  'rm-cloud-cost-control': {
    file: 'rescue-me/cloud-cost-control/index.html',
    heading: "If this isn't the whole problem",
    related: [
      'rescue-me',
      'cloud-architecture-consulting',
      'it-consultant-seattle'
    ]
  },
  'rm-data-quality': {
    file: 'rescue-me/data-quality/index.html',
    heading: "If this isn't the whole problem",
    related: ['rescue-me', 'machine-learning-services', 'api-design-services']
  },
  'rm-it-spend-slow': {
    file: 'rescue-me/it-spend-slow/index.html',
    heading: "If this isn't the whole problem",
    related: ['rescue-me', 'it-consultant-seattle', 'fractional-cto']
  },
  'rm-rebuild-vs-patch': {
    file: 'rescue-me/rebuild-vs-patch/index.html',
    heading: "If this isn't the whole problem",
    related: ['rescue-me', 'website-development', 'fractional-cto']
  },
  'rm-right-size-team': {
    file: 'rescue-me/right-size-team/index.html',
    heading: "If this isn't the whole problem",
    related: ['rescue-me', 'fractional-cto', 'agile-coaching']
  },
  'rm-ship-faster': {
    file: 'rescue-me/ship-faster/index.html',
    heading: "If this isn't the whole problem",
    related: ['rescue-me', 'agile-coaching', 'website-development']
  },

  // --- Legacy sub-content pages (7) ---
  'ml-you': {
    file: 'machine-learning-services/machine-learning-and-you.html',
    heading: 'Take it further',
    related: [
      'machine-learning-services',
      'api-design-services',
      'cloud-architecture-consulting'
    ]
  },
  'ml-stories': {
    file: 'machine-learning-services/machine-learning-stories.html',
    heading: 'Take it further',
    related: [
      'machine-learning-services',
      'api-design-services',
      'cloud-architecture-consulting'
    ]
  },
  'ml-why-matters': {
    file: 'machine-learning-services/why-machine-learning-matters-to-your-business.html',
    heading: 'Take it further',
    related: [
      'machine-learning-services',
      'api-design-services',
      'cloud-architecture-consulting'
    ]
  },
  'ecom-solutions': {
    file: 'ecommerce-development/e-commerce-solutions-for-business-growth.html',
    heading: 'Take it further',
    related: [
      'ecommerce-development',
      'website-development',
      'small-business-it-consultant'
    ]
  },
  'ecom-advice': {
    file: 'ecommerce-development/next-level-e-commerce-advice.html',
    heading: 'Take it further',
    related: [
      'ecommerce-development',
      'website-development',
      'small-business-it-consultant'
    ]
  },
  'ecom-optimization': {
    file: 'ecommerce-development/website-optimization.html',
    heading: 'Take it further',
    related: [
      'ecommerce-development',
      'website-development',
      'small-business-it-consultant'
    ]
  },
  'api-design-excellence': {
    file: 'api-design-services/api-design-excellence.html',
    heading: 'Take it further',
    related: [
      'api-design-services',
      'cloud-architecture-consulting',
      'machine-learning-services'
    ]
  }
}

function buildBlock (slug, config) {
  const cards = config.related
    .map(key => {
      const node = nodes[key]
      if (!node) {
        throw new Error(
          `Unknown related-service key "${key}" referenced by "${slug}"`
        )
      }
      return `                <a class="card" href="${node.url}">
                    <h3>${node.title}</h3>
                    <p>${node.blurb}</p>
                    <div class="fine">${node.kind}</div>
                </a>`
    })
    .join('\n')

  return `    <!-- RELATED SERVICES -->
    <section class="section" data-related-services="true">
        <div class="page-shell">
            <div class="kicker">Related services</div>
            <h2>${config.heading}</h2>
            <div class="grid grid-3">
${cards}
            </div>
        </div>
    </section>
`
}

function processFile (slug) {
  const relFile = targets[slug].file || `${slug}/index.html`
  const filePath = path.join(root, relFile)
  if (!fs.existsSync(filePath)) {
    console.warn(`skip: ${slug} (${relFile} not found)`)
    return null
  }

  const original = fs.readFileSync(filePath, 'utf8')
  const block = buildBlock(slug, targets[slug])

  let updated
  if (original.includes('data-related-services="true"')) {
    updated = original.replace(
      /\s*<!-- RELATED SERVICES -->\s*<section class="section" data-related-services="true">[\s\S]*?<\/section>\s*/,
      `\n${block}`
    )
  } else if (original.includes('<footer class="footer no-print">')) {
    updated = original.replace(
      '<footer class="footer no-print">',
      `${block}    <footer class="footer no-print">`
    )
  } else {
    console.warn(
      `skip: ${slug} (no <footer class="footer no-print"> anchor found)`
    )
    return null
  }

  if (updated === original) {
    return null
  }

  fs.writeFileSync(filePath, updated)
  return slug
}

const updated = Object.keys(targets).map(processFile).filter(Boolean)
console.log(JSON.stringify({ updated }, null, 2))
