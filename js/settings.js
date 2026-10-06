// settings.js — the Settings panel (main menu SETTINGS button and the in-match
// menu). Holds the Graphics section: quality preset, render scale, one select
// per effect category, adaptive resolution, frame-rate readout and a cost
// summary. Every change applies immediately through graphics.js and persists.
//
// The rest of the game's UI is English-only; this panel's strings are
// localized for the supported locales, picked from navigator.language.
import { PRESETS, CATEGORIES, presetTier } from './gfx.js?v=10';

const STRINGS = {
  'en-US': {
    settings: 'SETTINGS', graphics: 'Graphics', quality: 'Quality', auto: 'Auto (detected: {tier})',
    p_low: 'Low', p_balanced: 'Balanced', p_high: 'High', p_ultra: 'Ultra',
    renderScale: 'Render scale', fromPreset: 'From preset ({tier})',
    adaptive: 'Adaptive resolution', showFps: 'Show frame rate', back: 'BACK',
    postFailed: 'Post-processing is unavailable on this device, so bloom, ambient occlusion, colour grade and FXAA/SMAA are off.',
    c_shadows: 'Shadows', c_ao: 'Ambient occlusion', c_bloom: 'Bloom', c_grade: 'Color grade', c_antialias: 'Anti-aliasing',
    c_reflections: 'Reflections', c_detail: 'Pitch & stand detail', c_crowd: 'Crowd', c_particles: 'Camera flashes & haze',
    t_off: 'Off', t_on: 'On', t_low: 'Low', t_medium: 'Medium', t_high: 'High', t_fxaa: 'FXAA', t_smaa: 'SMAA', t_msaa: 'MSAA',
    t_sparse: 'Sparse', t_full: 'Full', t_plain: 'Plain', t_detailed: 'Detailed',
    d_noShadows: 'no shadows', d_shadows: '{n}² shadows', d_ao: 'ambient occlusion', d_aoHigh: 'full ambient occlusion',
    d_bloom: 'bloom', d_reflections: 'reflections', d_noAA: 'no anti-aliasing', d_crowdSparse: 'sparse crowd',
  },
  'en-GB': {
    c_grade: 'Colour grade', t_fxaa: 'FXAA',
  },
  'es-419': {
    settings: 'AJUSTES', graphics: 'Gráficos', quality: 'Calidad', auto: 'Automática (detectada: {tier})',
    p_low: 'Baja', p_balanced: 'Equilibrada', p_high: 'Alta', p_ultra: 'Ultra',
    renderScale: 'Escala de renderizado', fromPreset: 'Según calidad ({tier})',
    adaptive: 'Resolución adaptativa', showFps: 'Mostrar FPS', back: 'VOLVER',
    postFailed: 'El posprocesado no está disponible en este dispositivo: el resplandor, la oclusión ambiental, la corrección de color y FXAA/SMAA están desactivados.',
    c_shadows: 'Sombras', c_ao: 'Oclusión ambiental', c_bloom: 'Resplandor', c_grade: 'Corrección de color', c_antialias: 'Antialiasing',
    c_reflections: 'Reflejos', c_detail: 'Detalle de cancha y tribunas', c_crowd: 'Público', c_particles: 'Flashes y bruma',
    t_off: 'No', t_on: 'Sí', t_low: 'Bajo', t_medium: 'Medio', t_high: 'Alto',
    t_sparse: 'Escaso', t_full: 'Lleno', t_plain: 'Simple', t_detailed: 'Detallado',
    d_noShadows: 'sin sombras', d_shadows: 'sombras {n}²', d_ao: 'oclusión ambiental', d_aoHigh: 'oclusión ambiental completa',
    d_bloom: 'resplandor', d_reflections: 'reflejos', d_noAA: 'sin antialiasing', d_crowdSparse: 'público escaso',
  },
  'es-ES': {
    settings: 'AJUSTES', graphics: 'Gráficos', quality: 'Calidad', auto: 'Automática (detectada: {tier})',
    p_low: 'Baja', p_balanced: 'Equilibrada', p_high: 'Alta', p_ultra: 'Ultra',
    renderScale: 'Escala de renderizado', fromPreset: 'Según calidad ({tier})',
    adaptive: 'Resolución adaptativa', showFps: 'Mostrar FPS', back: 'VOLVER',
    postFailed: 'El posprocesado no está disponible en este dispositivo: el resplandor, la oclusión ambiental, la corrección de color y FXAA/SMAA están desactivados.',
    c_shadows: 'Sombras', c_ao: 'Oclusión ambiental', c_bloom: 'Resplandor', c_grade: 'Corrección de color', c_antialias: 'Antialiasing',
    c_reflections: 'Reflejos', c_detail: 'Detalle de césped y gradas', c_crowd: 'Afición', c_particles: 'Flashes y bruma',
    t_off: 'No', t_on: 'Sí', t_low: 'Bajo', t_medium: 'Medio', t_high: 'Alto',
    t_sparse: 'Escasa', t_full: 'Llena', t_plain: 'Simple', t_detailed: 'Detallado',
    d_noShadows: 'sin sombras', d_shadows: 'sombras {n}²', d_ao: 'oclusión ambiental', d_aoHigh: 'oclusión ambiental completa',
    d_bloom: 'resplandor', d_reflections: 'reflejos', d_noAA: 'sin antialiasing', d_crowdSparse: 'afición escasa',
  },
  'de-DE': {
    settings: 'EINSTELLUNGEN', graphics: 'Grafik', quality: 'Qualität', auto: 'Auto (erkannt: {tier})',
    p_low: 'Niedrig', p_balanced: 'Ausgewogen', p_high: 'Hoch', p_ultra: 'Ultra',
    renderScale: 'Renderskalierung', fromPreset: 'Vorgabe ({tier})',
    adaptive: 'Adaptive Auflösung', showFps: 'Bildrate anzeigen', back: 'ZURÜCK',
    postFailed: 'Nachbearbeitung ist auf diesem Gerät nicht verfügbar – Bloom, Umgebungsverdeckung, Farbkorrektur und FXAA/SMAA sind aus.',
    c_shadows: 'Schatten', c_ao: 'Umgebungsverdeckung', c_bloom: 'Bloom', c_grade: 'Farbkorrektur', c_antialias: 'Kantenglättung',
    c_reflections: 'Reflexionen', c_detail: 'Rasen- & Tribünendetails', c_crowd: 'Zuschauer', c_particles: 'Blitzlichter & Dunst',
    t_off: 'Aus', t_on: 'An', t_low: 'Niedrig', t_medium: 'Mittel', t_high: 'Hoch',
    t_sparse: 'Wenige', t_full: 'Voll', t_plain: 'Einfach', t_detailed: 'Detailliert',
    d_noShadows: 'keine Schatten', d_shadows: '{n}²-Schatten', d_ao: 'Umgebungsverdeckung', d_aoHigh: 'volle Umgebungsverdeckung',
    d_bloom: 'Bloom', d_reflections: 'Reflexionen', d_noAA: 'keine Kantenglättung', d_crowdSparse: 'wenige Zuschauer',
  },
  'fr-FR': {
    settings: 'PARAMÈTRES', graphics: 'Graphismes', quality: 'Qualité', auto: 'Auto (détectée : {tier})',
    p_low: 'Basse', p_balanced: 'Équilibrée', p_high: 'Haute', p_ultra: 'Ultra',
    renderScale: 'Échelle de rendu', fromPreset: 'Selon la qualité ({tier})',
    adaptive: 'Résolution adaptative', showFps: 'Afficher les IPS', back: 'RETOUR',
    postFailed: 'Le post-traitement n’est pas disponible sur cet appareil : flou lumineux, occlusion ambiante, étalonnage et FXAA/SMAA sont désactivés.',
    c_shadows: 'Ombres', c_ao: 'Occlusion ambiante', c_bloom: 'Flou lumineux', c_grade: 'Étalonnage des couleurs', c_antialias: 'Anticrénelage',
    c_reflections: 'Reflets', c_detail: 'Détail pelouse et tribunes', c_crowd: 'Public', c_particles: 'Flashs et brume',
    t_off: 'Non', t_on: 'Oui', t_low: 'Bas', t_medium: 'Moyen', t_high: 'Élevé',
    t_sparse: 'Clairsemé', t_full: 'Complet', t_plain: 'Simple', t_detailed: 'Détaillé',
    d_noShadows: 'sans ombres', d_shadows: 'ombres {n}²', d_ao: 'occlusion ambiante', d_aoHigh: 'occlusion ambiante complète',
    d_bloom: 'flou lumineux', d_reflections: 'reflets', d_noAA: 'sans anticrénelage', d_crowdSparse: 'public clairsemé',
  },
  'fr-CA': {
    settings: 'PARAMÈTRES', graphics: 'Graphiques', quality: 'Qualité', auto: 'Auto (détectée : {tier})',
    p_low: 'Basse', p_balanced: 'Équilibrée', p_high: 'Haute', p_ultra: 'Ultra',
    renderScale: 'Échelle de rendu', fromPreset: 'Selon la qualité ({tier})',
    adaptive: 'Résolution adaptative', showFps: 'Afficher les images/s', back: 'RETOUR',
    postFailed: 'Le post-traitement n’est pas offert sur cet appareil : halo lumineux, occlusion ambiante, étalonnage et FXAA/SMAA sont désactivés.',
    c_shadows: 'Ombres', c_ao: 'Occlusion ambiante', c_bloom: 'Halo lumineux', c_grade: 'Étalonnage des couleurs', c_antialias: 'Anticrénelage',
    c_reflections: 'Reflets', c_detail: 'Détail du terrain et des gradins', c_crowd: 'Foule', c_particles: 'Flashs et brume',
    t_off: 'Non', t_on: 'Oui', t_low: 'Bas', t_medium: 'Moyen', t_high: 'Élevé',
    t_sparse: 'Clairsemée', t_full: 'Pleine', t_plain: 'Simple', t_detailed: 'Détaillé',
    d_noShadows: 'sans ombres', d_shadows: 'ombres {n}²', d_ao: 'occlusion ambiante', d_aoHigh: 'occlusion ambiante complète',
    d_bloom: 'halo lumineux', d_reflections: 'reflets', d_noAA: 'sans anticrénelage', d_crowdSparse: 'foule clairsemée',
  },
  'pt-BR': {
    settings: 'CONFIGURAÇÕES', graphics: 'Gráficos', quality: 'Qualidade', auto: 'Automática (detectada: {tier})',
    p_low: 'Baixa', p_balanced: 'Equilibrada', p_high: 'Alta', p_ultra: 'Ultra',
    renderScale: 'Escala de renderização', fromPreset: 'Conforme a qualidade ({tier})',
    adaptive: 'Resolução adaptativa', showFps: 'Mostrar FPS', back: 'VOLTAR',
    postFailed: 'O pós-processamento não está disponível neste dispositivo: brilho, oclusão de ambiente, correção de cor e FXAA/SMAA estão desligados.',
    c_shadows: 'Sombras', c_ao: 'Oclusão de ambiente', c_bloom: 'Brilho', c_grade: 'Correção de cor', c_antialias: 'Antisserrilhado',
    c_reflections: 'Reflexos', c_detail: 'Detalhe do gramado e arquibancadas', c_crowd: 'Torcida', c_particles: 'Flashes e névoa',
    t_off: 'Desligado', t_on: 'Ligado', t_low: 'Baixo', t_medium: 'Médio', t_high: 'Alto',
    t_sparse: 'Esparsa', t_full: 'Lotada', t_plain: 'Simples', t_detailed: 'Detalhado',
    d_noShadows: 'sem sombras', d_shadows: 'sombras {n}²', d_ao: 'oclusão de ambiente', d_aoHigh: 'oclusão de ambiente completa',
    d_bloom: 'brilho', d_reflections: 'reflexos', d_noAA: 'sem antisserrilhado', d_crowdSparse: 'torcida esparsa',
  },
  'it-IT': {
    settings: 'IMPOSTAZIONI', graphics: 'Grafica', quality: 'Qualità', auto: 'Automatica (rilevata: {tier})',
    p_low: 'Bassa', p_balanced: 'Bilanciata', p_high: 'Alta', p_ultra: 'Ultra',
    renderScale: 'Scala di rendering', fromPreset: 'Secondo la qualità ({tier})',
    adaptive: 'Risoluzione adattiva', showFps: 'Mostra FPS', back: 'INDIETRO',
    postFailed: 'La post-elaborazione non è disponibile su questo dispositivo: bagliore, occlusione ambientale, correzione colore e FXAA/SMAA sono disattivati.',
    c_shadows: 'Ombre', c_ao: 'Occlusione ambientale', c_bloom: 'Bagliore', c_grade: 'Correzione colore', c_antialias: 'Antialiasing',
    c_reflections: 'Riflessi', c_detail: 'Dettaglio campo e tribune', c_crowd: 'Pubblico', c_particles: 'Flash e foschia',
    t_off: 'No', t_on: 'Sì', t_low: 'Basso', t_medium: 'Medio', t_high: 'Alto',
    t_sparse: 'Scarso', t_full: 'Pieno', t_plain: 'Semplice', t_detailed: 'Dettagliato',
    d_noShadows: 'nessuna ombra', d_shadows: 'ombre {n}²', d_ao: 'occlusione ambientale', d_aoHigh: 'occlusione ambientale completa',
    d_bloom: 'bagliore', d_reflections: 'riflessi', d_noAA: 'nessun antialiasing', d_crowdSparse: 'pubblico scarso',
  },
};

export const LOCALES = Object.keys(STRINGS);

/** Best supported locale for a BCP-47 tag (exact, then by language). */
export function pickLocale(tag) {
  const t = String(tag || 'en-US');
  const exact = LOCALES.find((l) => l.toLowerCase() === t.toLowerCase());
  if (exact) return exact;
  const lang = t.slice(0, 2).toLowerCase();
  const region = t.slice(3).toUpperCase();
  if (lang === 'en') return ['GB', 'IE', 'AU', 'NZ', 'IN', 'ZA'].includes(region) ? 'en-GB' : 'en-US';
  if (lang === 'es') return 'es-419';
  if (lang === 'fr') return region === 'CA' ? 'fr-CA' : 'fr-FR';
  return { de: 'de-DE', pt: 'pt-BR', it: 'it-IT' }[lang] || 'en-US';
}

function translator(locale) {
  const table = { ...STRINGS['en-US'], ...STRINGS[locale] };
  return (key, vars) => {
    let s = table[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
    return s;
  };
}

export function createSettingsPanel({ graphics, audio }) {
  const $ = (id) => document.getElementById(id);
  const locale = pickLocale(navigator.languages?.[0] || navigator.language);
  const t = translator(locale);
  const describeWords = {};
  for (const k of ['noShadows', 'shadows', 'ao', 'aoHigh', 'bloom', 'reflections', 'noAA', 'crowdSparse']) describeWords[k] = t(`d_${k}`);

  const panel = $('screen-settings');
  const rows = $('gfx-rows');
  let returnFocus = null;
  let infoTimer = null;

  // localize the static chrome and the two entry buttons
  panel.setAttribute('lang', locale);
  $('settings-title').textContent = t('settings');
  $('gfx-heading').textContent = t('graphics');
  $('btn-settings-back').textContent = t('back');
  $('btn-settings').textContent = t('settings');
  $('btn-match-settings').textContent = t('settings');

  function option(value, label) {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    return o;
  }

  function row(id, labelText, control) {
    const r = document.createElement('div');
    r.className = 'gfx-row';
    const l = document.createElement('label');
    l.htmlFor = id;
    l.textContent = labelText;
    control.id = id;
    r.append(l, control);
    rows.append(r);
    return r;
  }

  // Quality
  const presetSel = document.createElement('select');
  presetSel.dataset.gfx = 'preset';
  row('gfx-preset', t('quality'), presetSel);

  // Render scale
  const scaleWrap = document.createElement('div');
  scaleWrap.className = 'gfx-scale';
  const scale = document.createElement('input');
  scale.type = 'range';
  scale.min = '50';
  scale.max = '200';
  scale.step = '5';
  scale.dataset.gfx = 'render_scale';
  const scaleVal = document.createElement('output');
  scaleVal.id = 'gfx-scale-val';
  scaleWrap.append(scale, scaleVal);
  const scaleRow = row('gfx-scale-wrap', t('renderScale'), scaleWrap);
  scale.id = 'gfx-scale';
  scaleRow.querySelector('label').htmlFor = 'gfx-scale';
  scaleWrap.id = '';

  // One select per category
  const catSel = {};
  for (const [cat, tiers] of Object.entries(CATEGORIES)) {
    const sel = document.createElement('select');
    sel.dataset.gfx = cat;
    sel.dataset.tiers = tiers.join(' ');
    catSel[cat] = sel;
    row(`gfx-${cat}`, t(`c_${cat}`), sel);
  }

  // Toggles
  function check(id, labelText, key) {
    const r = document.createElement('label');
    r.className = 'gfx-row menu-check';
    const c = document.createElement('input');
    c.type = 'checkbox';
    c.id = id;
    c.dataset.gfx = key;
    const span = document.createElement('span');
    span.textContent = labelText;
    r.append(span, c);
    rows.append(r);
    return c;
  }
  const adaptive = check('gfx-adaptive', t('adaptive'), 'adaptive');
  const showFps = check('gfx-fps', t('showFps'), 'show_fps');

  function refresh() {
    const saved = graphics.saved();
    const q = graphics.resolved();
    presetSel.replaceChildren(option('auto', t('auto', { tier: t(`p_${graphics.detected}`) })),
      ...PRESETS.map((p) => option(p, t(`p_${p}`))));
    presetSel.value = PRESETS.includes(saved.preset) ? saved.preset : 'auto';
    for (const [cat, tiers] of Object.entries(CATEGORIES)) {
      const sel = catSel[cat];
      sel.replaceChildren(option('preset', t('fromPreset', { tier: t(`t_${presetTier(q.preset, cat)}`) })),
        ...tiers.map((tier) => option(tier, t(`t_${tier}`))));
      sel.value = tiers.includes(saved[cat]) ? saved[cat] : 'preset';
    }
    scale.value = String(Math.round(q.renderScale * 100));
    scaleVal.textContent = `${scale.value}%`;
    adaptive.checked = q.adaptive;
    showFps.checked = q.showFps;
    refreshInfo();
  }

  function refreshInfo() {
    const info = graphics.info(describeWords);
    $('gfx-summary').textContent = `${info.gpu} · ${info.summary}`;
    const note = $('gfx-note');
    note.textContent = t('postFailed');
    note.classList.toggle('hidden', !info.postFailed);
  }

  presetSel.onchange = () => { graphics.setPreset(presetSel.value); refresh(); };
  for (const [cat, sel] of Object.entries(catSel)) {
    sel.onchange = () => { graphics.save({ [cat]: sel.value === 'preset' ? undefined : sel.value }); refresh(); };
  }
  scale.oninput = () => { scaleVal.textContent = `${scale.value}%`; };
  scale.onchange = () => { graphics.save({ render_scale: Number(scale.value) / 100 }); refresh(); };
  adaptive.onchange = () => { graphics.save({ adaptive: adaptive.checked }); refresh(); };
  showFps.onchange = () => { graphics.save({ show_fps: showFps.checked }); refresh(); };
  $('btn-settings-back').onclick = () => { audio?.ui(); close(); };

  function open() {
    returnFocus = document.activeElement;
    refresh();
    panel.classList.remove('hidden');
    presetSel.focus();
    clearInterval(infoTimer);
    // the pixel size and post-processing state settle a frame later
    infoTimer = setInterval(refreshInfo, 500);
  }

  function close() {
    panel.classList.add('hidden');
    clearInterval(infoTimer);
    if (returnFocus?.isConnected && returnFocus.offsetParent !== null) returnFocus.focus();
  }

  return { open, close, isOpen: () => !panel.classList.contains('hidden') };
}
