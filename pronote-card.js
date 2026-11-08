{ // bloc isolé : aucune variable ne fuit vers les autres cartes
/*
 * Pronote Card (FR)
 * Carte Home Assistant « Pronote » : emploi du temps, devoirs, évaluations (compétences), notes,
 * vie scolaire (absences, retards, punitions) et cantine, en onglets.
 * Utilise les capteurs de l'intégration Pronote (hass-pronote).
 * Style verre, thème clair/sombre automatique, éditeur visuel, textes en français.
 */

const CARD_VERSION = "1.0.0";

/* === NUANCE COMMUNE v2 (cartes Johan854) ===
 * Bloc identique dans toutes les cartes. Options : nuance, nuance_perso, intensite.
 * nuance "theme" (par défaut) : suit la variable carte-nuance du thème Home Assistant ;
 * si elle n'existe pas, la carte garde ses couleurs d'origine. Intensité : 0 = neutre, 1 = normal, 2 = très coloré. */
const GV_NUANCES = [["braise", "Braise (rouge)", "#e0524f"], ["ocean", "Océan (bleu)", "#2f8fd8"], ["lagon", "Lagon (turquoise)", "#1fb5a8"], ["foret", "Forêt (vert)", "#3fae5a"], ["lavande", "Lavande (violet)", "#8a63d8"], ["framboise", "Framboise (rose)", "#e05597"], ["ambre", "Ambre (orange)", "#e8902c"], ["ardoise", "Ardoise (neutre)", "#7d8595"]];
const GV_DEFAULTS = { nuance: "theme", intensite: 1 };
const gvAccent = (c) => {
  const p = c && c.nuance_perso;
  if (c && c.nuance === "perso") {
    if (Array.isArray(p) && p.length === 3) return "#" + p.map((v) => Math.max(0, Math.min(255, Math.round(+v || 0))).toString(16).padStart(2, "0")).join("");
    if (typeof p === "string" && /^#?[0-9a-f]{6}$/i.test(p.trim())) return "#" + p.trim().replace("#", "");
  }
  const n = GV_NUANCES.find((x) => x[0] === (c && c.nuance));
  return n ? n[2] : "var(--carte-nuance)";
};
/* Variables posées sur <ha-card> : --g-bg-x (fond dégradé teinté) et --acc-ui-x (couleur d'accent).
 * Sans nuance (thème sans carte-nuance), elles sont invalides : chaque carte retombe alors sur ses couleurs d'origine. */
const gvStyle = (c, dark) => {
  const i = Number(c && c.intensite), ai = Number.isFinite(i) ? Math.max(0, Math.min(2, i)) : 1;
  const m = (pct, base) => `color-mix(in srgb,var(--acc-ui) ${+(pct * ai).toFixed(1)}%,${base})`;
  const bg = dark ? `linear-gradient(160deg,${m(5, "#1b1e32")} 0%,${m(11, "#1f1b2c")} 55%,${m(22, "#1c1620")} 100%)`
    : `linear-gradient(160deg,${m(2, "#f8f9fd")} 0%,${m(5, "#eef1f8")} 55%,${m(11, "#f8f8fa")} 100%)`;
  return `--acc-ui:${gvAccent(c)};--g-bg-x:${bg};--acc-ui-x:color-mix(in srgb,var(--acc-ui) ${dark ? "80%,#fff" : "82%,#000"})`;
};
const GV_FIELDS = [
  { name: "nuance", selector: { select: { mode: "dropdown", options: [{ value: "theme", label: "Selon le thème (couleurs d'origine)" }, ...GV_NUANCES.map((n) => ({ value: n[0], label: n[1] })), { value: "perso", label: "Personnalisée" }] } } },
  { name: "nuance_perso", selector: { color_rgb: {} } },
  { name: "intensite", selector: { number: { min: 0, max: 2, step: 0.1, mode: "slider" } } }];
const GV_LABELS = { nuance: "Nuance de couleur", nuance_perso: "Couleur personnalisée (nuance « Personnalisée »)", intensite: "Intensité de la nuance" };
/* === FIN NUANCE COMMUNE === */

const TABS = [
  { id: "edt", label: "Emploi du temps", short: "Cours", icon: "mdi:calendar-clock" },
  { id: "devoirs", label: "Devoirs", short: "Devoirs", icon: "mdi:notebook-edit-outline" },
  { id: "evaluations", label: "Évaluations", short: "Compét.", icon: "mdi:star-check-outline" },
  { id: "notes", label: "Notes", short: "Notes", icon: "mdi:numeric-10-box-outline" },
  { id: "vie", label: "Vie scolaire", short: "Vie sco.", icon: "mdi:account-school-outline" },
  { id: "cantine", label: "Cantine", short: "Cantine", icon: "mdi:silverware-fork-knife" },
];

const DEFAULTS = {
  entity: "", // n'importe quel capteur Pronote de l'enfant (ex. sensor.pronote_croue_logan_class)
  name: "", // nom affiché (par défaut : prénom Pronote)
  image: "", // photo / avatar (ex. /local/image/Logan.jpg)
  default_tab: "auto", // auto | edt | devoirs | evaluations | notes | vie | cantine
  hide_empty_tabs: true,
  show_done_homework: true,
  homework_days: 14, // devoirs affichés sur N jours
  max_evaluations: 12,
  theme: "auto", nuance: "theme", intensite: 1,
};

const SUFFIXES = ["class", "pronote_version", "today_s_timetable", "tomorrow_s_timetable", "next_day_s_timetable", "period_s_timetable",
  "homework", "period_s_homework", "grades", "absences", "evaluations", "averages", "punishments", "delays",
  "information_and_surveys", "timetable_ical_url", "next_alarm", "menus", "overall_average", "current_period", "periods",
  "previous_periods", "active_periods", "server_status"];

// Niveaux de compétences Pronote → couleur
const LEVELS = [
  [/tr[eè]s bonne/i, "#1f9d55", 4], [/satisfaisante/i, "#6cc04a", 3], [/fragile/i, "#f0a020", 2], [/insuffisante/i, "#e0524f", 1],
];
const levelOf = (a) => {
  const txt = (a && (a.level || "")) + "";
  const f = LEVELS.find((l) => l[0].test(txt));
  if (f) return { color: f[1], rank: f[2] };
  const ab = ((a && a.abbreviation) || "").toUpperCase();
  if (ab === "A+") return { color: "#1f9d55", rank: 4 };
  if (ab === "A") return { color: "#6cc04a", rank: 3 };
  if (ab === "B" || ab === "C") return { color: "#f0a020", rank: 2 };
  if (ab === "D") return { color: "#e0524f", rank: 1 };
  return { color: "#8a90a0", rank: 0 };
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Pronote écrit tout en majuscules sans accents : on remet des noms lisibles
const NOACC = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const SUBJECTS = {
  "FRANCAIS": "Français", "MATHEMATIQUES": "Mathématiques", "EDUCATION MUSICALE": "Éducation musicale", "ARTS PLASTIQUES": "Arts plastiques",
  "ED.PHYSIQUE & SPORT.": "EPS", "EDUCATION PHYSIQUE ET SPORTIVE": "EPS", "EPS": "EPS", "HISTOIRE-GEOGRAPHIE": "Histoire-géographie", "HISTOIRE GEOGRAPHIE": "Histoire-géographie",
  "HISTOIRE & GEOGRAPHIE": "Histoire-géographie", "ENS. MORAL & CIVIQUE": "EMC", "ENS.INTEG.SC.&TECHNO": "Sciences & technologie", "SCIENCES ET TECHNOLOGIE": "Sciences & technologie",
  "SCIENCES VIE & TERRE": "SVT", "SVT": "SVT", "PHYSIQUE-CHIMIE": "Physique-chimie", "TECHNOLOGIE": "Technologie", "VIE DE CLASSE": "Vie de classe",
  "ANGLAIS LV1": "Anglais LV1", "ESPAGNOL LV2": "Espagnol LV2", "ALLEMAND LV2": "Allemand LV2", "LATIN": "Latin", "SOUTIEN": "Soutien",
  "DEVOIRS FAITS": "Devoirs faits", "ACCOMPAGNEMT. PERSO.": "Accompagnement personnalisé",
};
const WORDS = { EXTERIEUR: "extérieur", ADMINISTRATIV: "administrative", EDT: "EDT", RDV: "RDV", COLLEGE: "Collège", LYCEE: "Lycée", ECOLE: "École", ANGLEE: "Anglée",
  GEOGRAPHIE: "géographie", MUSICALE: "musicale", EDUCATION: "Éducation", LV1: "LV1", LV2: "LV2", LV3: "LV3" };
const SMALL = new Set(["de", "du", "des", "la", "le", "les", "et", "à", "au", "aux", "en", "sur"]);
// Écriture « phrase » : première lettre en majuscule, accents remis sur les mots connus
const cap = (s, title) => {
  const raw = String(s || "").trim();
  if (!raw) return "";
  const known = SUBJECTS[NOACC(raw)];
  if (known) return known;
  const isUpper = raw === raw.toUpperCase();
  if (!isUpper) return raw.charAt(0).toUpperCase() + raw.slice(1);
  let i = 0;
  return raw.replace(/\s+/g, " ").split(/(\s|-|'|’)/).map((w) => {
    if (!w || /^(\s|-|'|’)$/.test(w)) return w;
    const k = NOACC(w), first = i++ === 0;
    if (WORDS[k]) return first ? WORDS[k].charAt(0).toUpperCase() + WORDS[k].slice(1) : WORDS[k];
    const lw = w.toLowerCase();
    if (!first && (SMALL.has(lw) || (!title && lw.length > 1))) return title && !SMALL.has(lw) ? lw.charAt(0).toUpperCase() + lw.slice(1) : lw;
    return lw.length === 1 && !first ? lw : lw.charAt(0).toUpperCase() + lw.slice(1);
  }).join("");
};
const safeUrl = (u) => (/^https?:\/\//i.test(String(u || "")) ? String(u) : "");
const safeColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(String(c || "")) ? c : "var(--pc-muted)");
const toDate = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v;
  const s = String(v);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T12:00:00") : new Date(s.replace(" ", "T"));
  return isNaN(d) ? null : d;
};
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

class PronoteCard extends HTMLElement {
  static getConfigElement() { return document.createElement("pronote-card-editor"); }
  static getStubConfig(hass) {
    const e = hass && Object.keys(hass.states).find((k) => /^sensor\.pronote_.+_class$/.test(k));
    return { entity: e || "" };
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._sig = "";
    this._tab = null;
    this._open = new Set();
  }

  setConfig(config) {
    if (!config) throw new Error("Configuration invalide");
    this._config = { ...DEFAULTS, ...config };
    this._sig = "";
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    const pre = this._prefix();
    const sig = pre ? Object.keys(hass.states).filter((k) => k.startsWith(pre)).map((k) => k + ":" + (hass.states[k].last_updated || hass.states[k].state)).join("|") : "";
    const s = sig + "#" + (this._isDark() ? "d" : "l") + "#" + new Date().getHours();
    if (s !== this._sig) { this._sig = s; this._render(); }
  }

  getCardSize() { return 8; }

  _prefix() {
    const e = String(this._config.entity || "");
    if (!e.startsWith("sensor.pronote_")) return "";
    for (const s of SUFFIXES.slice().sort((a, b) => b.length - a.length)) if (e.endsWith("_" + s)) return e.slice(0, -(s.length));
    return e.replace(/[^_]+$/, "");
  }

  _st(suffix) { const p = this._prefix(); return p && this._hass.states[p + suffix]; }
  _attr(suffix, key) { const s = this._st(suffix); return s && s.attributes ? s.attributes[key] : undefined; }
  _list(suffix, key) { const v = this._attr(suffix, key); return Array.isArray(v) ? v : []; }

  _isDark() {
    const t = this._config && this._config.theme;
    if (t === "dark") return true;
    if (t === "light") return false;
    const dm = this._hass && this._hass.themes && this._hass.themes.darkMode;
    if (typeof dm === "boolean") return dm;
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }

  _lang() { return (this._hass && this._hass.locale && this._hass.locale.language) || "fr"; }
  _fmtDay(d, opts) { return new Intl.DateTimeFormat(this._lang(), opts || { weekday: "long", day: "numeric", month: "long" }).format(d); }
  _relDay(d) {
    const now = new Date(); const a = new Date(dayKey(now) + "T12:00:00"), b = new Date(dayKey(d) + "T12:00:00");
    const n = Math.round((b - a) / 86400000);
    if (n === 0) return "Aujourd'hui";
    if (n === 1) return "Demain";
    if (n === -1) return "Hier";
    return cap(this._fmtDay(d, { weekday: "long", day: "numeric", month: "short" }));
  }
  _hm(d) { return d ? new Intl.DateTimeFormat(this._lang(), { hour: "2-digit", minute: "2-digit" }).format(d) : ""; }

  /* ---------- Onglets ---------- */
  _data() {
    const c = this._config;
    const now = new Date();
    // Emploi du temps : tous les jours connus (aujourd'hui, demain, jour suivant, période), regroupés par date
    const days = new Map(), seen = new Set();
    ["today_s_timetable", "tomorrow_s_timetable", "next_day_s_timetable", "period_s_timetable"].forEach((suf) => {
      this._list(suf, "lessons").forEach((l) => {
        const d = toDate(l.start_at); if (!d) return;
        const id = String(l.start_at) + "|" + l.lesson;
        if (seen.has(id)) return; seen.add(id);
        const k = dayKey(d); if (!days.has(k)) days.set(k, []); days.get(k).push(l);
      });
    });
    const dayKeys = [...days.keys()].sort();
    // Jour par défaut : aujourd'hui s'il reste des cours, sinon le prochain jour de cours
    const todayK = dayKey(now);
    const todayLeft = (days.get(todayK) || []).some((l) => { const e = toDate(l.end_at); return e && e > now; });
    const autoDay = todayLeft ? todayK : (dayKeys.find((k) => k > todayK) || dayKeys[dayKeys.length - 1] || todayK);
    const lessons = []; // compat
    const ttSuffix = "";
    const hwSeen = new Set();
    const hwAll = [...this._list("homework", "homework"), ...this._list("period_s_homework", "homework")].filter((h) => {
      const id = String(h.date) + "|" + h.subject + "|" + (h.description || h.short_description || "");
      if (hwSeen.has(id)) return false; hwSeen.add(id); return true;
    });
    const limit = new Date(now.getTime() + (Number(c.homework_days) || 14) * 86400000);
    const homework = hwAll.filter((h) => { const d = toDate(h.date); return !d || d <= limit; }).filter((h) => c.show_done_homework || !h.done);
    const evaluations = this._list("evaluations", "evaluations");
    const grades = this._list("grades", "grades");
    const averages = this._list("averages", "averages");
    const absences = this._list("absences", "absences");
    const delays = this._list("delays", "delays");
    const punishments = this._list("punishments", "punishments");
    const menus = this._list("menus", "menus");
    const infos = this._list("information_and_surveys", "information_and_surveys");
    return { ttSuffix, lessons, days, dayKeys, autoDay, homework, evaluations, grades, averages, absences, delays, punishments, menus, infos };
  }

  _tabs(D) {
    const c = this._config;
    const has = { edt: true, devoirs: true, evaluations: D.evaluations.length > 0, notes: D.grades.length + D.averages.length > 0,
      vie: D.absences.length + D.delays.length + D.punishments.length > 0, cantine: D.menus.length > 0 };
    return TABS.filter((t) => !c.hide_empty_tabs || has[t.id]);
  }

  /* ---------- Rendu des onglets ---------- */
  _renderEdt(D) {
    const now = new Date();
    if (!this._day || !D.days.has(this._day)) this._day = D.autoDay;
    const strip = D.dayKeys.length ? `<div class="days">${D.dayKeys.map((k) => {
      const d = new Date(k + "T12:00:00"); const nb = D.days.get(k).filter((l) => !l.canceled).length;
      const test = D.days.get(k).some((l) => l.test);
      return `<button class="day ${k === this._day ? "on" : ""} ${k < dayKey(now) ? "past" : ""}" data-day="${k}"><small>${esc(this._fmtDay(d, { weekday: "short" }).replace(".", ""))}</small><b>${d.getDate()}</b>${test ? `<i class="dt warn"></i>` : nb ? `<i class="dt"></i>` : ""}</button>`;
    }).join("")}</div>` : "";
    const L = (D.days.get(this._day) || []).slice().sort((a, b) => (toDate(a.start_at) || 0) - (toDate(b.start_at) || 0));
    if (!L.length) return strip + `<div class="empty"><ha-icon icon="mdi:beach"></ha-icon>Pas de cours prévu</div>`;
    const first = toDate(L[0].start_at);
    // Pause déjeuner : plus grand trou entre la fin du matin et le début de l'après-midi
    let lunchS = null, lunchE = null;
    const am = L.filter((l) => l.is_morning !== false && toDate(l.start_at).getHours() < 12), pm = L.filter((l) => toDate(l.start_at).getHours() >= 12);
    if (am.length && pm.length) { lunchS = toDate(am[am.length - 1].end_at); lunchE = toDate(pm[0].start_at); if (lunchE - lunchS < 30 * 60000) lunchS = lunchE = null; }
    const endDay = toDate(L[L.length - 1].end_at);
    const canceled = L.filter((l) => l.canceled).length;
    let rows = "", lunchDone = false;
    L.forEach((l) => {
      const s = toDate(l.start_at), e = toDate(l.end_at);
      if (!lunchDone && lunchS && lunchE && s && s >= lunchE) {
        rows += `<div class="lunch"><span class="tm">${this._hm(lunchS)}</span><ha-icon icon="mdi:silverware-fork-knife"></ha-icon>Pause déjeuner<span class="lt">jusqu'à ${this._hm(lunchE)}</span></div>`;
        lunchDone = true;
      }
      const ended = e && e < now, current = s && e && s <= now && now < e;
      const st = l.canceled ? "Annulé" : l.status ? cap(l.status) : "";
      const rooms = (l.classrooms && l.classrooms.length ? l.classrooms : [l.classroom]).filter(Boolean).map((r) => String(r).replace(/\bSALLE\b/g, "Salle")).join(", ");
      const teachers = (l.teacher_names && l.teacher_names.length ? l.teacher_names : [l.teacher_name]).filter(Boolean).join(", ");
      const tags = [l.test ? `<span class="tag warn">Contrôle</span>` : "", l.outing ? `<span class="tag">Sortie</span>` : "", l.detention ? `<span class="tag bad">Retenue</span>` : "",
        l.exempted ? `<span class="tag">Dispensé</span>` : "", st ? `<span class="tag ${l.canceled ? "bad" : "warn"}">${esc(st)}</span>` : "",
        current ? `<span class="tag now">En cours</span>` : ""].join("");
      rows += `<div class="lesson ${ended ? "ended" : ""} ${current ? "current" : ""} ${l.canceled ? "canceled" : ""}" style="--lc:${safeColor(l.background_color)}">
        <div class="tm"><b>${esc(l.start_time || this._hm(s))}</b><small>${esc(l.end_time || this._hm(e))}</small></div>
        <div class="bar"></div>
        <div class="li"><div class="ln"><b>${esc(cap(l.lesson))}</b>${tags}</div>
          <small>${[rooms && `<ha-icon icon="mdi:door"></ha-icon>${esc(rooms)}`, teachers && `<ha-icon icon="mdi:account-tie"></ha-icon>${esc(teachers)}`].filter(Boolean).join(" ")}</small>
          ${l.memo ? `<small class="memo">${esc(l.memo)}</small>` : ""}</div></div>`;
    });
    const head = `<div class="sub"><b>${esc(this._relDay(first))}</b><span>${L.length} cours · ${this._hm(first)} – ${this._hm(endDay)}${canceled ? ` · <span class="bad">${canceled} annulé${canceled > 1 ? "s" : ""}</span>` : ""}</span></div>`;
    return strip + head + `<div class="list">${rows}</div>`;
  }

  _renderDevoirs(D) {
    if (!D.homework.length) return `<div class="empty"><ha-icon icon="mdi:check-all"></ha-icon>Aucun devoir à venir</div>`;
    const all = new Map();
    D.homework.slice().sort((a, b) => (toDate(a.date) || 0) - (toDate(b.date) || 0)).forEach((h) => {
      const d = toDate(h.date); const k = d ? dayKey(d) : "?";
      if (!all.has(k)) all.set(k, { d, items: [] });
      all.get(k).items.push(h);
    });
    if (this._hwDay && this._hwDay !== "all" && !all.has(this._hwDay)) this._hwDay = "all";
    const sel = this._hwDay || "all";
    const nToDo = (items) => items.filter((h) => !h.done).length;
    // Bande de jours : « Tous » puis chaque jour de remise, avec le nombre de devoirs à faire
    const strip = `<div class="days"><button class="day all ${sel === "all" ? "on" : ""}" data-hwday="all"><small>Tous</small><b>${nToDo(D.homework)}</b><i class="dt"></i></button>${[...all.entries()].map(([k, g]) => {
      const n = nToDo(g.items), test = g.items.some((h) => /contr[oô]le|[ée]valu|interro|dict[ée]e/i.test((h.description || "") + " " + (h.short_description || "")));
      return g.d ? `<button class="day ${k === sel ? "on" : ""} ${n ? "" : "past"}" data-hwday="${k}"><small>${esc(this._fmtDay(g.d, { weekday: "short" }).replace(".", ""))}</small><b>${g.d.getDate()}</b>${n ? `<span class="cnt ${test ? "warn" : ""}">${n}</span>` : `<ha-icon class="okc" icon="mdi:check"></ha-icon>`}</button>` : "";
    }).join("")}</div>`;
    const groups = sel === "all" ? all : new Map([[sel, all.get(sel)]]);
    let html = strip;
    groups.forEach((g, k) => {
      const todo = g.items.filter((h) => !h.done).length;
      html += `<div class="sub"><b>Pour ${esc(g.d ? this._relDay(g.d).toLowerCase() : "—")}</b><span>${todo ? `${todo} à faire` : "Tout est fait ✓"}</span></div>`;
      g.items.forEach((h, i) => {
        const id = k + "-" + i;
        const open = this._open.has(id);
        const desc = String(h.description || h.short_description || "").trim();
        const long = desc.length > 110 || (h.files && h.files.length);
        const txt = open || !long ? desc : (h.short_description || desc).slice(0, 110) + (desc.length > 110 ? "…" : "");
        const files = open && h.files && h.files.length ? `<div class="files">${h.files.map((f) => { const u = safeUrl(f.url); return u ? `<a href="${esc(u)}" target="_blank" rel="noopener"><ha-icon icon="mdi:paperclip"></ha-icon>${esc(f.name || "Pièce jointe")}</a>` : ""; }).join("")}</div>` : "";
        html += `<div class="hw ${h.done ? "done" : ""}" style="--lc:${safeColor(h.background_color)}" ${long ? `data-open="${esc(id)}"` : ""}>
          <ha-icon class="chk" icon="${h.done ? "mdi:check-circle" : "mdi:circle-outline"}"></ha-icon>
          <div class="li"><div class="ln"><span class="dot"></span><b>${esc(cap(h.subject))}</b>${h.files && h.files.length ? `<span class="tag"><ha-icon icon="mdi:paperclip"></ha-icon>${h.files.length}</span>` : ""}</div>
            <div class="txt">${esc(txt).replace(/\n/g, "<br>")}</div>${files}
            ${long ? `<small class="more">${open ? "Réduire" : "Voir tout"}</small>` : ""}</div></div>`;
      });
    });
    return html;
  }

  _renderEvaluations(D) {
    const c = this._config;
    const evs = D.evaluations.slice().sort((a, b) => (toDate(b.date) || 0) - (toDate(a.date) || 0));
    if (!evs.length) return `<div class="empty"><ha-icon icon="mdi:star-outline"></ha-icon>Aucune évaluation</div>`;
    // Bilan de la période par niveau
    const count = { 4: 0, 3: 0, 2: 0, 1: 0 };
    evs.forEach((e) => (e.acquisitions || []).forEach((a) => { const r = levelOf(a).rank; if (count[r] !== undefined) count[r]++; }));
    const total = count[4] + count[3] + count[2] + count[1];
    const seg = [[4, "#1f9d55", "Très bonne maîtrise"], [3, "#6cc04a", "Maîtrise satisfaisante"], [2, "#f0a020", "Maîtrise fragile"], [1, "#e0524f", "Maîtrise insuffisante"]];
    const bilan = total ? `<div class="bilan"><div class="bbar">${seg.map(([r, col]) => count[r] ? `<span style="flex:${count[r]};background:${col}"></span>` : "").join("")}</div>
      <div class="leg">${seg.map(([r, col, l]) => `<span><i style="background:${col}"></i>${l} <b>${count[r]}</b></span>`).join("")}</div></div>` : "";
    const rows = evs.slice(0, Number(c.max_evaluations) || 12).map((e) => {
      const d = toDate(e.date);
      const acq = (e.acquisitions || []).map((a) => {
        const lv = levelOf(a); const nm = a.name || a.domain || a.level || "";
        return `<span class="acq" title="${esc(nm)} — ${esc(a.level)}"><i style="background:${lv.color}">${esc(a.abbreviation || "•")}</i><span>${esc(nm)}</span></span>`;
      }).join("");
      return `<div class="ev"><div class="ln"><b>${esc(cap(e.subject))}</b><small>${d ? esc(this._fmtDay(d, { day: "numeric", month: "short" })) : ""}</small></div>
        <div class="evn">${esc(e.name || "")}</div><div class="acqs">${acq}</div></div>`;
    }).join("");
    return bilan + `<div class="list">${rows}</div>`;
  }

  _renderNotes(D) {
    const ov = this._st("overall_average");
    let html = "";
    if (ov && ov.state && ov.state !== "unknown" && String(ov.state).trim()) html += `<div class="sub"><b>Moyenne générale</b><span class="big">${esc(ov.state)}</span></div>`;
    if (D.averages.length) {
      html += `<div class="list">` + D.averages.map((a) => `<div class="ev row"><b>${esc(cap(a.subject))}</b><span class="note">${esc(a.average ?? "—")}</span>${a.class ? `<small>classe ${esc(a.class)}</small>` : ""}</div>`).join("") + `</div>`;
    }
    if (D.grades.length) {
      html += `<div class="sub"><b>Dernières notes</b></div><div class="list">` + D.grades.slice(0, 12).map((g) => {
        const d = toDate(g.date);
        return `<div class="ev row"><div><b>${esc(cap(g.subject))}</b><small> ${esc(g.comment || "")}</small><br><small>${d ? esc(this._fmtDay(d, { day: "numeric", month: "short" })) : ""}${g.class_average ? ` · classe ${esc(g.class_average)}` : ""}</small></div>
          <span class="note">${esc(g.grade ?? "—")}<small>/${esc(g.out_of ?? 20)}</small></span></div>`;
      }).join("") + `</div>`;
    }
    return html || `<div class="empty"><ha-icon icon="mdi:numeric-off"></ha-icon>Pas encore de notes</div>`;
  }

  _renderVie(D) {
    const fd = (v) => { const d = toDate(v); return d ? this._fmtDay(d, { weekday: "short", day: "numeric", month: "short" }) : ""; };
    const stat = (icon, n, label) => `<div class="stat"><ha-icon icon="${icon}"></ha-icon><b>${n}</b><small>${label}</small></div>`;
    let html = `<div class="stats">${stat("mdi:account-off-outline", D.absences.length, "absence" + (D.absences.length > 1 ? "s" : ""))}${stat("mdi:clock-alert-outline", D.delays.length, "retard" + (D.delays.length > 1 ? "s" : ""))}${stat("mdi:alert-octagon-outline", D.punishments.length, "punition" + (D.punishments.length > 1 ? "s" : ""))}</div>`;
    if (D.punishments.length) {
      html += `<div class="sub"><b>Punitions</b></div><div class="list">` + D.punishments.map((p) => {
        const sch = (p.schedule || [])[0];
        return `<div class="ev bad"><div class="ln"><b>${esc(p.nature || "Punition")}</b><small>${esc(fd(p.date))}</small></div>
          <div class="evn">${esc((p.reasons || []).join(", "))}${p.giver ? ` · ${esc(p.giver)}` : ""}</div>
          ${p.circumstances ? `<small class="txt">${esc(p.circumstances)}</small>` : ""}
          ${sch && sch.start ? (() => { const d = toDate(sch.start), fut = d && d >= new Date(new Date().toDateString()); const h = d && String(sch.start).length > 10 ? " à " + esc(this._hm(d)) : "";
            return `<small class="tag ${fut ? "warn" : "ok"}">${fut ? "Prévue" : "Faite"} ${esc(fd(sch.start))}${h}</small>`; })() : ""}</div>`;
      }).join("") + `</div>`;
    }
    if (D.absences.length) {
      const ab = this._open.has("abs") ? D.absences : D.absences.slice(0, 3);
      html += `<div class="sub"><b>Absences</b>${D.absences.length > 3 ? `<button class="more" data-open="abs">${this._open.has("abs") ? "Réduire" : `Voir les ${D.absences.length}`}</button>` : ""}</div><div class="list">` + ab.map((a) => `<div class="ev row"><div><b>${esc(fd(a.from))}</b><br><small>${esc(cap(a.reason || ""))}</small></div>
        <span class="r"><span class="tag ${a.justified ? "ok" : "bad"}">${a.justified ? "Justifiée" : "Non justifiée"}</span><small>${esc(a.hours || "")}</small></span></div>`).join("") + `</div>`;
    }
    if (D.delays.length) {
      const de = this._open.has("del") ? D.delays : D.delays.slice(0, 3);
      html += `<div class="sub"><b>Retards</b>${D.delays.length > 3 ? `<button class="more" data-open="del">${this._open.has("del") ? "Réduire" : `Voir les ${D.delays.length}`}</button>` : ""}</div><div class="list">` + de.map((r) => `<div class="ev row"><div><b>${esc(fd(r.date))}</b><br><small>${esc(cap(r.reasons || r.justification || ""))}</small></div>
        <span class="r"><span class="tag ${r.justified ? "ok" : "bad"}">${r.justified ? "Justifié" : "Non justifié"}</span><small>${esc(r.minutes)} min</small></span></div>`).join("") + `</div>`;
    }
    return html;
  }

  _renderCantine(D) {
    if (!D.menus.length) return `<div class="empty"><ha-icon icon="mdi:food-off-outline"></ha-icon>Pas de menu publié</div>`;
    return D.menus.slice(0, 5).map((m) => {
      const d = toDate(m.date);
      const part = (k, l) => { const v = m[k]; const arr = Array.isArray(v) ? v.map((x) => (x && x.name) || x).filter(Boolean) : v ? [v] : []; return arr.length ? `<div class="mrow"><small>${l}</small><span>${esc(arr.join(", "))}</span></div>` : ""; };
      return `<div class="sub"><b>${esc(d ? this._relDay(d) : m.name || "Menu")}</b></div><div class="ev">${part("first_meal", "Entrée")}${part("main_meal", "Plat")}${part("side_meal", "Accompagnement")}${part("cheese", "Fromage")}${part("dessert", "Dessert")}</div>`;
    }).join("");
  }

  _render() {
    const c = this._config;
    if (!c || !this._hass) return;
    const dark = this._isDark();
    const pre = this._prefix();
    const cls = this._st("class");
    if (!pre || !cls) {
      this.shadowRoot.innerHTML = `<ha-card style="padding:16px">Choisissez un capteur Pronote (ex. <code>sensor.pronote_nom_prenom_class</code>) dans l'éditeur de la carte.</ha-card>`;
      return;
    }
    const D = this._data();
    const tabs = this._tabs(D);
    if (!this._tab || !tabs.some((t) => t.id === this._tab)) {
      const want = c.default_tab && c.default_tab !== "auto" ? c.default_tab : null;
      this._tab = want && tabs.some((t) => t.id === want) ? want : (new Date().getHours() >= 16 ? "devoirs" : "edt");
      if (!tabs.some((t) => t.id === this._tab)) this._tab = tabs[0].id;
    }
    const a = cls.attributes || {};
    const name = c.name || a.nickname || cap(String(a.full_name || "").split(" ").slice(-1)[0]) || "Pronote";
    const period = this._st("current_period");
    const todo = D.homework.filter((h) => !h.done).length;
    const nextTest = (D.days.get(D.autoDay) || []).some((l) => l.test);
    const unread = Number(this._attr("information_and_surveys", "unread_count")) || 0;
    const imgOk = c.image && !/^\s*(javascript|vbscript|data:text)/i.test(String(c.image));
    const chips = [
      todo ? `<span class="chip ${todo ? "acc" : ""}"><ha-icon icon="mdi:notebook-edit-outline"></ha-icon>${todo} devoir${todo > 1 ? "s" : ""}</span>` : "",
      nextTest ? `<span class="chip warn"><ha-icon icon="mdi:alert-circle-outline"></ha-icon>Contrôle</span>` : "",
      unread ? `<span class="chip"><ha-icon icon="mdi:email-outline"></ha-icon>${unread} info${unread > 1 ? "s" : ""}</span>` : "",
    ].join("");
    const body = { edt: () => this._renderEdt(D), devoirs: () => this._renderDevoirs(D), evaluations: () => this._renderEvaluations(D),
      notes: () => this._renderNotes(D), vie: () => this._renderVie(D), cantine: () => this._renderCantine(D) }[this._tab]();
    const badge = (t) => {
      const n = t.id === "devoirs" ? todo : t.id === "vie" ? D.punishments.filter((p) => (p.schedule || []).some((s) => toDate(s.start) >= new Date())).length : 0;
      return n ? `<em>${n}</em>` : "";
    };

    this.shadowRoot.innerHTML = `
      <style>
        * { box-sizing:border-box; }
        ha-card.dark { --pc-text:#f4f6fb; --pc-muted:#a9afc0; --pc-bg:var(--g-bg-x,linear-gradient(160deg,#1b1e32 0%,#1f2440 55%,#1a2a3a 100%));
          --pc-border:rgba(255,255,255,.14); --pc-shadow:0 .6em 2em rgba(0,0,0,.35); --pc-glass:rgba(255,255,255,.07); --pc-glass-b:rgba(255,255,255,.13);
          --pc-fill:rgba(255,255,255,.09); --pc-acc:var(--acc-ui-x,#5fb4ff); --pc-ok:#3ddc84; --pc-warn:#ffb86b; --pc-bad:#ff6b6b; }
        ha-card.light { --pc-text:#1c2030; --pc-muted:#5d6477; --pc-bg:var(--g-bg-x,linear-gradient(160deg,#f8f9fd 0%,#eef2fb 55%,#eaf3fb 100%));
          --pc-border:rgba(20,24,40,.12); --pc-shadow:0 .4em 1.4em rgba(20,24,40,.12); --pc-glass:rgba(255,255,255,.72); --pc-glass-b:rgba(20,24,40,.1);
          --pc-fill:rgba(20,24,40,.06); --pc-acc:var(--acc-ui-x,#1f7fd1); --pc-ok:#1a9d55; --pc-warn:#c77a14; --pc-bad:#d23c3c; }
        ha-card { display:flex; flex-direction:column; gap:12px; padding:16px; color:var(--pc-text); border-radius:24px; border:1px solid var(--pc-border);
          background:var(--pc-bg); box-shadow:var(--pc-shadow); overflow:hidden; }
        ha-icon { --mdc-icon-size:1.1em; flex:none; }
        button { font:inherit; color:inherit; cursor:pointer; border:0; background:none; padding:0; -webkit-tap-highlight-color:transparent; }
        .head { display:flex; align-items:center; gap:12px; }
        .av { width:48px; height:48px; border-radius:50%; flex:none; display:grid; place-items:center; overflow:hidden; background:var(--pc-fill); border:2px solid var(--pc-acc); color:var(--pc-acc); }
        .av img { width:100%; height:100%; object-fit:cover; } .av ha-icon { --mdc-icon-size:26px; }
        .hn { flex:1; min-width:0; } .hn b { font-size:1.15em; font-weight:700; display:block; }
        .hn small { color:var(--pc-muted); font-size:.8em; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .chips { display:flex; flex-wrap:wrap; gap:6px; justify-content:flex-end; }
        .chip { display:inline-flex; align-items:center; gap:4px; padding:.3em .7em; border-radius:2em; font-size:.78em; font-weight:650; background:var(--pc-glass); border:1px solid var(--pc-glass-b); }
        .chip.acc { color:var(--pc-acc); border-color:color-mix(in srgb,var(--pc-acc) 45%,transparent); } .chip.warn { color:var(--pc-warn); border-color:color-mix(in srgb,var(--pc-warn) 45%,transparent); }
        .tabs { display:flex; gap:4px; padding:4px; border-radius:14px; background:var(--pc-fill); overflow-x:auto; scrollbar-width:none; }
        .tabs::-webkit-scrollbar { display:none; }
        .tab { flex:1 0 auto; display:flex; align-items:center; justify-content:center; gap:5px; padding:.5em .7em; border-radius:10px; font-size:.82em; font-weight:600; color:var(--pc-muted); position:relative; white-space:nowrap; }
        .tab.on { background:var(--pc-glass); color:var(--pc-text); box-shadow:0 1px 4px rgba(0,0,0,.12); border:1px solid var(--pc-glass-b); }
        .tab.on ha-icon { color:var(--pc-acc); }
        .tab em { font-style:normal; font-size:.75em; min-width:1.5em; padding:0 .35em; border-radius:1em; background:var(--pc-acc); color:#fff; line-height:1.5em; text-align:center; }
        .tab .sh { display:none; }
        @container (max-width: 430px) { .tab .lg { display:none; } .tab .sh { display:inline; } }
        .body { display:flex; flex-direction:column; gap:8px; container-type:inline-size; }
        .wrapc { container-type:inline-size; display:flex; flex-direction:column; gap:12px; }
        .sub { display:flex; justify-content:space-between; align-items:baseline; gap:8px; margin-top:4px; font-size:.9em; }
        .sub span { color:var(--pc-muted); font-size:.85em; } .sub .big { font-size:1.3em; font-weight:700; color:var(--pc-acc); }
        .days { display:flex; gap:6px; overflow-x:auto; scrollbar-width:none; padding:2px 0; } .days::-webkit-scrollbar { display:none; }
        .day { flex:1 0 3.1em; display:flex; flex-direction:column; align-items:center; gap:1px; padding:.35em .2em .45em; border-radius:12px; background:var(--pc-glass); border:1px solid var(--pc-glass-b); position:relative; }
        .day small { font-size:.7em; color:var(--pc-muted); text-transform:capitalize; } .day b { font-size:1em; }
        .day.on { border-color:var(--pc-acc); background:color-mix(in srgb,var(--pc-acc) 18%,transparent); } .day.on small, .day.on b { color:var(--pc-acc); }
        .day.past { opacity:.5; } .day.all b { color:var(--pc-acc); }
        .day .cnt { font-size:.62em; font-weight:800; min-width:1.6em; line-height:1.5em; border-radius:1em; text-align:center; background:var(--pc-acc); color:#fff; }
        .day .cnt.warn { background:var(--pc-warn); } .day .okc { --mdc-icon-size:.9em; color:var(--pc-ok); } .dt { width:5px; height:5px; border-radius:50%; background:var(--pc-muted); display:block; } .dt.warn { background:var(--pc-warn); }
        .list { display:flex; flex-direction:column; gap:6px; }
        .lesson, .hw, .ev, .lunch { border-radius:14px; background:var(--pc-glass); border:1px solid var(--pc-glass-b); -webkit-backdrop-filter:blur(16px); backdrop-filter:blur(16px); }
        .lesson { display:flex; align-items:stretch; gap:10px; padding:.55em .7em; }
        .lesson .tm, .lunch .tm { width:3.2em; flex:none; display:flex; flex-direction:column; justify-content:center; font-variant-numeric:tabular-nums; }
        .lesson .tm b { font-size:.9em; } .lesson .tm small { color:var(--pc-muted); font-size:.75em; }
        .bar { width:4px; border-radius:4px; background:var(--lc); flex:none; box-shadow:0 0 0 1px var(--pc-glass-b); }
        .li { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
        .ln { display:flex; align-items:center; gap:6px; flex-wrap:wrap; } .ln b { font-size:.92em; } .ln small { margin-left:auto; color:var(--pc-muted); font-size:.75em; }
        .li > small { color:var(--pc-muted); font-size:.76em; display:flex; align-items:center; gap:3px; flex-wrap:wrap; } .li > small ha-icon { --mdc-icon-size:1em; margin-left:4px; } .li > small ha-icon:first-child { margin-left:0; }
        .memo { font-style:italic; }
        .lesson.ended { opacity:.45; } .lesson.canceled .ln b { text-decoration:line-through; }
        .lesson.current { border-color:var(--pc-acc); box-shadow:inset 0 0 1.6em color-mix(in srgb,var(--pc-acc) 18%,transparent); }
        .lunch { display:flex; align-items:center; gap:8px; padding:.45em .7em; font-size:.82em; color:var(--pc-muted); background:transparent; border-style:dashed; }
        .lunch .lt { margin-left:auto; font-size:.9em; }
        .tag { display:inline-flex; align-items:center; gap:2px; font-size:.7em; font-weight:700; padding:.15em .55em; border-radius:1em; background:var(--pc-fill); color:var(--pc-muted); width:fit-content; }
        .tag.warn { color:var(--pc-warn); background:color-mix(in srgb,var(--pc-warn) 16%,transparent); } .tag.bad { color:var(--pc-bad); background:color-mix(in srgb,var(--pc-bad) 14%,transparent); }
        .tag.ok { color:var(--pc-ok); background:color-mix(in srgb,var(--pc-ok) 14%,transparent); } .tag.now { color:#fff; background:var(--pc-acc); }
        .bad { color:var(--pc-bad); }
        .hw { display:flex; gap:10px; padding:.6em .75em; } .hw[data-open] { cursor:pointer; }
        .hw .chk { color:var(--pc-muted); margin-top:2px; --mdc-icon-size:1.25em; } .hw.done .chk { color:var(--pc-ok); } .hw.done .txt, .hw.done .ln b { opacity:.55; } .hw.done .ln b { text-decoration:line-through; }
        .dot { width:8px; height:8px; border-radius:50%; background:var(--lc); flex:none; }
        .txt { font-size:.84em; line-height:1.35; } .more { color:var(--pc-acc); font-size:.75em; font-weight:650; } .sub .more { font-size:.8em; }
        .files { display:flex; flex-direction:column; gap:3px; margin-top:4px; } .files a { color:var(--pc-acc); font-size:.8em; display:flex; gap:4px; align-items:center; text-decoration:none; word-break:break-all; }
        .ev { padding:.6em .75em; display:flex; flex-direction:column; gap:4px; } .ev.row { flex-direction:row; align-items:center; justify-content:space-between; gap:8px; }
        .ev.row small { color:var(--pc-muted); font-size:.76em; } .ev.bad { border-color:color-mix(in srgb,var(--pc-bad) 45%,transparent); } .ev.bad .ln b { color:var(--pc-bad); }
        .ev .r { display:flex; flex-direction:column; align-items:flex-end; gap:2px; }
        .evn { font-size:.84em; } .ev > small.txt { color:var(--pc-muted); font-size:.78em; }
        .acqs { display:flex; flex-direction:column; gap:3px; }
        .acq { display:flex; align-items:center; gap:6px; font-size:.78em; color:var(--pc-muted); }
        .acq i { font-style:normal; font-weight:800; color:#fff; min-width:2em; text-align:center; border-radius:6px; padding:.1em .3em; font-size:.92em; flex:none; }
        .acq span { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .bilan { display:flex; flex-direction:column; gap:6px; padding:.6em .75em; border-radius:14px; background:var(--pc-glass); border:1px solid var(--pc-glass-b); }
        .bbar { display:flex; height:10px; border-radius:6px; overflow:hidden; gap:2px; } .bbar span { display:block; }
        .leg { display:flex; flex-wrap:wrap; gap:4px 12px; font-size:.74em; color:var(--pc-muted); } .leg i { display:inline-block; width:8px; height:8px; border-radius:2px; margin-right:4px; } .leg b { color:var(--pc-text); }
        .note { font-size:1.25em; font-weight:800; color:var(--pc-acc); white-space:nowrap; } .note small { font-size:.6em; color:var(--pc-muted); font-weight:600; }
        .stats { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; }
        .stat { display:flex; flex-direction:column; align-items:center; gap:2px; padding:.6em; border-radius:14px; background:var(--pc-glass); border:1px solid var(--pc-glass-b); }
        .stat ha-icon { color:var(--pc-muted); } .stat b { font-size:1.3em; } .stat small { color:var(--pc-muted); font-size:.75em; }
        .mrow { display:flex; gap:8px; font-size:.84em; } .mrow small { width:7.5em; flex:none; color:var(--pc-muted); }
        .empty { display:flex; flex-direction:column; align-items:center; gap:6px; padding:1.4em; color:var(--pc-muted); font-size:.9em; } .empty ha-icon { --mdc-icon-size:2em; }
      </style>
      <ha-card class="${dark ? "dark" : "light"}" style="${gvStyle(c, dark)}">
        <div class="wrapc">
          <div class="head">
            <div class="av">${imgOk ? `<img src="${esc(c.image)}" alt="">` : `<ha-icon icon="mdi:school-outline"></ha-icon>`}</div>
            <div class="hn"><b>${esc(name)}</b><small>${esc(a.class_name || cls.state || "")} · ${esc(cap(a.establishment || "", true))}${period ? ` · ${esc(period.state)}` : ""}</small></div>
            <div class="chips">${chips}</div>
          </div>
          <div class="tabs">${tabs.map((t) => `<button class="tab ${t.id === this._tab ? "on" : ""}" data-tab="${t.id}"><ha-icon icon="${t.icon}"></ha-icon><span class="lg">${t.label}</span><span class="sh">${t.short}</span>${badge(t)}</button>`).join("")}</div>
          <div class="body">${body}</div>
        </div>
      </ha-card>`;

    const root = this.shadowRoot;
    root.querySelectorAll("[data-hwday]").forEach((b) => b.addEventListener("click", () => { this._hwDay = b.dataset.hwday; this._render(); }));
    root.querySelectorAll("[data-day]").forEach((b) => b.addEventListener("click", () => { this._day = b.dataset.day; this._render(); }));
    root.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { this._tab = b.dataset.tab; this._render(); }));
    root.querySelectorAll("[data-open]").forEach((el) => el.addEventListener("click", (ev) => {
      if (ev.target.closest("a")) return;
      const id = el.dataset.open; this._open.has(id) ? this._open.delete(id) : this._open.add(id); this._render();
    }));
  }
}

/* ---------- Éditeur visuel ---------- */
const LABELS = { ...GV_LABELS,
  entity: "Capteur Pronote de l'enfant (n'importe lequel, ex. …_class)", name: "Nom affiché (facultatif)", image: "Photo / avatar (ex. /local/image/Logan.jpg)",
  default_tab: "Onglet à l'ouverture", hide_empty_tabs: "Masquer les onglets vides", show_done_homework: "Afficher les devoirs faits",
  homework_days: "Devoirs affichés sur (jours)", max_evaluations: "Nombre d'évaluations affichées", theme: "Thème",
};

class PronoteCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...DEFAULTS, ...config };
    if (!this._form) this._build(); else this._form.data = this._config;
  }
  set hass(hass) { this._hass = hass; if (this._form) this._form.hass = hass; }
  _build() {
    this._form = document.createElement("ha-form");
    this._form.hass = this._hass;
    this._form.data = this._config;
    this._form.computeLabel = (s) => LABELS[s.name] || s.name;
    this._form.schema = [
      { name: "entity", selector: { entity: { domain: "sensor", integration: "pronote" } } },
      { type: "grid", name: "", schema: [{ name: "name", selector: { text: {} } }, { name: "image", selector: { text: {} } }] },
      { name: "default_tab", selector: { select: { mode: "dropdown", options: [{ value: "auto", label: "Automatique (cours le matin, devoirs après 16 h)" }, ...TABS.map((t) => ({ value: t.id, label: t.label }))] } } },
      { type: "grid", name: "", schema: [{ name: "hide_empty_tabs", selector: { boolean: {} } }, { name: "show_done_homework", selector: { boolean: {} } }] },
      { type: "grid", name: "", schema: [{ name: "homework_days", selector: { number: { min: 1, max: 60, mode: "box" } } }, { name: "max_evaluations", selector: { number: { min: 1, max: 50, mode: "box" } } }] },
      { name: "theme", selector: { select: { mode: "dropdown", options: [{ value: "auto", label: "Automatique (thème de Home Assistant)" }, { value: "light", label: "Clair" }, { value: "dark", label: "Sombre" }] } } },
      ...GV_FIELDS,
    ];
    this._form.addEventListener("value-changed", (ev) => {
      this._config = { ...this._config, ...ev.detail.value };
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
    });
    this.appendChild(this._form);
  }
}

customElements.define("pronote-card", PronoteCard);
customElements.define("pronote-card-editor", PronoteCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "pronote-card",
  name: "Pronote Card (FR)",
  description: "Pronote en une carte : emploi du temps, devoirs, compétences, notes, vie scolaire et cantine, en onglets.",
  preview: true,
});

console.info(
  `%c PRONOTE-CARD %c v${CARD_VERSION} `,
  "color:#fff;background:#1f7fd1;font-weight:700;border-radius:3px 0 0 3px;padding:2px 4px",
  "color:#1f7fd1;background:#fff;font-weight:700;border-radius:0 3px 3px 0;padding:2px 4px"
);
}
