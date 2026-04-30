const SUPABASE_URL = 'https://xrwqndrtckfgoztfkktj.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_qSMLASfjFTfRacLt-NDP4g_BpnP-kZt'

const { createClient } = supabase
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

let currentLang = 'fr'
let allTools = []

// ─── UI STRINGS ──────────────────────────────────────────
const UI = {
  title: {
    fr: "Comparatif Agents IA de bureau - Mai 2026",
    en: "Comparison of Desktop AI Agents - May 2026",
    es: "Comparación de Agentes de IA de Escritorio - Mayo 2026",
    de: "Vergleich von Desktop-KI-Agenten - Mai 2026",
    it: "Confronto di Agenti IA Desktop - Maggio 2026",
    nl: "Vergelijking van AI-agenten voor desktopcomputers – mei 2026",
    ru: "Сравнение настольных ИИ-агентов — май 2026 года",
    hi: "डेस्कटॉप एआई एजेंटों की तुलना - मई 2026",
    pt: "Comparação de agentes de IA para desktop - Maio de 2026",
    ja: "デスクトップAIエージェントの比較 - 2026年5月",
    ko: "데스크톱 AI 에이전트 비교 - 2026년 5월",
    zh: "桌面人工智能助手对比 - 2026年5月",
  },
  criterion: {
    fr: "Caractéristiques",
    en: "Features",
    es: "Características",
    de: "Funktionen",
    it: "Funzioni",
    nl: "Functies",
    ru: "Функции",
    hi: "विशेषताएं",
    pt: "Características",
    ja: "機能",
    ko: "기능",
    zh: "功能",
  },
  empty: {
    fr: "Aucun outil pour l’instant.",
    en: "No tools yet.",
    es: "Sin herramientas aún.",
    de: "Noch keine Werkzeuge.",
    it: "Nessuno strumento per il momento.",
    nl: "Nog geen tools.",
    ru: "Пока нет инструментов.",
    hi: "अभी कोई उपकरण नहीं।",
    pt: "Nenhuma ferramenta no momento.",
    ja: "まだツールがありません。",
    ko: "아직 도구가 없습니다.",
    zh: "暂时没有工具。",
  },
  footer: {
    fr: "Maintenu par ia-decoded.fr",
    en: "Maintained by ia-decoded.com",
    es: "Mantenido por ia-decoded.com",
    de: "Gepflegt von ia-decoded.com",
    it: "Mantenuto da ia-decoded.com",
    nl: "Onderhouden door ia-decoded.com",
    ru: "Поддерживается ia-decoded.com",
    hi: "द्वारा रखरखाव ia-decoded.com",
    pt: "Mantido por ia-decoded.com",
    ja: "ia-decoded.comによってメンテナンスされています",
    ko: "ia-decoded.com에서 관리",
    zh: "由 ia-decoded.com 维护",
  },
  overlay: {
    description: {
      fr: "Description",
      en: "Description",
      es: "Descripción",
      de: "Beschreibung",
      it: "Descrizione",
      nl: "Beschrijving",
      ru: "Описание",
      hi: "विवरण",
      pt: "Descrição",
      ja: "説明",
      ko: "설명",
      zh: "描述",
    },
    positioning: {
      fr: "Positionnement",
      en: "Positioning",
      es: "Posicionamiento",
      de: "Positionierung",
      it: "Posizionamento",
      nl: "Positionering",
      ru: "Позиционирование",
      hi: "स्थिति",
      pt: "Posicionamento",
      ja: "ポジショニング",
      ko: "포지셔닝",
      zh: "定位",
    },
    ideal_for: {
      fr: "Idéal pour",
      en: "Ideal for",
      es: "Ideal para",
      de: "Ideal für",
      it: "Ideale per",
      nl: "Ideaal voor",
      ru: "Идеален для",
      hi: "के लिए आदर्श",
      pt: "Ideal para",
      ja: "に最適",
      ko: "이상적인",
      zh: "最适合",
    },
    limitations: {
      fr: "Limites",
      en: "Limitations",
      es: "Limitaciones",
      de: "Einschränkungen",
      it: "Limitazioni",
      nl: "Beperkingen",
      ru: "Ограничения",
      hi: "सीमाएं",
      pt: "Limitações",
      ja: "制限事項",
      ko: "제한 사항",
      zh: "限制",
    },
    editor_notes: {
      fr: "Note éditoriale",
      en: "Editor note",
      es: "Nota del editor",
      de: "Editornotiz",
      it: "Nota dell’editor",
      nl: "Opmerking van redacteur",
      ru: "Примечание редактора",
      hi: "संपादक नोट",
      pt: "Nota do editor",
      ja: "エディターノート",
      ko: "편집자 노트",
      zh: "编辑注",
    },
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
  { label: { fr: 'Éditeur', en: 'Publisher', es: 'Editorial', de: 'Herausgeber', it: 'Editore', nl: 'Uitgever', ru: 'Издатель', hi: 'प्रकाशक', pt: 'Editor', ja: '発行者', ko: '게시자', zh: '发布者' }, render: t => textCell(t.editor) },
  { label: { fr: 'Localisation', en: 'Location', es: 'Ubicación', de: 'Standort', it: 'Posizione', nl: 'Locatie', ru: 'Местоположение', hi: 'स्थान', pt: 'Localização', ja: '場所', ko: '위치', zh: '位置' }, render: t => textCell(t.location) },
  { label: { fr: 'Télécharger', en: 'Download', es: 'Descargar', de: 'Herunterladen', it: 'Scarica', nl: 'Downloaden', ru: 'Скачать', hi: 'डाउनलोड', pt: 'Baixar', ja: 'ダウンロード', ko: '다운로드', zh: '下载' }, render: t => t.website_url ? `<a href="${t.website_url}" target="_blank" title="${t.website_url}"><i class="fa fa-external-link"></i></a>` : '<span class="muted">—</span>' },
  { label: { fr: 'Date de sortie', en: 'Release date', es: 'Fecha de lanzamiento', de: 'Veröffentlichungsdatum', it: 'Data di rilascio', nl: 'Releasedatum', ru: 'Дата выпуска', hi: 'रिलीज़ की तारीख', pt: 'Data de lançamento', ja: 'リリース日', ko: '출시일', zh: '发布日期' }, render: t => textCell(t.first_release_date?.substring(0, 7)) },
  { label: { fr: 'License', en: 'License', es: 'Licencia', de: 'Lizenz', it: 'Licenza', nl: 'Licentie', ru: 'Лицензия', hi: 'लाइसेंस', pt: 'Licença', ja: 'ライセンス', ko: '라이센스', zh: '许可证' }, render: (t, l) => textCell(tx(t.licenses?.labels, l)) },
  { label: { fr: 'macOS', en: 'macOS', es: 'macOS', de: 'macOS', it: 'macOS', nl: 'macOS', ru: 'macOS', hi: 'macOS', pt: 'macOS', ja: 'macOS', ko: 'macOS', zh: 'macOS' }, render: t => boolIcon(t.macos) },
  { label: { fr: 'Windows', en: 'Windows', es: 'Windows', de: 'Windows', it: 'Windows', nl: 'Windows', ru: 'Windows', hi: 'Windows', pt: 'Windows', ja: 'Windows', ko: 'Windows', zh: 'Windows' }, render: t => boolIcon(t.windows) },
  { label: { fr: 'Linux', en: 'Linux', es: 'Linux', de: 'Linux', it: 'Linux', nl: 'Linux', ru: 'Linux', hi: 'Linux', pt: 'Linux', ja: 'Linux', ko: 'Linux', zh: 'Linux' }, render: t => boolIcon(t.linux) },
  { label: { fr: 'iOS', en: 'iOS', es: 'iOS', de: 'iOS', it: 'iOS', nl: 'iOS', ru: 'iOS', hi: 'iOS', pt: 'iOS', ja: 'iOS', ko: 'iOS', zh: 'iOS' }, render: t => boolIcon(t.ios) },
  { label: { fr: 'Android', en: 'Android', es: 'Android', de: 'Android', it: 'Android', nl: 'Android', ru: 'Android', hi: 'Android', pt: 'Android', ja: 'Android', ko: 'Android', zh: 'Android' }, render: t => boolIcon(t.android) },
  { label: { fr: 'Interface web', en: 'Web interface', es: 'Interfaz web', de: 'Weboberfläche', it: 'Interfaccia web', nl: 'Webinterface', ru: 'Веб-интерфейс', hi: 'वेब इंटरफेस', pt: 'Interface web', ja: 'Webインターフェース', ko: '웹 인터페이스', zh: '网络界面' }, render: t => boolIcon(t.web_interface) },
  { label: { fr: 'Choix du modèle', en: 'Model choice (BYOK)', es: 'Elección de modelo', de: 'Modellwahl', it: 'Scelta del modello', nl: 'Keuze van model', ru: 'Выбор модели', hi: 'मॉडल चुनाव', pt: 'Escolha de modelo', ja: 'モデルの選択', ko: '모델 선택', zh: '型号选择' }, render: t => boolIcon(t.model_choice) },
  { label: { fr: 'LLM local', en: 'Local LLM', es: 'LLM local', de: 'Lokales LLM', it: 'LLM locale', nl: 'Lokale LLM', ru: 'Локальная LLM', hi: 'स्थानीय LLM', pt: 'LLM local', ja: 'ローカルLLM', ko: '로컬 LLM', zh: '本地 LLM' }, render: t => boolIcon(t.local_llm) },
  { label: { fr: 'Freemium', en: 'Freemium', es: 'Freemium', de: 'Freemium', it: 'Freemium', nl: 'Freemium', ru: 'Фримиум', hi: 'फ्रीमियम', pt: 'Freemium', ja: 'フリーミアム', ko: '프리미엄', zh: '免费增值' }, render: t => boolIcon(t.freemium) },
  { label: { fr: 'Offre Entreprise', en: 'Enterprise offer', es: 'Oferta empresarial', de: 'Unternehmensangebot', it: 'Offerta aziendale', nl: 'Ondernemingsaanbod', ru: 'Предложение для предприятий', hi: 'एंटरप्राइज़ ऑफर', pt: 'Oferta empresarial', ja: 'エンタープライズオファー', ko: '엔터프라이즈 제안', zh: '企业优惠' }, render: t => boolIcon(t.enterprise_offer) },
  { label: { fr: 'Agentique cloud 24/7', en: 'Cloud agentic 24/7', es: 'Agente en la nube 24/7', de: 'Cloud-Agent 24/7', it: 'Agente cloud 24/7', nl: 'Cloud-agent 24/7', ru: 'Облачный агент 24/7', hi: 'क्लाउड एजेंट 24/7', pt: 'Agente na nuvem 24/7', ja: 'クラウドエージェント24/7', ko: '클라우드 에이전트 24/7', zh: '云代理 24/7' }, render: t => boolIcon(t.cloud_agentic_24_7) },
  { label: { fr: 'Messagerie (WA/Slack/TG)', en: 'Messaging (WA/Slack/TG)', es: 'Mensajería', de: 'Messaging', it: 'Messaggistica', nl: 'Berichten', ru: 'Обмен сообщениями', hi: 'संदेश भेजना', pt: 'Mensagens', ja: 'メッセージング', ko: '메시징', zh: '消息传递' }, render: t => boolIcon(t.messaging) },
  { label: { fr: 'MCP natif', en: 'Native MCP', es: 'MCP nativo', de: 'Natives MCP', it: 'MCP nativo', nl: 'Native MCP', ru: 'Native MCP', hi: 'नेटिव MCP', pt: 'MCP nativo', ja: 'ネイティブMCP', ko: '네이티브 MCP', zh: '本地 MCP' }, render: t => boolIcon(t.mcp_native) },
  { label: { fr: 'Computer use', en: 'Computer use', es: 'Uso de computadora', de: 'Computernutzung', it: 'Utilizzo del computer', nl: 'Computergebruik', ru: 'Использование компьютера', hi: 'कंप्यूटर का उपयोग', pt: 'Uso do computador', ja: 'コンピューター使用', ko: '컴퓨터 사용', zh: '计算机使用' }, render: t => boolIcon(t.computer_use) },
]

// ─── FETCH ───────────────────────────────────────────────
async function fetchTools() {
  const { data, error } = await db
    .from('tools')
    .select(`
      *,
      licenses(id, code, labels),
      tools_translations(field_key, field_value, lang_code)
    `)
    .eq('published', true)
    .order('order')
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
}

function renderTable() {
  const table   = document.getElementById('tools-table')
  const empty   = document.getElementById('empty-msg')

  const filtered = allTools

  if (filtered.length === 0) {
    table.innerHTML = ''
    empty.textContent = tx(UI.empty, currentLang)
    empty.classList.remove('hidden')
    return
  }
  empty.classList.add('hidden')

  const headCells = filtered.map(t => `
    <th data-id="${t.id}" width="9%">
      <span class="tool-name">${t.name}</span>
      <img src="https://xrwqndrtckfgoztfkktj.supabase.co/storage/v1/object/public/comparatif/logo-${t.slug}.svg" alt="${t.name}" class="tool-logo">
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
        <th>${tx(UI.criterion, currentLang)}</th>
        ${headCells}
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  `

  const footerURL = currentLang === 'fr' ? 'https://ia-decoded.fr' : 'https://ia-decoded.com'
  const footerText = tx(UI.footer, currentLang)
  document.getElementById('table-footer').innerHTML = `<a href="${footerURL}" target="_blank">${footerText}</a>`

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
      return v
        ? `<section><h3>${tx(UI.overlay[k], lang)}</h3>${marked.parse(v)}</section>`
        : ''
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

document.getElementById('lang-switcher').addEventListener('click', function(e) {
  const btn = e.target.closest('button')
  if (!btn) return
  currentLang = btn.dataset.lang
  render()
})

// ─── INIT ────────────────────────────────────────────────
async function init() {
  allTools = await fetchTools()
  render()
}

init()
