let MODULES = []
let MODULES_BY_ID = new Map()

export function setModules (modules) {
  MODULES = modules || []
  MODULES_BY_ID = new Map(MODULES.map(m => [m.module_id, m]))
}

export function getModule (moduleId) {
  return MODULES_BY_ID.get(moduleId)
}

export function getAllModules () {
  return MODULES
}