import { getAllModules } from 'https://taliferro.com/js/taliferro.modules.js'

export function modulesSummaryForApi () {
  return (getAllModules() || []).slice(0, 180).map(m => ({
    module_id: m.module_id,
    type: m.type,
    best_for: Array.isArray(m.best_for) ? m.best_for : [],
    description: m.description
  }))
}