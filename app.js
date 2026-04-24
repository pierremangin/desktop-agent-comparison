const SUPABASE_URL = 'https://xrwqndrtckfgoztfkktj.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_qSMLASfjFTfRacLt-NDP4g_BpnP-kZt'

const { createClient } = supabase
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

let currentLang = 'fr'
let currentCategoryId = 'all'
let allTools = []
let allCategories = []

// ─── UI STRINGS ──────────────────────────────────────────
const UI = {
  title:         { fr: 'Outils IA de bureau',       en: 'Desktop AI tools' },
  allCategories: { fr: 'Tous',                      en: 'All' },
  criterion:     { fr: 'Critère',                   en: 'Criterion' },
  empty:         { fr: 'Aucun outil pour l’instant.', en: 'No tools yet.' },
  overlay: {
    description:  { fr: 'Description',      en: 'Description' },
    positioning:  { fr: 'Positionnement',   en: 'Positioning' },
    ideal_for:    { fr: 'Idéal pour',       en: 'Ideal for' },
    limitations:  { fr: 'Limites',          en: 'Limitations' },
    editor_notes: { fr: 'Note éditoriale',  en: 'Editor note' },
  },
}

const tx = (obj, lang) => obj?.[lang] ?? obj?.fr ?? ''

// ─── CRITERIA (rows) ─────────────────────────────────────
const boolIcon = v =>
  v === true  ? '<i class="fa fa-check"></i>' :
  v === false ? '<i class="fa fa-remove"></i>' :
                '<span class="muted">—</span>'

const textCell = v => (v ?? v === 0) ? String(v) : '<span class="muted">—</span>'

const levelCell = n => n
  ? '●'.repeat(n) + '<span class="muted">' + '○'.repeat(3 - n) + '</span>'
  : '<span class="muted">—</span>'

const CRITERIA = [
  { label: { fr: 'Éditeur',               en: 'Publisher' },         render: t => textCell(t.editor) },
  { label: { fr: 'Date de sortie',        en: 'Release date' },      render: t => textCell(t.first_release_date) },
  { label: { fr: 'License',               en: 'License' },           render: (t, l) => textCell(tx(t.licenses?.labels, l)) },
  { label: { fr: 'Fréquence de MàJ',      en: 'Update frequency' },  render: (t, l) => textCell(tx(t.update_frequencies?.labels, l)) },
  { label: { fr: 'Prise en main',         en: 'Ease of use' },       render: t => levelCell(t.onboarding_level) },
  { label: { fr: 'macOS',                 en: 'macOS' },             render: t => boolIcon(t.macos) },
  { label: { fr: 'Windows',               en: 'Windows' },           render: t => boolIcon(t.windows) },
  { label: { fr: 'Linux',                 en: 'Linux' },             render: t => boolIcon(t.linux) },
  { label: { fr: 'iOS',                   en: 'iOS' },               render: t => boolIcon(t.ios) },
  { label: { fr: 'Android',               en: 'Android' },           render: t => boolIcon(t.android) },
  { label: { fr: 'Choix du modèle',       en: 'Model choice' },      render: t => boolIcon(t.model_choice) },
  { label: { fr: 'Freemium',              en: 'Freemium' },          render: t => boolIcon(t.freemium) },
  { label: { fr: 'Offre Entreprise',      en: 'Enterprise offer' },  render: t => boolIcon(t.enterprise_offer) },
  { label: { fr: 'LLM local',             en: 'Local LLM' },         render: t => boolIcon(t.local_llm) },
  { label: { fr: 'Agentique locale',      en: 'Local agentic' },     render: t => boolIcon(t.local_agentic) },
  { label: { fr: 'Agentique cloud 24/7',  en: 'Cloud agentic 24/7' },render: t => boolIcon(t.cloud_agentic_24_7) },
  { label: { fr: 'Documentation',         en: 'Documentation' },     render: t => boolIcon(t.documentation) },
  { label: { fr: 'Automatisation',        en: 'Automation' },        render: t => boolIcon(t.automation) },
]

// ─── FETCH ───────────────────────────────────────────────
async function fetchTools() {
  const { data, error } = await db
    .from('tools')
    .select(`
      *,
      categories(id, code, labels),
      licenses(id, code, labels),
      update_frequencies(id, code, labels),
      tools_translations(field_key, field_value, lang_code)
    `)
    .order('name')
  if (error) { console.error(error); return [] }
  return data
}

async function fetchCategories() {
  const { data, error } = await db
    .from('categories')
    .select('id, code, labels')
    .order('id')
  if (error) { console.error(error); return [] }
  return data
}

function getTranslation(tool, lang, key) {
  return tool.tools_translations?.find(
    tr => tr.lang_code === lang && tr.field_key === key
  )?.field_value || ''
}

// ─── RENDER ──────────────────────────────────────────────
function renderChrome() {
  document.title = tx(UI.title, currentLang)
  document.getElementById('page-title').textContent = tx(UI.title, currentLang)

  document.querySelectorAll('#lang-switcher button').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === currentLang)
  })

  const nav = document.getElementById('category-filter')
  const buttons = [
    { id: 'all', label: tx(UI.allCategories, currentLang) },
    ...allCategories.map(c => ({ id: String(c.id), label: tx(c.labels, currentLang) })),
  ]
  nav.innerHTML = buttons.map(b => `
    <button data-cat="${b.id}" class="${b.id === String(currentCategoryId) ? 'active' : ''}">${b.label}</button>
  `).join('')
}

function renderTable() {
  const table   = document.getElementById('tools-table')
  const empty   = document.getElementById('empty-msg')

  const filtered = currentCategoryId === 'all'
    ? allTools
    : allTools.filter(t => t.category_id === Number(currentCategoryId))

  if (filtered.length === 0) {
    table.innerHTML = ''
    empty.textContent = tx(UI.empty, currentLang)
    empty.classList.remove('hidden')
    return
  }
  empty.classList.add('hidden')

  const headCells = filtered.map(t => `
    <th data-id="${t.id}">
      <span class="tool-name">${t.name}</span>
      ${t.editor ? `<span class="editor">${t.editor}</span>` : ''}
    </th>
  `).join('')

  const bodyRows = CRITERIA.map(c => `
    <tr>
      <td>${tx(c.label, currentLang)}</td>
      ${filtered.map(t => `<td>${c.render(t, currentLang)}</td>`).join('')}
    </tr>
  `).join('')

  table.innerHTML = `
    <thead>
      <tr>
        <th style="width:22%">${tx(UI.criterion, currentLang)}</th>
        ${headCells}
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  `

  table.querySelectorAll('thead th[data-id]').forEach(th => {
    th.addEventListener('click', () => {
      const tool = filtered.find(t => t.id === th.dataset.id)
      if (tool) openOverlay(tool, currentLang)
    })
  })
}

function render() {
  renderChrome()
  renderTable()
}

// ─── OVERLAY ─────────────────────────────────────────────
function openOverlay(tool, lang) {
  const keys = ['description', 'positioning', 'ideal_for', 'limitations', 'editor_notes']

  document.getElementById('overlay-content').innerHTML = `
    <h2>${tool.name}</h2>
    ${tool.website_url
      ? `<p class="editor"><a href="${tool.website_url}" target="_blank" rel="noopener">${tool.editor ?? ''}</a></p>`
      : (tool.editor ? `<p class="editor">${tool.editor}</p>` : '')}
    ${keys.map(k => {
      const v = getTranslation(tool, lang, k)
      return v ? `<section><h3>${tx(UI.overlay[k], lang)}</h3><p>${v}</p></section>` : ''
    }).join('')}
  `

  document.getElementById('overlay').classList.remove('hidden')
  document.body.style.overflow = 'hidden'
}

function closeOverlay() {
  document.getElementById('overlay').classList.add('hidden')
  document.body.style.overflow = ''
}

// ─── EVENTS ──────────────────────────────────────────────
document.getElementById('overlay-close').addEventListener('click', closeOverlay)
document.getElementById('overlay').addEventListener('click', function(e) {
  if (e.target === this) closeOverlay()
})
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeOverlay() })

document.getElementById('category-filter').addEventListener('click', function(e) {
  const btn = e.target.closest('button')
  if (!btn) return
  currentCategoryId = btn.dataset.cat
  render()
})

document.getElementById('lang-switcher').addEventListener('click', function(e) {
  const btn = e.target.closest('button')
  if (!btn) return
  currentLang = btn.dataset.lang
  render()
})

// ─── INIT ────────────────────────────────────────────────
async function init() {
  [allTools, allCategories] = await Promise.all([fetchTools(), fetchCategories()])
  render()
}

init()
