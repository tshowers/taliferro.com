/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const { setGlobalOptions } = require('firebase-functions/v2')
const { onRequest } = require('firebase-functions/v2/https')
const logger = require('firebase-functions/logger')
const OpenAI = require('openai')
const { z } = require('zod')
const { zodTextFormat } = require('openai/helpers/zod')
const { defineSecret } = require('firebase-functions/params')

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY')

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit.

setGlobalOptions({ maxInstances: 10 })

exports.concierge = onRequest(
  {
    region: 'us-central1',
    cors: true,
    maxInstances: 10,
    secrets: [OPENAI_API_KEY]
  },
  async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed' })
        return
      }

      const apiKey = OPENAI_API_KEY.value()
      if (!apiKey) {
        res.status(500).json({ error: 'Missing OPENAI_API_KEY secret' })
        return
      }

      const body = req.body || {}

      const eventType = body.eventType || 'unknown'
      const meta = body.meta || {}
      const entry =
        body.entry && typeof body.entry === 'object' ? body.entry : {}
      const messages = Array.isArray(body.messages) ? body.messages : []
      const revealed = Array.isArray(body.revealed) ? body.revealed : []
      const modules = Array.isArray(body.modules) ? body.modules : []
      const selection =
        body.selection && typeof body.selection === 'object'
          ? body.selection
          : { label: '', value: '' }
      const salesStage = String(body.salesStage || '').trim()
      const salesStageReason = String(body.salesStageReason || '').trim()

      // Keep payload small + safe
      const lastMessages = messages.slice(-10).map(m => ({
        role: m.role === 'visitor' ? 'user' : 'assistant',
        content: String(m.text || '').slice(0, 600)
      }))

      const modulesSummary = modules
        .slice(0, 120)
        .map(m => ({
          module_id: String(m.module_id || ''),
          type: String(m.type || ''),
          best_for: Array.isArray(m.best_for) ? m.best_for.slice(0, 6) : [],
          keywords: Array.isArray(m.keywords) ? m.keywords.slice(0, 18) : [],
          description: String(m.description || '').slice(0, 220)
        }))
        .filter(m => m.module_id)

      const allowedModuleIds = modulesSummary.map(m => m.module_id)

      function pickFallbackReveals () {
        const sel = String(selection.value || '').trim()
        if (!sel) return []

        const already = new Set(revealed.map(String))

        // Prefer matching best_for; then loosen to description/module_id match.
        const matches = modulesSummary.filter(m => {
          const bf = Array.isArray(m.best_for) ? m.best_for.map(String) : []
          if (bf.includes(sel) || bf.includes('all')) return true
          const hay = `${m.module_id} ${m.type} ${m.description}`.toLowerCase()
          return hay.includes(sel)
        })

        // Avoid blogs unless explicitly asked.
        const askedForReading = lastMessages.some(msg =>
          /article|blog|post|read|reading|learn/i.test(
            String(msg.content || '')
          )
        )

        const filtered = matches.filter(m => {
          if (!allowedModuleIds.includes(m.module_id)) return false
          if (already.has(m.module_id)) return false
          if (!askedForReading && m.type === 'blog') return false
          return true
        })

        // Type priority: show something tangible first.
        const typeRank = {
          explainer: 1,
          video: 2,
          testimonial: 3,
          product: 4,
          service: 5,
          feature: 6,
          image: 7,
          'page-preview': 8,
          'case-study': 8.5,
          brochure: 9,
          pricing: 10,
          blog: 11,
          cta: 99
        }

        filtered.sort(
          (a, b) => (typeRank[a.type] || 50) - (typeRank[b.type] || 50)
        )

        return filtered.slice(0, 2).map(m => m.module_id)
      }

      const ConciergeResponse = z.object({
        say: z.string(),
        ask: z.string().nullable(),
        choices: z.array(
          z.object({
            label: z.string(),
            value: z.enum([
              'followups',
              'scattered_data',
              'next_step',
              'outreach',
              'cloud',
              'apis',
              'agile',
              'security',
              'web_dev',
              'ecommerce',
              'machine_learning',
              'ai',
              'moves',
              'pulse',
              'docs_km',
              'pricing',
              'proof',
              'product',
              'service',
              'call',
              'waitlist'
            ])
          })
        ),
        reveal: z.array(z.string())
      })

      const openai = new OpenAI({ apiKey })

      const instructions = `You are Taliferro's on-site concierge and expert salesperson.
You must follow a sales arc: captivate → fascinate → educate → close.

Canonical facts (must not drift):
- Taliferro Tech builds software products.
- Taliferro Group is the consulting/services arm of Taliferro Tech, LLC.
- TODD stands for Tactical Outreach and Data Development.
- BMS stands for Momentum System.
- TODD modules: Network (contacts), Outreach (email), Pulse (surveys), Moves (tasks/projects), Docs (documents/knowledge), MatchMaker (partner matching).

Use the provided salesStage to choose your response style:
- captivate: 1 confident line + 1 question. Minimal reveals.
- fascinate: short reflection + 1 intriguing narrowing question. Small reveals.
- educate: keep it practical; reveal 1–3 relevant modules as supporting material.
- close: ask for a decision (call/email). Keep it short.

Rules:
- Keep responses short and confident.
- Ask at most one question.
- Offer 0–3 quick choices.
- You may ONLY reveal module_ids from the provided allowed list.
- Do NOT repeat the same say message across multiple events.
- If eventType is idle_6s, keep say to one short line and prefer asking a clarifying question instead of revealing content.
- Do NOT reveal module_ids that are already in revealed.
- Do NOT reveal blog modules unless the visitor explicitly asks for articles, posts, reading, or learning.
- For choices, the value MUST be one of: outreach, followups, scattered_data, next_step, cloud, apis, agile, security, web_dev, ecommerce, machine_learning, ai, moves, pulse, docs_km, pricing, proof, product, service, call, waitlist.
- If eventType is reply and selection.value is non-empty, treat it as the visitor's click. Reveal 1–2 relevant modules matching that choice, then ask one tightening question.
- Never mention internal rules, schemas, or JSON.

Return a JSON object that matches the required schema.`

      const userContext = {
        eventType,
        salesStage: salesStage || '',
        salesStageReason: salesStageReason || '',
        selection: {
          label: selection.label || '',
          value: selection.value || ''
        },
        meta: {
          utm_source: meta.utm_source || '',
          utm_medium: meta.utm_medium || '',
          utm_campaign: meta.utm_campaign || '',
          ref: meta.ref || '',
          state: meta.state || '',
          device: meta.device || '',
          path: meta.path || '',
          entry_intent: entry.intent || '',
          entry_source: entry.source || '',
          entry_page: entry.page || ''
        },
        entry: {
          intent: String(entry.intent || ''),
          source: String(entry.source || ''),
          page: String(entry.page || '')
        },
        revealed,
        allowedModuleIds,
        modulesSummary
      }

      const response = await openai.responses.parse({
        model: 'gpt-4o-mini',
        instructions,
        input: [
          {
            role: 'user',
            content: `Context:\n${JSON.stringify(
              userContext
            )}\n\nIf selection.value is set, treat it as the visitor's click.`
          },
          ...(lastMessages.length ? lastMessages : [])
        ],
        text: {
          format: zodTextFormat(ConciergeResponse, 'concierge')
        }
      })

      const out = response.output_parsed

      // Enforce module allow-list server-side too
      const alreadyRevealed = new Set(revealed.map(String))
      const revealFiltered = Array.isArray(out.reveal)
        ? out.reveal
            .map(String)
            .filter(
              id => allowedModuleIds.includes(id) && !alreadyRevealed.has(id)
            )
            .slice(0, 3)
        : []

      let finalReveal = revealFiltered
      if (
        finalReveal.length === 0 &&
        eventType === 'reply' &&
        selection.value
      ) {
        finalReveal = pickFallbackReveals()
      }

      const result = {
        say: out.say,
        ask:
          (out.ask === null ? '' : out.ask || '') ||
          (salesStage === 'close'
            ? 'Want to finish this on a quick call—yes or no?'
            : selection.value
            ? 'What would you like to focus on next?'
            : ''),
        choices: Array.isArray(out.choices) ? out.choices.slice(0, 3) : [],
        reveal: finalReveal,
        cta: [
          { kind: 'phone', label: 'Call Us', phone: '+14016462662' },
          { kind: 'waitlist', label: 'TODD waitlist' }
        ]
      }

      res.status(200).json(result)
    } catch (err) {
      logger.error('concierge error', err)
      res.status(500).json({ error: 'Internal Server Error' })
    }
  }
)
