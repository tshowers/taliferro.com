import fs from 'fs'
import path from 'path'

const root = path.resolve('root/public')
const blogRoot = path.join(root, 'blog')
const bmsUrl = 'https://taliferro.com/business-momentum-system/'
const contactUrl = 'https://taliferro.com/contact.html'

const topicConfig = {
  machine_learning: {
    serviceUrl: 'https://taliferro.com/machine-learning-services/',
    serviceAnchors: [
      'machine learning consulting',
      'how we validate models',
      'predictive analytics services'
    ],
    bmsAnchors: [
      'Momentum System',
      'execution system',
      'momentum-focused operating system'
    ],
    contactAnchors: [
      'book a consult',
      'talk through the use case',
      'show us the model problem'
    ],
    bridgeSubject: 'modeling work',
    bridgeText: 'When machine learning starts influencing real decisions,',
    ctaTitle: 'Need stronger model confidence?',
    ctaText: 'Use this article as a starting point, then move into',
    primaryText: 'Machine learning consulting'
  },
  api: {
    serviceUrl: 'https://taliferro.com/api-consulting/',
    serviceAnchors: [
      'API consulting',
      'API design support',
      'how we harden API delivery'
    ],
    bmsAnchors: ['Momentum System', 'execution model', 'momentum system'],
    contactAnchors: [
      'book an API review',
      'talk through the gateway design',
      'show us the integration problem'
    ],
    bridgeSubject: 'integration work',
    bridgeText: 'If this API work needs to hold up under production pressure,',
    ctaTitle: 'Need a cleaner API path?',
    ctaText: 'Turn the article into action with',
    primaryText: 'API consulting'
  },
  frontend: {
    serviceUrl: 'https://taliferro.com/website-development/',
    serviceAnchors: [
      'website development services',
      'frontend delivery support',
      'web development that ships clean'
    ],
    bmsAnchors: ['Momentum System', 'momentum framework', 'execution system'],
    contactAnchors: [
      'book a frontend consult',
      'show us the delivery bottleneck',
      'talk through the build'
    ],
    bridgeSubject: 'frontend work',
    bridgeText: 'When the frontend has to perform in the real world,',
    ctaTitle: 'Need the frontend to move faster?',
    ctaText: 'If you want execution instead of more rework, start with',
    primaryText: 'Website development'
  },
  analytics: {
    serviceUrl: 'https://taliferro.com/machine-learning-services/',
    serviceAnchors: [
      'machine learning and analytics consulting',
      'decision-ready analytics services',
      'predictive analytics consulting'
    ],
    bmsAnchors: ['Momentum System', 'momentum model', 'execution framework'],
    contactAnchors: [
      'book an analytics consult',
      'show us the reporting gap',
      'talk through the dashboard'
    ],
    bridgeSubject: 'analytics work',
    bridgeText: 'If the goal is better decisions instead of more dashboards,',
    ctaTitle: 'Need analytics people will actually use?',
    ctaText: 'Move from reporting to action with',
    primaryText: 'Machine learning and analytics consulting'
  },
  cloud: {
    serviceUrl: 'https://taliferro.com/cloud-architecture-consulting/',
    serviceAnchors: [
      'cloud architecture consulting',
      'how we untangle cloud systems',
      'cloud design support'
    ],
    bmsAnchors: ['Momentum System', 'execution model', 'momentum system'],
    contactAnchors: [
      'book a cloud review',
      'show us the cloud bottleneck',
      'talk through the migration'
    ],
    bridgeSubject: 'cloud architecture',
    bridgeText: 'When cloud complexity starts slowing delivery,',
    ctaTitle: 'Need a cloud architecture reality check?',
    ctaText: 'Use the article to frame the issue, then review',
    primaryText: 'Cloud architecture'
  },
  agile: {
    serviceUrl: 'https://taliferro.com/agile-coaching/',
    serviceAnchors: [
      'agile coaching services',
      'scrum coaching and consulting',
      'how we fix slow software delivery'
    ],
    bmsAnchors: [
      'Momentum System',
      'execution framework',
      'momentum-focused operating model'
    ],
    contactAnchors: [
      'book an agile consult',
      'show us the delivery bottleneck',
      'talk through the sprint problem'
    ],
    bridgeSubject: 'agile delivery',
    bridgeText: 'When the delivery process itself is the bottleneck,',
    ctaTitle: 'Need delivery to move faster?',
    ctaText: 'Turn slower sprints into shipped work with',
    primaryText: 'Agile coaching'
  },
  bms: {
    serviceUrl: 'https://taliferro.com/website-development/',
    serviceAnchors: [
      'software development support',
      'workflow execution support',
      'system design that removes drag'
    ],
    bmsAnchors: [
      'Momentum System',
      'momentum system',
      'execution-first operating model'
    ],
    contactAnchors: [
      'book a short consult',
      'tell us what is stuck',
      'show us the drag point'
    ],
    bridgeSubject: 'execution work',
    bridgeText: 'When the deeper issue is stalled execution,',
    ctaTitle: 'Need momentum, not another patch?',
    ctaText: 'Start with',
    primaryText: 'Tell us what is stuck'
  }
}

function walk (dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, files)
    } else if (entry.isFile() && full.endsWith('.html')) {
      files.push(full)
    }
  }
  return files
}

function hash (value) {
  let h = 0
  for (let i = 0; i < value.length; i += 1) {
    h = (h << 5) - h + value.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

function pick (list, key) {
  return list[hash(key) % list.length]
}

function classify (filePath, source) {
  const title = (source.match(/<title>([^<]+)<\/title>/i) || [])[1] || ''
  const h1 = (source.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || ''
  const signals = `${filePath}\n${title}\n${h1}`.toLowerCase()
  const blob = `${signals}\n${source.slice(0, 8000)}`.toLowerCase()

  if (
    /(machine learning|clustering|silhouette|smote|predictive|classification|regression|computer vision|nlp|data science|fraud detection|unsupervised|supervised|ai in healthcare|model accuracy|algorithm)/i.test(
      signals
    )
  ) {
    return 'machine_learning'
  }

  if (
    /(agile|scrum|kanban|sprint|retrospective|velocity|story points|backlog|safe framework|scaled agile|agile coaching|agile transformation|software delivery|team productivity|devops culture)/i.test(
      signals
    )
  ) {
    return 'agile'
  }

  if (
    /(api gateway|graphql|apigee|api consulting|api design|rest api|oauth|microservices|gateway|quota|api-first|swagger|openapi)/i.test(
      signals
    )
  ) {
    return 'api'
  }

  if (
    /(dashboard|dashboards|metrics|powerbi|bi tools|analytics|data analytics|reporting|operational efficiency|big data)/i.test(
      signals
    )
  ) {
    return 'analytics'
  }

  if (
    /(angular|angularfire|responsive web|web design|website development|website developer|pwa|progressive web app|user interface|mobile-ready dashboards|frontend)/i.test(
      signals
    )
  ) {
    return 'frontend'
  }

  if (
    /(todd|business momentum|crm|follow-up|follow up|outreach|contacts|pipeline|stagnation|execution|automation|digital transformation|productivity|relationship management)/i.test(
      signals
    )
  ) {
    return 'bms'
  }

  if (
    /(cloud|aws|azure|gcp|serverless|kubernetes|container orchestration|cloud architecture|cloud cost|cloud computing)/i.test(
      signals
    )
  ) {
    return 'cloud'
  }

  if (
    /(api gateway|graphql|apigee|api consulting|api design|rest api|oauth|microservices|gateway|quota|api-first|swagger|openapi)/i.test(
      blob
    )
  ) {
    return 'api'
  }

  if (
    /(dashboard|dashboards|metrics|powerbi|bi tools|analytics|data analytics|reporting|operational efficiency|big data)/i.test(
      blob
    )
  ) {
    return 'analytics'
  }

  if (
    /(machine learning|clustering|silhouette|smote|predictive|classification|regression|computer vision|nlp|data science|fraud detection|unsupervised|supervised|ai in healthcare|model accuracy|algorithm)/i.test(
      blob
    )
  ) {
    return 'machine_learning'
  }

  if (
    /(agile|scrum|kanban|sprint|retrospective|velocity|story points|backlog|safe framework|scaled agile|agile coaching|agile transformation|software delivery|team productivity|devops culture)/i.test(
      blob
    )
  ) {
    return 'agile'
  }

  if (
    /(angular|angularfire|responsive web|web design|website development|website developer|pwa|progressive web app|user interface|mobile-ready dashboards|frontend)/i.test(
      blob
    )
  ) {
    return 'frontend'
  }

  if (
    /(todd|business momentum|crm|follow-up|follow up|outreach|contacts|pipeline|stagnation|execution|automation|digital transformation|productivity|relationship management)/i.test(
      blob
    )
  ) {
    return 'bms'
  }

  if (
    /(cloud|aws|azure|gcp|serverless|kubernetes|container orchestration|cloud architecture|cloud cost|cloud computing)/i.test(
      blob
    )
  ) {
    return 'cloud'
  }

  return 'bms'
}

function injectBridge (source, filePath, topic) {
  const marker = '<div class="post__content clearfix">'
  const start = source.indexOf(marker)
  if (start === -1) return source

  const serviceAnchor = pick(topic.serviceAnchors, `${filePath}-service-anchor`)
  const bmsAnchor = pick(topic.bmsAnchors, `${filePath}-bms-anchor`)
  const bridge = `
          <p class="wow fadeInUp" data-link-bridge="true">${topic.bridgeText} <a href="${topic.serviceUrl}">${serviceAnchor}</a> shows how Taliferro turns ${topic.bridgeSubject} into working execution, and the <a href="${bmsUrl}">${bmsAnchor}</a> keeps the work tied to outcomes instead of activity.</p>`

  if (source.includes('data-link-bridge="true"')) {
    return source.replace(
      /<p[^>]*data-link-bridge="true"[\s\S]*?<\/p>/,
      bridge.trimStart()
    )
  }

  const firstParagraphEnd = source.indexOf('</p>', start)
  if (firstParagraphEnd === -1) return source

  return `${source.slice(0, firstParagraphEnd + 4)}${bridge}${source.slice(
    firstParagraphEnd + 4
  )}`
}

function injectInlineCta (source, filePath, topic) {
  const serviceAnchor = pick(topic.serviceAnchors, `${filePath}-cta-service`)
  const bmsAnchor = pick(topic.bmsAnchors, `${filePath}-cta-bms`)
  const contactAnchor = pick(topic.contactAnchors, `${filePath}-cta-contact`)
  const cta = `
          <div class="callout mt-3 p-3" style="border-left:4px solid #222" data-internal-cta="true">
            <strong>${topic.ctaTitle}</strong>
            <p class="mb-0">${topic.ctaText} <a href="${topic.serviceUrl}">${serviceAnchor}</a>, connect it to the <a href="${bmsUrl}">${bmsAnchor}</a>, or <a href="${contactUrl}">${contactAnchor}</a>.</p>
          </div>
`

  if (source.includes('data-internal-cta="true"')) {
    return source.replace(
      /<div[^>]*data-internal-cta="true"[\s\S]*?<\/div>\s*/m,
      cta
    )
  }

  if (source.includes('<div class="post__tags')) {
    return source.replace(
      '<div class="post__tags',
      `${cta}        <div class="post__tags`
    )
  }

  return source.replace(
    /(\s+<\/div>\s+<\/div>\s+<\/div>\s+<\/section>)/,
    `${cta}$1`
  )
}

function updatePrimaryCtas (source, topic) {
  const replaceAnchor = (html, dataSource) => {
    const regex = new RegExp(
      `<a class="btn primary" href="[^"]*"([^>]*data-source="${dataSource}"[^>]*)>[^<]*<\\/a>`
    )
    if (!regex.test(html)) return html
    return html.replace(
      regex,
      `<a class="btn primary" href="${topic.serviceUrl}"$1>${topic.primaryText}</a>`
    )
  }

  let next = replaceAnchor(source, 'blog_cta')
  next = replaceAnchor(next, 'blog_sticky_cta')
  return next
}

function processFile (filePath) {
  const original = fs.readFileSync(filePath, 'utf8')
  if (!original.includes('post__content clearfix')) {
    return null
  }

  const topicKey = classify(filePath, original)
  const topic = topicConfig[topicKey]

  let updated = original
  updated = injectBridge(updated, filePath, topic)
  updated = injectInlineCta(updated, filePath, topic)
  updated = updatePrimaryCtas(updated, topic)

  if (updated === original) {
    return null
  }

  fs.writeFileSync(filePath, updated)
  return { filePath, topic: topicKey }
}

const files = walk(blogRoot)
const updated = []

for (const filePath of files) {
  const result = processFile(filePath)
  if (result) {
    updated.push(result)
  }
}

const summary = updated.reduce((acc, item) => {
  acc[item.topic] = (acc[item.topic] || 0) + 1
  return acc
}, {})

console.log(JSON.stringify({ updated: updated.length, summary }, null, 2))
