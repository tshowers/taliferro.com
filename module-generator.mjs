/**
 * module-generator.mjs
 *
 * Generates: ./public/js/modules.js
 *
 * What it does
 * - Scans selected directories under ./public for HTML pages
 * - Extracts a "preview image" (og:image -> first <img> -> common image files)
 * - Scans ./public/assets/files for PDFs (falls back to ./public/assests/files if needed)
 * - Merges in manually maintained arrays:
 *     - VIDEOS (YouTube videos, explainers, demos)
 *     - TESTIMONIALS (videos or quotes)
 * - Produces schema-compliant modules that your concierge can load.
 *
 * Run:
 *   node module-generator.mjs
 */

import fs from 'fs'
import path from 'path'

// ---------------------------------
// CONFIG YOU EDIT
// ---------------------------------
const SITE_ORIGIN = 'https://taliferro.com'
const SITE_ROOT = path.resolve('./root/public')
const OUTPUT_FILE = path.join(SITE_ROOT, 'js', 'modules.js')

// PDFs live under /public/assets/files in this repo. Some older pages may reference "assests".
const PDF_DIR_PRIMARY = path.join(SITE_ROOT, 'assets', 'files')
const PDF_DIR_FALLBACK = path.join(SITE_ROOT, 'assests', 'files')
const PDF_DIR = exists(PDF_DIR_PRIMARY) ? PDF_DIR_PRIMARY : PDF_DIR_FALLBACK

// Which site folders to scan for HTML pages.
// Keep it tight at first. Add more as you’re ready.
const HTML_SCAN_DIRS = [
  path.join(SITE_ROOT, 'agile-coaching'),
  path.join(SITE_ROOT, 'api-design-services'),
  path.join(SITE_ROOT, 'blog'),
  path.join(SITE_ROOT, 'cloud-architecture-consulting'),
  path.join(SITE_ROOT, 'ecommerce-development'),
  path.join(SITE_ROOT, 'machine-learning-services'),
  path.join(SITE_ROOT, 'website-development')
]

// Manual arrays you update as you add new media.
// Keep module_id lowercase + underscores.
const VIDEOS = [
  {
    module_id: 'video_todd_hit_my_number',
    type: 'video',
    best_for: ['outreach'],
    url: 'https://youtube.com/shorts/VY3kOg1zmfw',
    description: 'How can TODD help me hit my number?'
  },
  {
    module_id: 'video_todd_more_free_time_feel',
    type: 'video',
    best_for: ['ai'],
    url: 'https://youtube.com/shorts/nFcWSW4N5c8',
    description: 'How does getting used to more free time feel?'
  },
  {
    module_id: 'video_todd_support_teams_not_replace_them',
    type: 'video',
    best_for: ['ai'],
    url: 'https://youtube.com/shorts/tzY2B06eK4I',
    description: 'Why AI should support teams, not replace them.'
  },
  {
    module_id: 'video_todd_follow_through_makes_work_stand_out',
    type: 'video',
    best_for: ['moves'],
    url: 'https://youtube.com/shorts/Zeabs9OZhgs',
    description: 'What makes work stand out is follow-through.'
  },
  {
    module_id: 'video_todd_i_dont_chase_follow_ups_anymore',
    type: 'video',
    best_for: ['outreach'],
    url: 'https://youtube.com/shorts/T8-gDGuqZD0',
    description: 'I do not chase follow-ups anymore.'
  },
  {
    module_id: 'video_todd_keep_moving_work_forward',
    type: 'video',
    best_for: ['moves'],
    url: 'https://youtube.com/shorts/Tq5MGgvaWkY',
    description: 'When you need to keep moving work forward.'
  },
  {
    module_id: 'video_todd_stand_out_and_save_time',
    type: 'video',
    best_for: ['ai'],
    url: 'https://youtube.com/shorts/wHBXVWNjK9o',
    description: 'Stand out and save time with work that keeps moving.'
  },
  {
    module_id: 'video_todd_automation_without_asking',
    type: 'video',
    best_for: ['ai'],
    url: 'https://youtube.com/shorts/9p3ni8QtBHI',
    description: 'When automation happens without asking.'
  },
  {
    module_id: 'video_todd_momentum_makes_you_stand_out',
    type: 'video',
    best_for: ['outreach'],
    url: 'https://youtube.com/shorts/Asmdn0ewkTs',
    description: 'Did you know momentum makes you stand out?'
  },
  {
    module_id: 'video_todd_work_is_moving_without_you',
    type: 'video',
    best_for: ['ai'],
    url: 'https://youtube.com/shorts/tNVQEjgWxoo',
    description: 'When work is moving without you.'
  },
  {
    module_id: 'video_todd_what_happens_next_makes_you_stand_out',
    type: 'video',
    best_for: ['outreach'],
    url: 'https://youtube.com/shorts/otEk1UwjVf0',
    description: 'What happens next is what makes you stand out.'
  },
  {
    module_id: 'video_todd_stand_out_by_following_through',
    type: 'video',
    best_for: ['moves'],
    url: 'https://youtube.com/shorts/7zYqQW_OreA',
    description:
      'Did you know you can stand out more just by following through?'
  },
  {
    module_id: 'video_todd_why_follow_through_makes_work_stand_out',
    type: 'video',
    best_for: ['moves'],
    url: 'https://youtube.com/shorts/dB2C3Qja0zY',
    description: 'Why follow-through is what makes work stand out.'
  },
  {
    module_id: 'video_todd_responsible_use_of_technology',
    type: 'video',
    best_for: ['ai'],
    url: 'https://youtube.com/shorts/RnILY0yGP0Y',
    description: 'Responsible use of technology and its impact on momentum.'
  },
  {
    module_id: 'video_todd_work_moves_forward',
    type: 'video',
    best_for: ['outreach'],
    url: 'https://youtube.com/shorts/CwJK94-h7Lk',
    description: 'When you’re ready for work to actually move forward.'
  },
  {
    module_id: 'video_todd_survey_analysis_help',
    type: 'video',
    best_for: ['pulse'],
    url: 'https://youtube.com/shorts/EtRE1t3lAgU',
    description:
      'Why analyzing survey results requires more than surface-level thinking.'
  },
  {
    module_id: 'video_todd_ai_handles_the_work',
    type: 'video',
    best_for: ['ai'],
    url: 'https://youtube.com/shorts/hkkawhkp3ng',
    description: 'What it feels like when AI actually carries the work forward.'
  },
  {
    module_id: 'video_todd_reduce_mental_weight',
    type: 'video',
    best_for: ['moves'],
    url: 'https://youtube.com/shorts/YZEF7I3D6XY',
    description: 'Reduce mental weight by moving work forward.'
  },
  {
    module_id: 'video_todd_automatic_lead_generation',
    type: 'video',
    best_for: ['lead_vault'],
    url: 'https://youtube.com/shorts/YZEF7I3D6XY',
    description: 'TODD’s approach to automatic lead generation.'
  },
  {
    module_id: 'video_todd_travel_industry_meetings_problem',
    type: 'video',
    best_for: ['moves'],
    url: 'https://youtube.com/shorts/7Q4EOwIy2_s',
    description: 'Why disruption often turns into endless meetings.'
  },
  {
    module_id: 'video_todd_healthcare_compliance_bottleneck',
    type: 'video',
    best_for: ['docs'],
    url: 'https://youtube.com/shorts/t_U8pxAuBe0',
    description: 'Why compliance becomes a bottleneck in healthcare.'
  },
  {
    module_id: 'video_todd_lead_generation_story',
    type: 'video',
    best_for: ['lead_vault'],
    url: 'https://youtube.com/shorts/kD54U9iY02U',
    description: 'A real story behind automatic lead generation.'
  },
  {
    module_id: 'video_todd_lead_generation_with_todd',
    type: 'video',
    best_for: ['lead_vault'],
    url: 'https://youtube.com/shorts/E8EcSF3IYh4',
    description: 'Automatic lead generation powered by TODD.'
  },
  {
    module_id: 'video_todd_construction_project_delays',
    type: 'video',
    best_for: ['moves'],
    url: 'https://youtube.com/shorts/Dtv9KB9uaVQ',
    description: 'What slows down construction projects and how to fix it.'
  },
  {
    module_id: 'video_todd_free_time_problem',
    type: 'video',
    best_for: ['ai'],
    url: 'https://youtube.com/shorts/QCeJozTTeLs',
    description: 'Why you don’t actually have a free time problem.'
  },
  {
    module_id: 'video_todd_momentum_and_remarkable',
    type: 'video',
    best_for: ['outreach'],
    url: 'https://youtube.com/shorts/QCeJozTTeLs',
    description: 'Why increasing momentum helps you stand out.'
  },
  {
    module_id: 'video_lead_vault_leads_ready_to_purchase',
    type: 'video',
    best_for: ['lead_vault'],
    url: 'https://youtube.com/shorts/y4jJ4LRzfag',
    description: 'Leads ready to purchase.'
  },
  {
    module_id: 'video_lead_vault_enriched_leads_waiting_to_buy',
    type: 'video',
    best_for: ['lead_vault'],
    url: 'https://youtube.com/shorts/_Emf6ULNKUI',
    description: 'Enriched leads waiting to buy your product or service.'
  },
  {
    module_id: 'video_todd_demystifying_artificial_intelligence',
    type: 'explainer',
    best_for: ['ai'],
    url: 'https://youtube.com/shorts/0HiA7Zd_Ob0',
    description: 'Demystifying artificial intelligence.'
  },
  {
    module_id: 'video_todd_best_way_to_growth_my_business_follow_up',
    type: 'video',
    best_for: ['outreach'],
    url: 'https://youtube.com/shorts/N4paRM-JyWg',
    description: "What's the best way to grow my business? Follow-up matters."
  },
  {
    module_id: 'video_todd_best_way_to_grow_my_business',
    type: 'video',
    best_for: ['outreach'],
    url: 'https://youtube.com/shorts/cD3N4jvjUho',
    description: "What's the best way to grow my business?"
  },
  {
    module_id: 'video_todd_cant_keep_track_of_everything',
    type: 'video',
    best_for: ['moves'],
    url: 'https://youtube.com/shorts/NrKUpApf5G8',
    description: "I can't keep track of everything I need to do."
  },
  {
    module_id: 'video_todd_difference_between_todd_and_copilot_tools',
    type: 'explainer',
    best_for: ['ai'],
    url: 'https://youtube.com/shorts/ww3Mtp5jBwo',
    description: 'The difference between TODD and copilot tools.'
  },
  {
    module_id: 'video_todd_explainer_how_ai_actually_works',
    type: 'explainer',
    best_for: ['ai'],
    url: 'https://youtube.com/shorts/XBSLtItGng8',
    description: 'Explainer: how AI actually works.'
  },
  {
    module_id: 'video_todd_a_better_you_awaits_long',
    type: 'video',
    best_for: ['all'],
    url: 'https://youtube.com/shorts/XBSLtItGng8',
    description: 'A better you awaits.'
  },
  {
    module_id: 'video_todd_a_better_you_awaits_short',
    type: 'video',
    best_for: ['all'],
    url: 'https://youtube.com/shorts/iIM_IqdYPDw',
    description: 'A better you awaits.'
  },
  {
    module_id: 'video_lead_vault_find_buyers_already_looking',
    type: 'video',
    best_for: ['lead_vault'],
    url: 'https://youtube.com/shorts/-mvnXUhJDbg',
    description: 'Find buyers already looking.'
  },
  {
    module_id: 'video_todd_cognitive_cost_of_ai',
    type: 'video',
    best_for: ['ai'],
    url: 'https://youtube.com/shorts/sXTZilnFAtg',
    description: 'The cognitive cost of AI.'
  },
  {
    module_id: 'video_lead_vault_find_buyers_already_looking_alt',
    type: 'video',
    best_for: ['lead_vault'],
    url: 'https://youtube.com/shorts/fh-919enKE4',
    description: 'Lead Vault: find buyers already looking.'
  },

  {
    module_id: 'video_lead_vault_find_buyers_already_looking_10s',
    type: 'video',
    best_for: ['lead_vault'],
    url: 'https://youtube.com/shorts/lnPwTquQng4',
    description: 'Lead Vault: find buyers already looking.'
  },
  {
    module_id: 'video_lead_vault_find_buyers_already_looking_orange',
    type: 'video',
    best_for: ['lead_vault'],
    url: 'https://youtube.com/shorts/vvhRaLUq-w4',
    description: 'Lead Vault: find buyers already looking.'
  },
  {
    module_id: 'video_lead_vault_find_buyers_already_looking_green',
    type: 'video',
    best_for: ['lead_vault'],
    url: 'https://youtube.com/shorts/EuBGgFujGMs',
    description: 'Lead Vault: find buyers already looking.'
  },
  {
    module_id: 'video_pulse_ask_a_question_learn_everything',
    type: 'video',
    best_for: ['pulse'],
    url: 'https://youtube.com/shorts/nWSaOCf6yw4',
    description: 'Pulse: ask a question. Learn everything.'
  },
  {
    module_id: 'video_lead_vault_find_buyers_already_looking_blue',
    type: 'video',
    best_for: ['lead_vault'],
    url: 'https://youtube.com/shorts/Gc8s9pdV5pY',
    description: 'Lead Vault: find buyers already looking.'
  },
  {
    module_id: 'video_todd_how_a_business_momentum_system_works',
    type: 'explainer',
    best_for: ['outreach'],
    url: 'https://youtube.com/shorts/du5xRVP6VWc',
    description: 'How a Momentum System works.'
  },
  {
    module_id: 'video_todd_getting_started_part_1',
    type: 'explainer',
    best_for: ['outreach'],
    url: 'https://youtube.com/shorts/Ek7Te_jVKYk',
    description: 'Getting started with TODD, part 1.'
  },
  {
    module_id: 'video_todd_why_companies_abandon_crm',
    type: 'explainer',
    best_for: ['outreach'],
    url: 'https://youtube.com/shorts/qCV2ae_NAko',
    description: 'Why companies abandon CRM.'
  },
  {
    module_id: 'video_todd_hidden_cost_of_crms',
    type: 'explainer',
    best_for: ['outreach'],
    url: 'https://youtube.com/shorts/X1ucEu4Jb8k',
    description: 'The hidden cost of CRMs.'
  },
  {
    module_id: 'video_todd_automatic_lead_generation_and_knowledge_management',
    type: 'video',
    best_for: ['knowledge'],
    url: 'https://youtube.com/shorts/QqSsI6AdBzg',
    description:
      'Have TODD help with automatic lead generation and knowledge management.'
  },
  {
    module_id: 'video_todd_how_much_work_happens_everyday',
    type: 'video',
    best_for: ['outreach'],
    url: 'https://youtube.com/shorts/VjOaoGuzJSg',
    description:
      'How much work happens everyday? Are you using the right tools?'
  },
  {
    module_id: 'video_todd_you_too_can_be_remarkable',
    type: 'video',
    best_for: ['outreach'],
    url: 'https://youtube.com/shorts/WZOZOhG7Wa4',
    description: 'You too can be remarkable just by moving work forward.'
  },
  {
    module_id: 'video_todd_why_do_projects_slow_down',
    type: 'video',
    best_for: ['moves'],
    url: 'https://youtube.com/shorts/dP2lfHGYhJc',
    description: 'Why do projects slow down?'
  },

  {
    module_id: 'video_todd_vs_crm',
    type: 'explainer',
    best_for: ['outreach'],
    url: 'https://youtu.be/RsDSoZvicLQ',
    description: "Still using CRMs? 2000 Technology? It's 2026 Time for a  BMS"
  },
  {
    module_id: 'video_todd_philosophy',
    type: 'explainer',
    best_for: ['outreach'],
    url: 'https://youtu.be/Yeo6kTcUryU',
    description: 'How TODD quietly handles outreach, follow-ups, and momentum.'
  },
  {
    module_id: 'video_todd_moves',
    type: 'video',
    best_for: ['moves'],
    url: 'https://youtu.be/YE_Dy3lqlQU',
    description: 'How TODD makes your remarkable'
  },
  {
    module_id: 'video_todd_ai',
    type: 'video',
    best_for: ['ai'],
    url: 'https://youtu.be/QrpW9jowSKY',
    description: 'How TODD makes your remarkable'
  },
  {
    module_id: 'video_todd_affiliate',
    type: 'video',
    best_for: ['all'],
    url: 'https://youtu.be/mHJsljdd-q8',
    description: 'About the TODD affiliate program  '
  },
  {
    module_id: 'video_todd_partner',
    type: 'video',
    best_for: ['all'],
    url: 'https://youtu.be/vrv_ZQ-uhH4',
    description: 'About the TODD partner program  '
  },
  {
    module_id: 'video_todd_different_than_crm',
    type: 'video',
    best_for: ['outreach'],
    url: 'https://youtube.com/shorts/ag6LK41dqVE',
    description: 'How is TODD different from a CRM?'
  },
  {
    module_id: 'video_todd_working',
    type: 'video',
    best_for: ['ai'],
    url: 'https://youtube.com/shorts/tNVQEjgWxoo',
    description: 'You say TODD does the work — how?'
  },
  {
    module_id: 'video_todd_sales',
    type: 'video',
    best_for: ['outreach'],
    url: 'https://youtube.com/shorts/Tq5MGgvaWkY',
    description: 'Is this only for sales?'
  },
  {
    module_id: 'video_todd_and_teams',
    type: 'video',
    best_for: ['ai'],
    url: 'https://youtube.com/shorts/tzY2B06eK4I',
    description: 'Does TODD replace my team?'
  },
  {
    module_id: 'video_todd_and_bms',
    type: 'video',
    best_for: ['ai'],
    url: 'https://youtube.com/shorts/dB2C3Qja0zY',
    description: 'What is a Momentum System?'
  },
  {
    module_id: 'video_todd_philosophy',
    type: 'video',
    best_for: ['ai'],
    url: 'https://youtube.com/shorts/AYlrdZHhaRI',
    description: 'When Software Tracks Work but Does not Move it'
  },

  {
    module_id: 'video_todd_ai_wrong',
    type: 'video',
    best_for: ['ai'],
    url: 'https://youtube.com/shorts/AKoYV4Mms54',
    description: 'Why Most Companies Use AI the Wrong Way'
  },

  {
    module_id: 'video_todd_tracking_vs_moving',
    type: 'video',
    best_for: ['ai'],
    url: 'https://youtube.com/shorts/Nr_1ybsk6i8',
    description: 'Tracking Work vs Moving Work Forward'
  },

  {
    module_id: 'video_and_website_design_consulting',
    type: 'video',
    best_for: ['web_dev'],
    url: 'https://youtu.be/x7WFnj7A9lo',
    description: 'Website Design That Feels Human'
  },
  {
    module_id: 'video_and_ai_dashboards_consulting',
    type: 'video',
    best_for: ['ai'],
    url: 'https://youtu.be/FKIvMFJpubo',
    description: 'Design and AI Powered Dashboards'
  },
  {
    module_id: 'video_machine_learning_consulting',
    type: 'video',
    best_for: ['ai'],
    url: 'https://youtu.be/PKlCCvy_N-c',
    description: 'Machine Learning Consulting'
  },
  {
    module_id: 'video_api_design_consulting',
    type: 'video',
    best_for: ['apis'],
    url: 'https://youtu.be/OopgSISYvP4',
    description: 'API Design and Strategy'
  },
  {
    module_id: 'video_cloud_architecture_consulting',
    type: 'video',
    best_for: ['cloud'],
    url: 'https://youtu.be/1j9fce8Vmp0',
    description: 'Cloud Architecture'
  },
  {
    module_id: 'video_software_consulting',
    type: 'video',
    best_for: ['all'],
    url: 'https://youtu.be/y2pJl-pStbo',
    description: 'Choosing the right Partner'
  },
  {
    module_id: 'video_cloud_and_api_consulting',
    type: 'video',
    best_for: ['all'],
    url: 'hhttps://youtu.be/1Gbagj_OaNM',
    description: 'Strategy, AI, Cloud, APIs'
  },
  {
    module_id: 'video_passwordless_consulting',
    type: 'explainer',
    best_for: ['security'],
    url: 'https://youtu.be/BooqORRFmJQ',
    description: 'Passwordless Authentication'
  },
  {
    module_id: 'video_about_taliferro',
    type: 'explainer',
    best_for: ['all'],
    url: 'https://youtu.be/D2BlJ2eclwA',
    description: 'About Taliferro'
  },
  {
    module_id: 'video_about_todd_affiliate_program',
    type: 'explainer',
    best_for: ['all'],
    url: 'https://youtu.be/ZPYJ7u5zvFQ',
    description: 'TODD Affiliate Program: Earn up to $5,000 per referral'
  },
  {
    module_id: 'video_about_todd_reseller_program',
    type: 'explainer',
    best_for: ['all'],
    url: 'https://youtu.be/xQgu_E7chig',
    description: 'TODD reseller program: add recurring revenue'
  }
]

const TESTIMONIALS = [
  {
    module_id: 'testimonial_todd_discovery',
    type: 'testimonial',
    best_for: ['outreach'],
    url: 'https://youtube.com/shorts/T8-gDGuqZD0',
    description: 'The power of the follow-up.'
  },
  {
    module_id: 'testimonial_todd_ai',
    type: 'testimonial',
    best_for: ['ai'],
    url: 'https://youtube.com/shorts/9p3ni8QtBHI',
    description:
      'Explains why people begin to trust AI systems when work continues without constant input or supervision.'
  },
  {
    module_id: 'testimonial_todd_auto',
    type: 'testimonial',
    best_for: ['ai'],
    url: 'https://youtube.com/shorts/zVSfy92UqVk',
    description: "TODD's powerful automation"
  },
  {
    module_id: 'testimonial_todd_caring',
    type: 'testimonial',
    best_for: ['ai'],
    url: 'https://youtu.be/1D4g81GTfqQ',
    description: "With TODD, I feel like I'm being quietly looked after."
  }
]

// If you want certain pages ALWAYS to be included (even if scan misses), list them here.
// Example: { file: "./public/home.html", type: "page-preview", best_for: ["all"] }
const PINNED_PAGES = [
  {
    file: './root/public/business-momentum-system/index.html',
    module_id: 'page_bms',
    type: 'page-preview',
    best_for: ['outreach'],
    description: 'Overview of TODD as a Momentum System.'
  },
  {
    file: './root/public/blog/ai-adoption/index.html',
    module_id: 'page_ai_adoption',
    type: 'page-preview',
    best_for: ['ai'],
    description:
      'Practical guide to adopting AI without breaking trust or workflows.'
  }
]

// ---------------------------------
// ENUMS (must match concierge)
// ---------------------------------
const TYPE_ENUM = new Set([
  'service',
  'product',
  'feature',
  'testimonial',
  'video',
  'image',
  'blog',
  'explainer',
  'brochure',
  'case-study',
  'pricing',
  'page-preview',
  'cta'
])

const BEST_FOR_ENUM = new Set([
  // services
  'cloud',
  'machine_learning',
  'apis',
  'web_dev',
  'ecommerce',
  'security',
  'agile',
  // TODD / Lead Vault
  'network',
  'outreach',
  'pulse',
  'moves',
  'docs',
  'knowledge',
  'lead_vault',
  'docs_km',
  'ai',
  // reserved
  'all'
])

const ASSET_KIND_ENUM = new Set([
  'inline',
  'url',
  'video',
  'image',
  'pdf',
  'phone',
  'form'
])

// ---------------------------------
// HELPERS
// ---------------------------------
function exists (p) {
  try {
    fs.accessSync(p)
    return true
  } catch {
    return false
  }
}

function stripSelectionArtifacts (s) {
  return String(s || '').replace(/<\/?user__selection>/g, '')
}

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'so',
  'to',
  'of',
  'in',
  'on',
  'for',
  'with',
  'by',
  'at',
  'from',
  'into',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'i',
  'we',
  'you',
  'they',
  'it',
  'this',
  'that',
  'these',
  'those',
  'my',
  'our',
  'your',
  'their',
  'me',
  'us',
  'help',
  'need',
  'want',
  'looking',
  'like',
  'really',
  'just',
  'some',
  'any',
  'about',
  'please',
  'taliferro',
  'todd'
])

function normText (s) {
  return stripSelectionArtifacts(s)
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractKeywords ({ title, description, urlPath }, limit = 18) {
  const base = normText(`${title || ''} ${description || ''} ${urlPath || ''}`)
  if (!base) return []

  const tokens = base
    .split(' ')
    .map(t => t.trim())
    .filter(t => t && t.length >= 3 && !STOPWORDS.has(t))

  const out = []
  const seen = new Set()
  for (const t of tokens) {
    if (seen.has(t)) continue
    seen.add(t)
    out.push(t)
    if (out.length >= limit) break
  }
  return out
}

function readText (p) {
  return fs.readFileSync(p, 'utf-8')
}

function normalize (str) {
  return (str || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_\-]/g, '_')
}

function toPosix (p) {
  return p.split(path.sep).join('/')
}

function unique (arr) {
  return Array.from(new Set(arr))
}

function safeBestFor (bestFor) {
  const vals = unique((bestFor || []).map(normalize))
  const filtered = vals.filter(v => BEST_FOR_ENUM.has(v))
  return filtered.length ? filtered : ['all']
}

function inferBestForFromPath (urlPath) {
  const p = (urlPath || '').toLowerCase()

  // Lead Vault first so it does not get lumped into generic cloud/security buckets.
  if (p.includes('/lead-vault')) return ['lead_vault']

  // TODD module pages
  if (p.includes('/todd/network')) return ['network']
  if (p.includes('/todd/outreach')) return ['outreach']
  if (p.includes('/todd/pulse')) return ['pulse']
  if (p.includes('/todd/moves')) return ['moves']
  if (p.includes('/todd/docs')) return ['docs']
  if (p.includes('/todd/knowledge')) return ['knowledge']

  // Broader TODD / BMS pages stay system-level
  if (
    p === '/todd/' ||
    p.includes('business-momentum-system') ||
    p.includes('crm-alternative')
  ) {
    return ['ai']
  }

  if (p.includes('machine-learning-services')) return ['machine_learning']

  // service-ish paths
  if (p.includes('cloud')) return ['cloud']
  if (p.includes('api')) return ['apis']
  if (p.includes('e-commerce') || p.includes('ecommerce')) return ['ecommerce']
  if (p.includes('cyber') || p.includes('security')) return ['security']
  if (p.includes('agile')) return ['agile']
  if (p.includes('website') || p.includes('web')) return ['web_dev']

  // blog defaults to all until a stronger signal is found elsewhere
  if (p.includes('/blog/')) return ['all']

  return ['all']
}

function inferBestForFromText ({ title, description, urlPath }) {
  const t = normText(`${title || ''} ${description || ''} ${urlPath || ''}`)
  if (!t) return null

  const picks = []

  // security / apis
  if (
    t.includes('oauth') ||
    t.includes('openid') ||
    t.includes('jwt') ||
    t.includes('pkce') ||
    t.includes('token') ||
    t.includes('sso')
  ) {
    picks.push('security', 'apis')
  }

  // web_dev / conversion / ux
  if (
    t.includes('website') ||
    t.includes('landing page') ||
    t.includes('conversion') ||
    t.includes('signup') ||
    t.includes('sign up') ||
    t.includes('form') ||
    t.includes('user experience') ||
    t.includes('ux')
  ) {
    picks.push('web_dev')
  }

  // ecommerce
  if (
    t.includes('ecommerce') ||
    t.includes('e-commerce') ||
    t.includes('checkout') ||
    t.includes('cart') ||
    t.includes('payments')
  ) {
    picks.push('ecommerce')
  }

  // cloud
  if (
    t.includes('aws') ||
    t.includes('azure') ||
    t.includes('gcp') ||
    t.includes('google cloud') ||
    t.includes('kubernetes') ||
    t.includes('firebase')
  ) {
    picks.push('cloud')
  }

  // agile
  if (
    t.includes('scrum') ||
    t.includes('kanban') ||
    t.includes('sprint') ||
    t.includes('backlog') ||
    t.includes('agile')
  ) {
    picks.push('agile')
  }

  // ai
  if (
    t.includes('artificial intelligence') ||
    t.includes('machine learning') ||
    t.includes(' ai ') ||
    t.includes('llm') ||
    t.includes('genai')
  ) {
    picks.push('ai')
  }

  return safeBestFor(picks)
}

function inferTopicsFromPath (urlPath) {
  const topics = []
  const p = (urlPath || '').toLowerCase()
  if (p.includes('/blog/')) topics.push('blog')
  if (p.includes('ai-adoption')) topics.push('ai_adoption')
  return topics
}

// Extracts <meta name="description">, <meta property="og:description">, <meta name="twitter:description">, and <title>
function extractPageTextMeta (html) {
  const out = { title: null, description: null }

  // meta description
  {
    const m = html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i
    )
    if (m && m[1]) out.description = m[1].trim()
  }

  // og:description
  if (!out.description) {
    const m = html.match(
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i
    )
    if (m && m[1]) out.description = m[1].trim()
  }

  // twitter:description
  if (!out.description) {
    const m = html.match(
      /<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']+)["'][^>]*>/i
    )
    if (m && m[1]) out.description = m[1].trim()
  }

  // title tag
  {
    const m = html.match(/<title>([^<]+)<\/title>/i)
    if (m && m[1]) out.title = m[1].trim()
  }

  return out
}

// Extract best preview image from HTML
function extractPreviewImage (html, pageDir) {
  // 1) og:image
  {
    const m = html.match(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i
    )
    if (m && m[1]) return normalizeAssetUrl(m[1])
  }

  // 2) twitter:image
  {
    const m = html.match(
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i
    )
    if (m && m[1]) return normalizeAssetUrl(m[1])
  }

  // 3) first <img src>
  {
    const m = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i)
    if (m && m[1]) return normalizeAssetUrl(m[1])
  }

  // 4) fallback: common image files in same directory
  const exts = new Set(['.webp', '.png', '.jpg', '.jpeg'])
  try {
    const files = fs.readdirSync(pageDir)
    const img = files.find(f => exts.has(path.extname(f).toLowerCase()))
    if (img) {
      const abs = path.join(pageDir, img)
      const rel = '/' + toPosix(path.relative(SITE_ROOT, abs))
      return normalizeAssetUrl(rel)
    }
  } catch {
    // ignore
  }

  return null
}

function normalizeAssetUrl (u) {
  const raw = (u || '').trim()
  if (!raw) return null

  // absolute http(s)
  if (/^https?:\/\//i.test(raw)) return raw

  // protocol-relative
  if (raw.startsWith('//')) return 'https:' + raw

  // relative paths
  if (raw.startsWith('/')) return SITE_ORIGIN + raw

  // relative without leading slash — assume from site root
  return SITE_ORIGIN + '/' + raw
}

function fileToUrlPath (absFile) {
  // Map a file under public to a URL path.
  // index.html -> folder path
  // other.html -> /folder/other.html (we keep .html because your site uses static html)

  const rel = toPosix(path.relative(SITE_ROOT, absFile))

  // if root file like home.html
  if (!rel.includes('/')) return '/' + rel

  const base = path.basename(rel).toLowerCase()
  if (base === 'index.html') {
    const dir = path.dirname(rel)
    return '/' + dir.replace(/\/$/, '') + '/'
  }

  return '/' + rel
}

function computeThumbUrl (urlPath) {
  // urlPath examples:
  //  - /blog/apr2023/.../post.html  -> same path with .webp
  //  - /blog/ai-adoption/          -> /blog/ai-adoption/img/ai-adoption.webp
  //  - /cloud-architecture-consulting/ -> /cloud-architecture-consulting/img/cloud-architecture-consulting.webp

  const p = (urlPath || '').trim()
  if (!p) return null

  // HTML file: replace .html with .webp
  if (p.toLowerCase().endsWith('.html')) {
    return SITE_ORIGIN + p.replace(/\.html$/i, '.webp')
  }

  // Directory URL ending with /
  if (p.endsWith('/')) {
    const parts = p.split('/').filter(Boolean)
    const last = parts.length ? parts[parts.length - 1] : ''
    if (!last) return null
    return SITE_ORIGIN + p + 'img/' + last + '.webp'
  }

  // Fallback: treat as path and append .webp
  return SITE_ORIGIN + p + '.webp'
}

function isGenericPreviewImage (url) {
  const u = String(url || '').toLowerCase()
  if (!u) return false

  // Common generic/brand assets that shouldn't be used as shelf thumbnails
  return (
    u.includes('/img/general/') ||
    u.includes('logo') ||
    u.endsWith('.svg') ||
    u.includes('/assets/og/') ||
    u.includes('../')
  )
}

function stableModuleIdFromUrl (urlPath, prefix) {
  const cleaned = normalize(urlPath.replace(/^\//, '').replace(/\/$/, ''))
  return `${prefix}_${cleaned || 'root'}`
}

function validateModule (m) {
  if (!m.module_id) throw new Error('module_id required')
  if (!TYPE_ENUM.has(m.type))
    throw new Error(`Invalid type: ${m.type} (${m.module_id})`)
  if (!Array.isArray(m.best_for))
    throw new Error(`best_for must be array (${m.module_id})`)
  m.best_for.forEach(b => {
    if (!BEST_FOR_ENUM.has(b))
      throw new Error(`Invalid best_for: ${b} (${m.module_id})`)
  })
  if (!m.asset || typeof m.asset !== 'object')
    throw new Error(`asset required (${m.module_id})`)
  if (!ASSET_KIND_ENUM.has(m.asset.kind))
    throw new Error(`Invalid asset.kind: ${m.asset.kind} (${m.module_id})`)
  if (['url', 'video', 'image', 'pdf'].includes(m.asset.kind) && !m.asset.url) {
    throw new Error(
      `asset.url required for kind=${m.asset.kind} (${m.module_id})`
    )
  }
  if (m.asset.kind === 'phone' && !m.asset.phone)
    throw new Error(`asset.phone required (${m.module_id})`)
  if (!m.description) throw new Error(`description required (${m.module_id})`)
  // Optional user-facing fields
  if (m.title != null) m.title = String(m.title)
  if (m.thumb_url != null) m.thumb_url = String(m.thumb_url)
  if (m.keywords != null) {
    if (!Array.isArray(m.keywords))
      throw new Error(`keywords must be array (${m.module_id})`)
    m.keywords = m.keywords.map(x => String(x)).filter(Boolean)
  }
  return m
}

function walkFiles (dir, predicate) {
  const out = []
  if (!exists(dir)) return out

  const stack = [dir]
  while (stack.length) {
    const cur = stack.pop()
    const entries = fs.readdirSync(cur, { withFileTypes: true })
    for (const e of entries) {
      const abs = path.join(cur, e.name)
      if (e.isDirectory()) {
        // skip node_modules or hidden
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue
        stack.push(abs)
      } else {
        if (!predicate || predicate(abs)) out.push(abs)
      }
    }
  }
  return out
}

function writeModulesJs (modules) {
  const header = `// GENERATED FILE. DO NOT EDIT BY HAND.\n// Run: node module-generator.mjs\n\nwindow.TALIFERRO_MODULES = `
  const cleanedModules = modules.map(m => {
    const copy = { ...m }
    if (copy.title != null) copy.title = stripSelectionArtifacts(copy.title)
    if (copy.description != null)
      copy.description = stripSelectionArtifacts(copy.description)
    if (copy.thumb_url != null)
      copy.thumb_url = stripSelectionArtifacts(copy.thumb_url)
    if (copy.asset && copy.asset.url)
      copy.asset = {
        ...copy.asset,
        url: stripSelectionArtifacts(copy.asset.url)
      }
    return copy
  })
  const json = JSON.stringify(cleanedModules, null, 2)
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true })
  fs.writeFileSync(OUTPUT_FILE, header + json + ';\n', 'utf-8')
}

// ---------------------------------
// BUILD MODULES
// ---------------------------------
function buildPagePreviewModules () {
  const htmlFiles = []
  for (const d of HTML_SCAN_DIRS) {
    htmlFiles.push(...walkFiles(d, p => p.toLowerCase().endsWith('.html')))
  }

  const modules = []
  for (const abs of htmlFiles) {
    const urlPath = fileToUrlPath(abs)
    const pageDir = path.dirname(abs)
    const html = readText(abs)
    const meta = extractPageTextMeta(html)

    const preview = extractPreviewImage(html, pageDir)

    const inferredFromText = inferBestForFromText({
      title: meta.title,
      description: meta.description,
      urlPath
    })

    const best_for = safeBestFor(
      inferredFromText || inferBestForFromPath(urlPath)
    )
    const topics = inferTopicsFromPath(urlPath)

    const keywords = extractKeywords({
      title: meta.title,
      description: meta.description,
      urlPath
    })

    // Type rules: blog pages -> blog, otherwise page-preview
    const isBlog = urlPath.includes('/blog/')
    const type = isBlog ? 'blog' : 'page-preview'

    const module_id = stableModuleIdFromUrl(urlPath, isBlog ? 'blog' : 'page')

    const m = {
      module_id,
      type,
      title: meta.title || null,
      keywords,
      thumb_url:
        preview && !isGenericPreviewImage(preview)
          ? preview
          : computeThumbUrl(urlPath) || preview || null,
      best_for,
      ...(topics.length ? { topics } : {}),
      asset: { kind: 'url', url: SITE_ORIGIN + urlPath },
      description:
        meta.description && meta.description.length >= 20
          ? meta.description
          : meta.title && meta.title.length >= 10
          ? meta.title
          : isBlog
          ? `Blog post: ${path.basename(abs)}`
          : `Preview: ${urlPath}`
    }

    // If we found a preview image, also add an image module to use as eye candy
    if (preview) {
      const imgMod = {
        module_id: `${module_id}_img`,
        type: 'image',
        title: meta.title || null,
        keywords,
        best_for,
        asset: { kind: 'image', url: preview },
        description: `Image from ${urlPath}`
      }
      modules.push(validateModule(imgMod))
    }

    modules.push(validateModule(m))
  }

  // pinned pages
  for (const p of PINNED_PAGES) {
    const abs = path.resolve(p.file)
    if (!exists(abs)) continue
    const urlPath = fileToUrlPath(abs)
    const html = readText(abs)
    const meta = extractPageTextMeta(html)
    const thumb = computeThumbUrl(urlPath)
    const module_id = p.module_id
      ? normalize(p.module_id)
      : stableModuleIdFromUrl(urlPath, 'page')
    const best_for = safeBestFor(p.best_for || inferBestForFromPath(urlPath))

    const keywords = extractKeywords({
      title: meta.title,
      description: p.description || meta.description,
      urlPath
    })

    const m = {
      module_id,
      type: p.type || 'page-preview',
      title: meta.title || null,
      thumb_url: thumb || null,
      keywords,
      best_for,
      asset: { kind: 'url', url: SITE_ORIGIN + urlPath },
      description: p.description || `Preview: ${urlPath}`
    }
    modules.push(validateModule(m))
  }

  return modules
}

function buildPdfModules () {
  const pdfs = walkFiles(PDF_DIR, p => p.toLowerCase().endsWith('.pdf'))
  return pdfs.map(abs => {
    const rel = '/' + toPosix(path.relative(SITE_ROOT, abs))
    // Normalize to the real public URL path. If files are under /assests/, rewrite to /assets/.
    const relFixed = rel.startsWith('/assests/')
      ? rel.replace('/assests/', '/assets/')
      : rel
    const url = SITE_ORIGIN + relFixed
    const base = path.basename(abs, '.pdf')

    const module_id = `pdf_${normalize(base)}`
    const pdfType = /(^|[_-])case([_-])study([_-]|$)/i.test(base)
      ? 'case-study'
      : 'brochure'

    return validateModule({
      module_id,
      type: pdfType,
      best_for: ['all'],
      keywords: extractKeywords({
        title: base,
        description: `PDF: ${base}`,
        urlPath: relFixed
      }),
      asset: { kind: 'pdf', url },
      description: `PDF: ${base}`
    })
  })
}

function buildVideoModules () {
  const out = []

  for (const v of VIDEOS) {
    const module_id = normalize(v.module_id)
    const type = normalize(v.type || 'video')
    const best_for = safeBestFor(v.best_for || ['all'])

    const m = {
      module_id,
      type,
      best_for,
      asset: { kind: 'video', url: v.url },
      keywords: extractKeywords({
        title: module_id,
        description: v.description,
        urlPath: v.url
      }),
      description:
        (v.description || '').toString().trim() || `Video: ${module_id}`
    }

    out.push(validateModule(m))
  }

  for (const t of TESTIMONIALS) {
    const module_id = normalize(t.module_id)
    const type = normalize(t.type || 'testimonial')
    const best_for = safeBestFor(t.best_for || ['all'])

    const m = {
      module_id,
      type,
      best_for,
      asset: { kind: 'video', url: t.url },
      keywords: extractKeywords({
        title: module_id,
        description: t.description,
        urlPath: t.url
      }),
      description:
        (t.description || '').toString().trim() || `Testimonial: ${module_id}`
    }

    out.push(validateModule(m))
  }

  return out
}

function buildBaseCtas () {
  // Keep your core call CTA always present.
  return [
    validateModule({
      module_id: 'cta_call_ty',
      type: 'cta',
      best_for: ['all'],
      asset: { kind: 'phone', phone: '+14016462662' },
      description: 'Tap to call Us now.',
      keywords: extractKeywords({
        title: 'call',
        description: 'Tap to call Us now.',
        urlPath: '/call'
      })
    })
  ]
}

function main () {
  console.log(`ℹ️ Using PDF_DIR: ${PDF_DIR}`)
  const pageMods = buildPagePreviewModules()
  const pdfMods = buildPdfModules()
  const vidMods = buildVideoModules()
  const ctas = buildBaseCtas()

  // De-dupe by module_id (last write wins)
  // De-dupe by module_id, and also de-dupe url-based page/blog modules by asset.url.
  const map = new Map()
  const urlKeyMap = new Map()

  function scoreModule (m) {
    const bf = Array.isArray(m.best_for) ? m.best_for : []
    const specific = bf.length === 1 && bf[0] === 'all' ? 0 : 2
    const hasThumb = m.thumb_url ? 1 : 0
    const pinnedBoost = String(m.module_id || '').startsWith('page_bms') ? 2 : 0
    return specific + hasThumb + pinnedBoost
  }

  for (const m of [...pageMods, ...pdfMods, ...vidMods, ...ctas]) {
    const isUrlModule =
      m.asset && m.asset.kind === 'url' && typeof m.asset.url === 'string'
    if (isUrlModule) {
      const key = `${m.type}|${m.asset.url}`
      const existingId = urlKeyMap.get(key)

      if (existingId) {
        const existing = map.get(existingId)
        if (existing && scoreModule(m) > scoreModule(existing)) {
          map.delete(existingId)
          map.set(m.module_id, m)
          urlKeyMap.set(key, m.module_id)
        }
        continue
      }

      urlKeyMap.set(key, m.module_id)
    }

    map.set(m.module_id, m)
  }

  // Stable output order: ctas last so they render as their own shelf
  const modules = Array.from(map.values()).sort((a, b) => {
    if (a.type === 'cta' && b.type !== 'cta') return 1
    if (a.type !== 'cta' && b.type === 'cta') return -1
    return a.module_id.localeCompare(b.module_id)
  })

  writeModulesJs(modules)

  console.log(`✅ Generated ${modules.length} modules -> ${OUTPUT_FILE}`)
}

main()
