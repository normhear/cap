// Tests de Cap, sans navigateur.
// macOS (rien à installer) : depuis le dossier cap/ →  osascript -l JavaScript tests/run.js
// Avec Node, si un jour il est installé :                node tests/run.js
//
// Les tests ne citent aucun contenu précis : ils lisent les jours et les listes dans le contenu actif.
// Ils tournent sur le contenu d'exemple, puis sur perso.json s'il est présent (il ne l'est pas sur GitHub).

var isNode = typeof require === 'function' && typeof process !== 'undefined';

function readText(name, optional) {
  if (isNode) {
    var fs = require('fs'), path = require('path').join(__dirname, '..', name);
    if (!fs.existsSync(path)) { if (optional) return null; throw new Error(name + ' introuvable'); }
    return fs.readFileSync(path, 'utf8');
  }
  ObjC.import('Foundation');
  var cwd = $.NSFileManager.defaultManager.currentDirectoryPath.js;
  var txt = $.NSString.stringWithContentsOfFileEncodingError(cwd + '/' + name, $.NSUTF8StringEncoding, null);
  if (!txt || !txt.js) {
    if (optional) return null;
    throw new Error(name + ' introuvable : lance les tests depuis le dossier cap/');
  }
  return txt.js;
}

function section(html, name) {
  var start = html.indexOf('/*' + name + '-START*/'), end = html.indexOf('/*' + name + '-END*/');
  if (start < 0 || end < 0) throw new Error('Marqueurs ' + name + ' introuvables dans index.html');
  return html.slice(start, end);
}

var SRC = readText('index.html');
var Cap = (0, eval)(section(SRC, 'CORE') + '\n' + section(SRC, 'VIEWS') + '\n;Cap');
var PERSO_TEXT = readText('perso.json', true);

var passed = 0, failed = [], prefix = '';

function test(name, fn) {
  try { fn(); passed++; } catch (e) { failed.push(prefix + name + ' → ' + e.message); }
}
function ok(cond, msg) { if (!cond) throw new Error(msg || 'condition fausse'); }
function eq(a, b, msg) {
  var ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error((msg || 'différent') + ' : ' + ja + ' ≠ ' + jb);
}
function D(s) { return Cap.parseDate(s); }
var esc = Cap.views.esc;

// État de départ avec des réglages fixes, pour que les dates des tests ne dépendent pas du contenu.
function base() {
  var s = Cap.defaults();
  s.settings.lever = '07:00'; s.settings.leverMax = '10:00'; s.settings.fermeture = '22:00';
  s.settings.finStage = '2026-10-14'; s.settings.rendu = '2026-12-01';
  return s;
}
function E(k, i) { return Cap.DAYS[k].essentiels[i].id; }
function B(k, i) { return Cap.DAYS[k].bonus[i].id; }

// Vérifie qu'un état a exactement la forme attendue.
function assertValidState(s) {
  var d = Cap.defaults();
  eq(Object.keys(s).sort(), Object.keys(d).sort(), 'clés racine');
  eq(Object.keys(s.settings).sort(), Object.keys(d.settings).sort(), 'clés réglages');
  ok(/^\d{2}:\d{2}$/.test(s.settings.lever), 'lever');
  ok(/^\d{2}:\d{2}$/.test(s.settings.fermeture), 'fermeture');
  ok(Cap.parseDate(s.settings.finStage) && Cap.parseDate(s.settings.rendu), 'dates');
  Cap.DAY_KEYS.forEach(function (k) {
    var day = s.week[k];
    ok(day && typeof day === 'object', 'jour ' + k);
    ok(['idle', 'running', 'done'].indexOf(day.amorce) >= 0, 'amorce ' + k);
    ok(typeof day.startedAt === 'number', 'startedAt ' + k);
    ok(day.checks && typeof day.checks === 'object' && !Array.isArray(day.checks), 'checks ' + k);
    ok(typeof day.anchors.lever === 'boolean' && typeof day.anchors.fermeture === 'boolean', 'ancres ' + k);
    ok(typeof s.rewards[k] === 'string', 'récompense ' + k);
  });
  Cap.COUNTERS.forEach(function (c) { ok(Number.isInteger(s.counters[c.id]) && s.counters[c.id] >= 0, 'compteur ' + c.id); });
  ok(Array.isArray(s.interview.answers) && s.interview.answers.length === 7, 'réponses interview');
  eq(Cap.normalize(JSON.parse(JSON.stringify(s))), s, 'normalisation idempotente');
}

// Vérifie qu'un contenu a la forme attendue par l'application.
function assertValidContent(c) {
  var ids = [];
  Cap.DAY_KEYS.forEach(function (k) {
    var d = c.days[k];
    ok(d && typeof d.name === 'string', 'jour ' + k);
    ok(/^#[0-9a-fA-F]{3,6}$/.test(d.c1) && /^#[0-9a-fA-F]{3,6}$/.test(d.c2), 'couleurs ' + k);
    ok(d.essentiels.length <= 2, 'deux essentiels au plus : ' + k);
    d.essentiels.concat(d.bonus).forEach(function (it) { ids.push(it.id); });
    if (k === 'we') { ok(d.weekend && d.weekend.id, 'case du week-end'); ids.push(d.weekend.id); }
    else ok(d.reward && typeof d.reward.text === 'string', 'récompense ' + k);
  });
  c.prep.concat(c.jobs).forEach(function (it) { ids.push(it.id); });
  c.counters.forEach(function (it) { ids.push(it.id); });
  c.rules.forEach(function (it) { ids.push(it.id); });
  eq(ids.length, new Set(ids).size, 'identifiants uniques');
  ok(typeof c.countdown.a === 'string' && typeof c.countdown.b === 'string', 'textes du compte à rebours');
}

// ---------- Vues : outils ----------

var VOID = ['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'wbr', 'path'];
// Vérifie que chaque balise ouverte est fermée dans le bon ordre.
function assertBalanced(html) {
  var stack = [], re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g, m;
  while ((m = re.exec(html))) {
    var tag = m[2].toLowerCase();
    if (m[3] === '/' || VOID.indexOf(tag) >= 0) continue;
    if (!m[1]) stack.push(tag);
    else if (stack.pop() !== tag) throw new Error('balise </' + tag + '> mal fermée');
  }
  if (stack.length) throw new Error('balises non fermées : ' + stack.join(', '));
}
function assertClickable(html) {
  ok(/<(button|input|textarea|select)\b[^>]*data-act="/.test(html), 'aucun élément cliquable avec data-act');
}
function ctxAt(y, mo, d, h) {
  var t = new Date(y, mo - 1, d, h || 10, 0);
  return { today: t, now: t.getTime(), ui: { deroule: true } };
}
function viewOk(name, state, ctx) {
  var html = Cap.views[name](state, ctx);
  ok(typeof html === 'string' && html.length > 0, 'vue vide');
  assertBalanced(html);
  assertClickable(html);
  return html;
}
function count(html, re) { return (html.match(re) || []).length; }

// ---------- La suite, exécutée pour chaque contenu ----------

function suite() {

  test('le contenu actif est valide et assez complet pour les tests', function () {
    assertValidContent(Cap.CONTENT);
    eq(Cap.DAYS.lun.essentiels.length, 2, 'lundi : 2 essentiels');
    ok(Cap.DAYS.lun.bonus.length >= 1, 'lundi : au moins un bonus');
    eq(Cap.DAYS.mer.essentiels.length, 2, 'mercredi : 2 essentiels');
    ok(Cap.PREP.length >= 2 && Cap.RULES.length >= 1 && Cap.COUNTERS.length >= 1, 'listes');
  });

  // ----- Normalisation de l'état -----

  [null, undefined, {}, [], 42, 'texte', true, { week: null }, { settings: 'x' }].forEach(function (input, i) {
    test('normalize survit à l’entrée #' + i + ' (' + JSON.stringify(input) + ')', function () {
      var s = Cap.normalize(input);
      assertValidState(s);
      eq(s, Cap.defaults(), 'doit valoir les défauts');
    });
  });

  test('normalize : état tronqué', function () {
    var c0 = Cap.COUNTERS[0].id;
    var counters = {}; counters[c0] = 3;
    var s = Cap.normalize({ v: 1, week: { lun: { amorce: 'done' } }, counters: counters });
    assertValidState(s);
    eq(s.week.lun.amorce, 'done');
    eq(s.week.mar.amorce, 'idle');
    eq(s.counters[c0], 3);
  });

  test('normalize : mauvais types partout', function () {
    var counters = {};
    Cap.COUNTERS.forEach(function (c, i) { counters[c.id] = [-4, 'abc', 1e9][i % 3]; });
    var s = Cap.normalize({
      tab: 99, selectedDay: 'dimanche',
      settings: { lever: 'demain', fermeture: {}, finStage: '2026-13-45', rendu: 7, phase: 'Z' },
      week: { lun: 'oui', mar: [], mer: { amorce: 'running' }, jeu: { checks: 'x', anchors: 5 } },
      rewards: { lun: 12, mar: null },
      counters: counters,
      interview: { title: 5, answers: 'non' },
      openRule: 'inconnue', weeksClosed: 'beaucoup', prep: 'x', rapport: 5, jobs: null
    });
    assertValidState(s);
    eq(s.tab, 'jour'); eq(s.selectedDay, null);
    eq(s.settings, Cap.defaults().settings);
    eq(s.week.mer.amorce, 'idle', 'running sans startedAt → idle');
    Cap.COUNTERS.forEach(function (c, i) { eq(s.counters[c.id], [0, 0, 9999][i % 3], 'compteur ' + c.id); });
    eq(s.rewards.lun, Cap.defaults().rewards.lun);
  });

  test('normalize : ancien format (réglages à plat, cases en tableau, minutes, chaînes)', function () {
    var checks = {};
    checks['lun:' + E('lun', 0)] = true; checks['mar:inconnu'] = true; checks['zzz:x'] = true;
    var jobs = {}; jobs[Cap.JOBS[0].id] = 'true'; jobs[Cap.JOBS[1].id] = 1; if (Cap.JOBS[2]) jobs[Cap.JOBS[2].id] = false;
    var counters = {}; counters[Cap.COUNTERS[0].id] = '5';
    var prep = {}; prep[Cap.PREP[0].id] = true;
    var s = Cap.normalize({
      lever: 450, close: '22h30', fin: '2026-10-14',
      checks: checks,
      week: { mer: { amorce: true, checks: [E('mer', 0), 'pas-un-id'] } },
      rapport: ['r1', 'r2', 'r99'],
      jobs: jobs, counters: counters, prep: prep
    });
    assertValidState(s);
    eq(s.settings.lever, '07:30');
    eq(s.settings.fermeture, '22:30');
    eq(s.settings.finStage, '2026-10-14');
    eq(Object.keys(s.week.lun.checks), [E('lun', 0)]);
    eq(s.week.mar.checks, {});
    eq(s.week.mer.amorce, 'done');
    eq(Object.keys(s.week.mer.checks), [E('mer', 0)]);
    eq(s.rapport, { r1: true, r2: true });
    eq(Object.keys(s.jobs).sort(), [Cap.JOBS[0].id, Cap.JOBS[1].id].sort());
    eq(s.counters[Cap.COUNTERS[0].id], 5);
    eq(s.prep[Cap.PREP[0].id], '2000-01-01', 'case cochée sans date → date ancienne');
  });

  test('normalize : préparation datée et amorce du soir', function () {
    var prep = {};
    prep[Cap.PREP[0].id] = '2026-09-30'; prep[Cap.PREP[1].id] = 'pas une date'; prep['prep-inconnu'] = '2026-09-30';
    var s = Cap.normalize({ prep: prep, prepAmorce: { date: '2026-10-01', amorce: 'running', startedAt: 123 } });
    assertValidState(s);
    eq(Object.keys(s.prep), [Cap.PREP[0].id]);
    eq(s.prepAmorce, { date: '2026-10-01', amorce: 'running', startedAt: 123 });
    eq(Cap.normalize({ prepAmorce: 'x' }).prepAmorce, Cap.defaults().prepAmorce);
  });

  test('normalize : le lever ne dépasse jamais le plafond', function () {
    eq(Cap.normalize({ settings: { lever: '23:30' } }).settings.lever, Cap.defaults().settings.leverMax);
  });

  test('normalize : ne modifie pas l’objet reçu', function () {
    var raw = { week: { lun: { checks: {} } } };
    raw.week.lun.checks[E('lun', 0)] = true;
    var s = Cap.normalize(raw);
    s.week.lun.checks[E('lun', 1)] = true;
    ok(!raw.week.lun.checks[E('lun', 1)], 'l’entrée a été modifiée');
  });

  // ----- Stockage -----

  function memoryStorage(initial) {
    var data = {};
    if (initial !== undefined) data[Cap.STORAGE_KEY] = initial;
    return {
      data: data,
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[k] = String(v); },
      removeItem: function (k) { delete data[k]; }
    };
  }
  var brokenStorage = {
    getItem: function () { throw new Error('SecurityError'); },
    setItem: function () { throw new Error('QuotaExceededError'); },
    removeItem: function () { throw new Error('SecurityError'); }
  };

  test('load : stockage vide', function () { eq(Cap.load(memoryStorage()), Cap.defaults()); });
  test('load : stockage absent (null)', function () { eq(Cap.load(null), Cap.defaults()); });
  test('load : stockage refusé (exception)', function () { eq(Cap.load(brokenStorage), Cap.defaults()); });
  test('load : JSON tronqué', function () { eq(Cap.load(memoryStorage('{"v":1,"week":{"lun":')), Cap.defaults()); });
  test('load : JSON "null"', function () { eq(Cap.load(memoryStorage('null')), Cap.defaults()); });
  test('save : stockage refusé → false, sans exception', function () { eq(Cap.save(Cap.defaults(), brokenStorage), false); });
  test('save + load : aller-retour', function () {
    var st = memoryStorage();
    var s = Cap.defaults();
    Cap.toggleDayCheck(s, 'lun', E('lun', 0));
    Cap.bumpCounter(s, Cap.COUNTERS[0].id, 2);
    eq(Cap.save(s, st), true);
    eq(Cap.load(st), s);
    eq(Object.keys(st.data), ['cap_v1'], 'clé de stockage');
  });

  // ----- Dates et phases -----

  test('jour de la semaine', function () {
    eq(Cap.dayKeyForDate(D('2026-10-19')), 'lun');
    eq(Cap.dayKeyForDate(D('2026-10-23')), 'ven');
    eq(Cap.dayKeyForDate(D('2026-10-10')), 'we');
    eq(Cap.dayKeyForDate(D('2026-10-11')), 'we');
  });
  test('phase A jusqu’à la date de bascule incluse, B le lendemain', function () {
    var s = base();
    eq(Cap.phaseFor(s, D('2026-10-01')), 'A');
    eq(Cap.phaseFor(s, new Date(2026, 9, 14, 23, 59)), 'A');
    eq(Cap.phaseFor(s, D('2026-10-15')), 'B');
    s.settings.phase = 'B';
    eq(Cap.phaseFor(s, D('2026-10-01')), 'B', 'surcharge manuelle');
  });
  test('compte à rebours', function () {
    var s = base();
    eq(Cap.countdown(s, D('2026-10-01')).days, 13);
    eq(Cap.countdown(s, new Date(2026, 9, 1, 21, 30)).days, 13, 'l’heure ne change rien');
    eq(Cap.countdown(s, D('2026-10-15')), { days: 47, label: Cap.CONTENT.countdown.b });
  });
  test('horaires relatifs au lever et à la fermeture', function () {
    var s = base().settings;
    eq(Cap.resolveTime('=w', s), '07:00');
    eq(Cap.resolveTime('+90', s), '08:30');
    eq(Cap.resolveTime('=c', s), '22:00');
    eq(Cap.resolveTime('14:30', s), '14:30');
    Cap.DAY_KEYS.forEach(function (k) {
      Cap.deroule(k, s).forEach(function (r) { ok(/^\d{2}:\d{2}$/.test(r.time), k + ' : ' + r.time); });
    });
    var we = Cap.fillHeure(Cap.DAYS.we.weekend.label, s);
    ok(we.indexOf('[heure]') < 0, 'heure remplacée');
  });

  // ----- Actions -----

  test('récompense débloquée seulement quand tous les essentiels sont cochés', function () {
    var s = base();
    ok(!Cap.rewardUnlocked(s, 'lun'));
    Cap.toggleDayCheck(s, 'lun', E('lun', 0));
    ok(!Cap.rewardUnlocked(s, 'lun'));
    Cap.toggleDayCheck(s, 'lun', B('lun', 0));
    ok(!Cap.rewardUnlocked(s, 'lun'), 'un bonus ne compte pas');
    Cap.toggleDayCheck(s, 'lun', E('lun', 1));
    ok(Cap.rewardUnlocked(s, 'lun'));
    ok(Cap.rewardUnlocked(s, 'lun') && !s.week.lun.anchors.lever, 'les ancres ne bloquent jamais');
    ok(!Cap.rewardUnlocked(s, 'we'), 'pas de récompense le week-end');
  });
  test('chrono d’amorce', function () {
    var s = base(), t0 = 1000000;
    eq(Cap.amorceRemaining(s, 'mar', t0), 0);
    Cap.startAmorce(s, 'mar', t0);
    eq(Cap.amorceRemaining(s, 'mar', t0), 300);
    eq(Cap.amorceRemaining(s, 'mar', t0 + 61000), 239);
    eq(Cap.amorceRemaining(s, 'mar', t0 + 999999), 0);
    Cap.startAmorce(s, 'mar', t0 + 5000);
    eq(s.week.mar.startedAt, t0, 'relancer ne remet pas le chrono à zéro');
    Cap.finishAmorce(s, 'mar', t0);
    eq(s.week.mar.amorce, 'done');
  });
  test('clore la semaine : décoche, recule le lever de 30 min, garde le reste', function () {
    var s = base(), c0 = Cap.COUNTERS[0].id;
    Cap.toggleDayCheck(s, 'lun', E('lun', 0));
    Cap.toggleRapport(s, 'r1');
    Cap.toggleJob(s, Cap.JOBS[0].id);
    Cap.bumpCounter(s, c0, 3);
    Cap.closeWeek(s);
    eq(s.week.lun.checks, {});
    eq(s.settings.lever, '07:30');
    eq(s.rapport, { r1: true }); ok(s.jobs[Cap.JOBS[0].id]); eq(s.counters[c0], 3);
    for (var i = 0; i < 10; i++) Cap.closeWeek(s);
    eq(s.settings.lever, '10:00', 'plafond');
  });
  test('compteurs jamais négatifs', function () {
    var s = base(), c0 = Cap.COUNTERS[0].id;
    Cap.bumpCounter(s, c0, -1);
    eq(s.counters[c0], 0);
    Cap.bumpCounter(s, 'inconnu', 1);
    ok(!('inconnu' in s.counters));
  });
  test('préparation : une à la fois, dans l’ordre, datée', function () {
    var s = base(), p0 = Cap.PREP[0].id;
    eq(Cap.nextPrep(s).id, p0);
    eq(Cap.prepDoneToday(s, D('2026-10-01')), null);
    Cap.togglePrep(s, p0, D('2026-10-01'));
    eq(Cap.nextPrep(s).id, Cap.PREP[1].id);
    eq(Cap.prepDoneToday(s, D('2026-10-01')).id, p0);
    eq(Cap.prepDoneToday(s, D('2026-10-02')), null, 'le lendemain, une nouvelle tâche');
    Cap.togglePrep(s, p0, D('2026-10-01'));
    eq(s.prep, {}, 'décocher');
  });
  test('amorce du soir : remise à zéro chaque jour', function () {
    var s = base();
    var soir = new Date(2026, 9, 1, 20, 0).getTime();
    Cap.startAmorce(s, 'prep', soir);
    eq(Cap.amorceStatus(s, 'prep', soir), 'running');
    Cap.finishAmorce(s, 'prep', soir + 300000);
    eq(Cap.amorceStatus(s, 'prep', soir + 300000), 'done');
    eq(Cap.amorceStatus(s, 'prep', new Date(2026, 9, 2, 20, 0).getTime()), 'idle', 'le lendemain');
  });
  test('chronos expirés terminés en silence au chargement', function () {
    var s = base(), t0 = 5000000;
    Cap.startAmorce(s, 'lun', t0);
    eq(Cap.expireAmorces(s, t0 + 1000), false);
    eq(Cap.expireAmorces(s, t0 + 301000), true);
    eq(s.week.lun.amorce, 'done');
  });
  test('réglages : valeurs valides et refusées', function () {
    var s = base();
    ok(Cap.setSetting(s, 'lever', '08:30')); eq(s.settings.lever, '08:30');
    ok(Cap.setSetting(s, 'lever', '11:00')); eq(s.settings.lever, '10:00', 'plafond');
    ok(!Cap.setSetting(s, 'lever', '')); eq(s.settings.lever, '10:00', 'champ vidé : inchangé');
    ok(Cap.setSetting(s, 'fermeture', '21:30')); eq(s.settings.fermeture, '21:30');
    ok(!Cap.setSetting(s, 'rendu', '2026-02-31'));
    ok(Cap.setSetting(s, 'rendu', '2026-11-10')); eq(s.settings.rendu, '2026-11-10');
    ok(Cap.setSetting(s, 'phase', 'B')); ok(!Cap.setSetting(s, 'phase', 'C')); eq(s.settings.phase, 'B');
    ok(!Cap.setSetting(s, 'leverMax', '12:00'), 'clé non modifiable');
    ok(!Cap.setSetting(s, '__proto__', 'x'));
    assertValidState(s);
  });
  test('ancres et sélection du jour', function () {
    var s = base();
    Cap.toggleAnchor(s, 'lun', 'lever'); eq(s.week.lun.anchors.lever, true);
    Cap.toggleAnchor(s, 'lun', 'autre'); Cap.toggleAnchor(s, 'xxx', 'lever');
    assertValidState(s);
    ok(!Cap.rewardUnlocked(s, 'lun'), 'une ancre ne débloque rien');
    Cap.selectDay(s, 'ven'); eq(Cap.activeDay(s, D('2026-10-19')), 'ven');
    Cap.selectDay(s, ''); eq(Cap.activeDay(s, D('2026-10-19')), 'lun', 'retour à aujourd’hui');
    Cap.selectDay(s, 'n’importe'); eq(s.selectedDay, null);
  });

  // ----- Interview (banque fixe) -----

  var cases = {
    'Présentation de l’entreprise': 'presentation',
    'MISSIONS RÉALISÉES': 'missions',
    'Analyse critique des missions': 'analyse',
    'Problématique': 'analyse',
    'Compétences acquises': 'competences',
    'Bilan et perspectives': 'conclusion',
    'Conclusion': 'conclusion',
    'Remerciements': 'remerciements',
    'Annexe 3': 'generique',
    '': 'generique'
  };
  Object.keys(cases).forEach(function (title) {
    test('interview « ' + title + ' » → ' + cases[title], function () {
      var cat = Cap.interviewFor(title);
      eq(cat.id, cases[title]);
      eq(cat.questions.length, 7);
    });
  });
  test('interview : entrées bizarres', function () {
    [null, undefined, 42, {}, '!!!'].forEach(function (t) { eq(Cap.interviewFor(t).questions.length, 7); });
  });
  test('interview : toutes les catégories ont 7 questions', function () {
    Cap.INTERVIEW.concat([Cap.INTERVIEW_GENERIC]).forEach(function (c) { eq(c.questions.length, 7, c.id); });
  });
  test('interview : texte à copier', function () {
    var txt = Cap.interviewText('Missions', ['Des maquettes']);
    ok(txt.indexOf('Missions') === 0);
    ok(txt.indexOf('Des maquettes') > 0);
    ok(count(txt, /\?/g) >= 7);
  });

  // ----- Vues -----

  test('barre d’onglets et en-tête', function () {
    var s = base();
    assertBalanced(Cap.views.header(s, ctxAt(2026, 10, 1)));
    var tb = Cap.views.tabbar(s);
    assertBalanced(tb); assertClickable(tb);
    eq(count(tb, /data-act="tab"/g), 5);
  });
  test('JOUR phase A : une seule carte, un seul bouton', function () {
    var html = viewOk('jour', base(), ctxAt(2026, 10, 1, 20));
    eq(count(html, /<button/g), 1, 'un seul bouton');
    ok(html.indexOf(esc(Cap.PREP[0].label)) > 0, 'première tâche affichée');
  });
  test('JOUR phase A : après l’amorce puis la case cochée', function () {
    var s = base(), c = ctxAt(2026, 10, 1, 20);
    Cap.startAmorce(s, 'prep', c.now);
    ok(viewOk('jour', s, c).indexOf('data-timer="prep"') > 0, 'chrono visible');
    Cap.togglePrep(s, Cap.PREP[0].id, c.today);
    ok(viewOk('jour', s, c).indexOf('Fait pour ce soir') > 0);
    Cap.PREP.forEach(function (p) { s.prep[p.id] = '2026-09-01'; });
    assertBalanced(Cap.views.jour(s, c));
  });
  test('JOUR phase B : chaque jour, avant et après l’amorce', function () {
    var dates = { lun: 19, mar: 20, mer: 21, jeu: 22, ven: 23 };
    Object.keys(dates).forEach(function (k) {
      var s = base(), c = ctxAt(2026, 10, dates[k]);
      var html = viewOk('jour', s, c);
      eq(count(html, /<button/g), 1, k + ' : un seul bouton avant l’amorce');
      ok(html.indexOf(esc(Cap.DAYS[k].amorce)) > 0, k + ' : phrase d’amorce');
      Cap.startAmorce(s, k, c.now);
      html = viewOk('jour', s, c);
      ok(html.indexOf('reward-text') > 0, k + ' : carte récompense');
      ok(html.indexOf('class="reward on"') < 0, k + ' : verrouillée');
      Cap.DAYS[k].essentiels.forEach(function (it) { Cap.toggleDayCheck(s, k, it.id); });
      ok(viewOk('jour', s, c).indexOf('class="reward on"') > 0, k + ' : débloquée');
    });
  });
  test('JOUR week-end et jour choisi à la main', function () {
    var s = base();
    ok(viewOk('jour', s, ctxAt(2026, 10, 3)).indexOf('On ne touche à rien') > 0);
    s.selectedDay = 'mer';
    ok(viewOk('jour', s, ctxAt(2026, 10, 17)).indexOf(esc(Cap.DAYS.mer.amorce)) > 0);
  });
  test('JOUR : le texte saisi est échappé', function () {
    var s = base(), c = ctxAt(2026, 10, 19);
    s.rewards.lun = '"><script>alert(1)</script>';
    Cap.startAmorce(s, 'lun', c.now);
    ok(viewOk('jour', s, c).indexOf('<script>') < 0, 'non échappé');
  });
  test('RAPPORT : avant et pendant l’interview, tous états de copie', function () {
    var s = base(), c = ctxAt(2026, 10, 14);
    var html = viewOk('rapport', s, c);
    eq(count(html, /data-act="rapport-check"/g), 9, '9 étapes');
    ok(html.indexOf('data-act="interview-start"') > 0, 'formulaire');
    s.interview.title = 'Missions';
    ['', 'busy', 'ok', 'fail'].forEach(function (st) {
      c.ui.copyState = st;
      html = viewOk('rapport', s, c);
      eq(count(html, /data-act="interview-answer"/g), 7, '7 réponses (' + st + ')');
      eq(count(html, /data-act="speak"/g), 7, '7 boutons écouter');
    });
  });
  test('RAPPORT : réponses et titre échappés', function () {
    var s = base(), c = ctxAt(2026, 10, 14);
    s.interview.title = '<b>Bilan</b>';
    s.interview.answers[0] = '</textarea><script>x</script>';
    c.ui.copyState = 'fail';
    var html = viewOk('rapport', s, c);
    ok(html.indexOf('<script>') < 0 && html.indexOf('<b>') < 0);
  });
  test('BOULOT : compteurs et outils', function () {
    var s = base();
    Cap.bumpCounter(s, Cap.COUNTERS[0].id, 12);
    var html = viewOk('boulot', s, ctxAt(2026, 10, 14));
    eq(count(html, /data-act="counter"/g), 2 * Cap.COUNTERS.length, '+1 et −1 pour chaque compteur');
    eq(count(html, /data-act="job-check"/g), Cap.JOBS.length);
    ok(html.indexOf('>12<') > 0);
  });
  test('CAP : sélecteur, ancres, réglages, clôture, contenu, règles', function () {
    var s = base(), c = ctxAt(2026, 10, 14);
    var html = viewOk('cap', s, c);
    eq(count(html, /data-act="select-day"/g), 7, 'Aujourd’hui + 6 jours');
    eq(count(html, /data-act="anchor"/g), 2, 'deux ancres');
    eq(count(html, /data-act="setting"/g), 5, '5 réglages');
    ok(html.indexOf('data-act="close-week"') > 0);
    ok(html.indexOf('data-act="import-file"') > 0, 'import');
    ok(html.indexOf('data-act="content-reset"') < 0, 'pas de retour à l’exemple quand on y est déjà');
    eq(count(html, /data-act="rule"/g), Cap.RULES.length);
    ok(html.indexOf('rule-body') < 0, 'règles repliées');
    s.openRule = Cap.RULES[0].id;
    ok(viewOk('cap', s, c).indexOf(esc(Cap.RULES[0].text[0])) > 0, 'règle dépliée');
    c.contentInfo = { source: 'perso', importedAt: '2026-10-06' };
    c.ui.importMsg = 'Contenu importé ✓';
    html = viewOk('cap', s, c);
    ok(html.indexOf('data-act="content-reset"') > 0 && html.indexOf('importé le mardi 6 octobre') > 0);
    s.selectedDay = 'we';
    eq(count(viewOk('cap', s, c), /data-act="anchor"/g), 1, 'week-end : seulement le lever');
  });
  test('to-do : ajouter, cocher, supprimer, annuler', function () {
    var s = base();
    ok(!Cap.addTodo(s, '   ', 1), 'texte vide refusé');
    ok(!Cap.addTodo(s, null, 1), 'null refusé');
    ok(Cap.addTodo(s, '  Appeler la banque  ', 1000));
    ok(Cap.addTodo(s, 'Deuxième', 1000), 'même instant : identifiant différent');
    ok(Cap.addTodo(s, 'Troisième', 2000));
    eq(s.todos.map(function (t) { return t.text; }), ['Appeler la banque', 'Deuxième', 'Troisième']);
    eq(new Set(s.todos.map(function (t) { return t.id; })).size, 3, 'identifiants uniques');
    var a = s.todos[0].id, b = s.todos[1].id, c = s.todos[2].id;
    Cap.toggleTodo(s, a, 5000);
    Cap.toggleTodo(s, c, 6000);
    var l = Cap.sortedTodos(s);
    eq(l.open.map(function (t) { return t.id; }), [b], 'à faire');
    eq(l.done.map(function (t) { return t.id; }), [c, a], 'faites : la plus récente en premier');
    Cap.toggleTodo(s, a, 7000);
    eq(Cap.sortedTodos(s).open.map(function (t) { return t.id; }), [a, b], 'décochée : reprend sa place d’origine');
    var removed = Cap.removeTodo(s, b);
    eq(removed.index, 1); eq(s.todos.length, 2);
    eq(Cap.removeTodo(s, 'inconnu'), null);
    Cap.restoreTodo(s, removed);
    eq(s.todos.map(function (t) { return t.id; }), [a, b, c], 'annuler : remise à sa place');
    Cap.restoreTodo(s, removed);
    eq(s.todos.length, 3, 'pas de doublon si on annule deux fois');
    Cap.closeWeek(s);
    eq(s.todos.length, 3, 'clore la semaine garde la to-do');
    assertValidState(s);
  });
  test('to-do : limite et texte trop long', function () {
    var s = base();
    for (var i = 0; i < Cap.TODO_MAX; i++) Cap.addTodo(s, 'x' + i, i);
    ok(!Cap.addTodo(s, 'de trop', 999999), 'liste pleine');
    var s2 = base();
    Cap.addTodo(s2, new Array(500).join('a'), 1);
    eq(s2.todos[0].text.length, 300);
  });
  test('normalize : to-do abîmée ou ancienne', function () {
    var s = Cap.normalize({ todos: [
      'Ancien format texte', { text: '  Ok  ', done: 'true', at: '5', doneAt: 9 }, { text: '' }, { text: 5 }, null,
      { id: 'dup', text: 'A' }, { id: 'dup', text: 'B' }, { id: 'mauvais id !', text: 'C', done: false, doneAt: 77 }
    ] });
    assertValidState(s);
    eq(s.todos.map(function (t) { return t.text; }), ['Ancien format texte', 'Ok', 'A', 'B', 'C']);
    eq(s.todos[1], { id: 'old1', text: 'Ok', done: true, at: 5, doneAt: 9 });
    eq(new Set(s.todos.map(function (t) { return t.id; })).size, 5, 'identifiants uniques');
    eq(s.todos[4].doneAt, 0, 'pas faite : doneAt à 0');
    eq(Cap.normalize({ todos: 'x' }).todos, []);
    eq(Cap.normalize({ todos: new Array(500).join('t,').split(',') }).todos.length, Cap.TODO_MAX);
  });
  test('TO-DO : vue vide, remplie, avec annulation, texte échappé', function () {
    var s = base(), c = ctxAt(2026, 10, 21);
    var html = viewOk('todo', s, c);
    ok(html.indexOf('data-act="todo-add"') > 0 && html.indexOf('data-act="todo-draft"') > 0, 'formulaire');
    ok(html.indexOf('Rien pour l’instant') > 0, 'état vide');
    Cap.addTodo(s, '<img src=x onerror=alert(1)>', 1);
    Cap.addTodo(s, 'Deux', 2);
    Cap.toggleTodo(s, s.todos[1].id, 3);
    html = viewOk('todo', s, c);
    ok(html.indexOf('<img') < 0, 'texte échappé');
    eq(count(html, /data-act="todo-check"/g), 2);
    eq(count(html, /data-act="todo-del"/g), 2);
    ok(html.indexOf('Faites') > html.indexOf('À faire'), 'faites en bas');
    ok(/class="check on"[\s\S]*Deux/.test(html.slice(html.indexOf('Faites'))), 'faite cochée, en bas');
    c.ui.todoUndo = { item: { id: 'z', text: 'z' }, index: 0 };
    ok(viewOk('todo', s, c).indexOf('data-act="todo-undo"') > 0, 'lien annuler');
  });
  test('rapport rendu : coche les 9 étapes, bandeau, annulation', function () {
    var s = base(), c = ctxAt(2026, 10, 21);
    var html = viewOk('rapport', s, c);
    ok(html.indexOf('data-act="rapport-rendu"') > 0, 'bouton');
    ok(html.indexOf('Rapport rendu') < 0, 'pas de bandeau avant');
    Cap.setRapportRendu(s, c.today);
    eq(s.rapportRendu, '2026-10-21');
    ok(Cap.RAPPORT.every(function (r) { return s.rapport[r.id]; }), '9 étapes cochées');
    html = viewOk('rapport', s, c);
    ok(html.indexOf('Rapport rendu') > 0 && html.indexOf('mercredi 21 octobre') > 0, 'bandeau daté');
    ok(html.indexOf('data-act="rapport-rendu"') < 0, 'bouton masqué');
    ok(html.indexOf('data-act="rapport-undo"') > 0, 'annuler');
    ok(html.indexOf('data-act="interview-start"') > 0, 'interview toujours là');
    assertValidState(s);
    Cap.unsetRapportRendu(s);
    eq(s.rapportRendu, '');
    eq(Cap.normalize({ rapportRendu: 'hier' }).rapportRendu, '');
  });
  // ----- Après le rendu du rapport -----

  function reportDay() {
    var ks = ['lun', 'mar', 'mer', 'jeu', 'ven'].filter(function (k) {
      return Cap.DAYS[k].essentiels.some(function (it) { return it.rapport; });
    });
    ok(ks.length, 'au moins un jour a des tâches marquées « rapport »');
    return ks[0];
  }
  function renduState() {
    var s = base();
    Cap.setRapportRendu(s, D('2026-10-21'));
    return s;
  }

  test('rendu : l’onglet Rapport disparaît, on peut annuler', function () {
    var s = base();
    eq(Cap.visibleTabs(s).length, 5);
    s.tab = 'rapport';
    Cap.setRapportRendu(s, D('2026-10-21'));
    ok(Cap.visibleTabs(s).indexOf('rapport') < 0, 'onglet masqué');
    eq(Cap.currentTab(s), 'jour', 'onglet courant masqué → JOUR');
    eq(count(Cap.views.tabbar(s), /data-act="tab"/g), 4);
    var html = viewOk('cap', s, ctxAt(2026, 10, 21));
    ok(html.indexOf('data-act="rapport-undo"') > 0, 'annuler depuis CAP');
    Cap.unsetRapportRendu(s);
    eq(Cap.visibleTabs(s).length, 5);
    eq(Cap.currentTab(s), 'rapport');
  });
  test('rendu : les tâches « rapport » disparaissent de JOUR', function () {
    var k = reportDay(), before = base(), after = renduState();
    eq(Cap.dayEssentials(before, k).length, Cap.DAYS[k].essentiels.length, 'avant : tout est là');
    eq(Cap.todoSlots(before, k), 0, 'avant : pas de place pour la to-do');
    var kept = Cap.DAYS[k].essentiels.filter(function (it) { return !it.rapport; });
    eq(Cap.dayEssentials(after, k).map(function (it) { return it.id; }), kept.map(function (it) { return it.id; }), 'après, to-do vide');
    ok(Cap.todoSlots(after, k) >= 1);
    ok(Cap.dayBonus(after, k).every(function (it) { return !it.rapport; }), 'bonus filtrés');
    ok(Cap.deroule(k, after.settings, true).length <= Cap.deroule(k, after.settings, false).length, 'déroulé filtré');
    var rows = Cap.DAYS[k].deroule.filter(function (r) { return r[2] === 'rapport'; }).length;
    eq(Cap.deroule(k, after.settings, true).length, Cap.DAYS[k].deroule.length - rows);
    if (Cap.DAYS[k].amorceApres) eq(Cap.dayAmorce(after, k), Cap.DAYS[k].amorceApres);
    eq(Cap.dayAmorce(before, k), Cap.DAYS[k].amorce);
    Cap.startAmorce(after, k, 1);
    ok(viewOk('jour', (after.selectedDay = k, after), ctxAt(2026, 10, 21)).indexOf('Ta to-do est vide') > 0, 'invite à remplir la to-do');
  });
  test('rendu : la to-do remplit les essentiels, deux au plus', function () {
    var k = reportDay(), s = renduState();
    ['Un', 'Deux', 'Trois'].forEach(function (t, i) { Cap.addTodo(s, t, 100 + i); });
    Cap.syncTodoPicks(s, k);
    var ess = Cap.dayEssentials(s, k);
    ok(ess.length <= 2, 'deux essentiels au plus');
    var todos = ess.filter(function (it) { return it.todo; });
    eq(todos.length, Cap.todoSlots(s, k));
    eq(todos.map(function (it) { return it.label; }), ['Un', 'Deux'].slice(0, todos.length), 'les premières tâches à faire');
    ok(!Cap.rewardUnlocked(s, k));
    // On coche tout : la récompense se débloque, et les tâches cochées restent dans la journée.
    ess.forEach(function (it) { if (it.todo) Cap.toggleTodo(s, it.id, 500); else Cap.toggleDayCheck(s, k, it.id); });
    Cap.syncTodoPicks(s, k);
    ok(Cap.rewardUnlocked(s, k), 'récompense débloquée');
    eq(Cap.dayEssentials(s, k).filter(function (it) { return it.todo; }).map(function (it) { return it.label; }),
      todos.map(function (it) { return it.label; }), 'tâches faites gardées pour la journée');
    // Supprimer une tâche retenue libère sa place pour la suivante.
    Cap.removeTodo(s, todos[0].id);
    Cap.syncTodoPicks(s, k);
    var nextOpen = s.todos.filter(function (t) { return !t.done; })[0];
    ok(Cap.dayEssentials(s, k).some(function (it) { return it.id === nextOpen.id; }), 'remplacée par la première tâche à faire');
    ok(Cap.dayEssentials(s, k).every(function (it) { return it.id !== todos[0].id; }), 'la tâche supprimée a disparu');
    var c = ctxAt(2026, 10, 21);
    s.selectedDay = k; Cap.startAmorce(s, k, c.now);
    ok(viewOk('jour', s, c).indexOf('data-act="day-todo"') > 0, 'cochable depuis JOUR');
    Cap.closeWeek(s);
    eq(s.week[k].todoPicks, [], 'clore la semaine libère les choix');
  });
  test('rendu : un jour sans tâche « rapport » ne change pas', function () {
    var s = renduState();
    ['lun', 'mar', 'mer', 'jeu', 'ven'].forEach(function (k) {
      if (Cap.DAYS[k].essentiels.some(function (it) { return it.rapport; })) return;
      eq(Cap.todoSlots(s, k), 0, k);
      eq(Cap.dayEssentials(s, k).length, Cap.DAYS[k].essentiels.length, k);
    });
    eq(Cap.syncTodoPicks(s, 'we'), false);
  });
  test('normalize : choix de to-do abîmés', function () {
    var s = Cap.normalize({ week: { mar: { todoPicks: ['a', 'a', 5, 'mauvais id !', 'b', 'c'] }, mer: { todoPicks: 'x' } } });
    eq(s.week.mar.todoPicks, ['a', 'b']);
    eq(s.week.mer.todoPicks, []);
    assertValidState(s);
  });

  test('Matrice : toutes les vues × états × dates', function () {
    var states = [base(), Cap.normalize(null), Cap.normalize({ settings: { phase: 'B' } })];
    var full = base();
    Cap.DAY_KEYS.forEach(function (k) {
      Cap.startAmorce(full, k, 1);
      Cap.finishAmorce(full, k, 1);
      full.week[k].anchors = { lever: true, fermeture: true };
      Cap.DAYS[k].essentiels.concat(Cap.DAYS[k].bonus).forEach(function (it) { full.week[k].checks[it.id] = true; });
    });
    Cap.RAPPORT.forEach(function (r) { full.rapport[r.id] = true; });
    Cap.JOBS.forEach(function (j) { full.jobs[j.id] = true; });
    full.interview.title = 'Remerciements';
    Cap.addTodo(full, 'Une tâche', 10); Cap.addTodo(full, 'Une autre', 20); Cap.toggleTodo(full, full.todos[0].id, 30);
    Cap.setRapportRendu(full, D('2026-10-21'));
    full.openRule = Cap.RULES[Cap.RULES.length - 1].id;
    full.selectedDay = 'mer';
    states.push(full);
    var rendu = base();
    Cap.setRapportRendu(rendu, D('2026-10-21'));
    Cap.addTodo(rendu, 'Première', 1); Cap.addTodo(rendu, '<b>Deuxième</b>', 2);
    Cap.DAY_KEYS.forEach(function (k) { Cap.startAmorce(rendu, k, 1); Cap.syncTodoPicks(rendu, k); });
    states.push(rendu);
    var dates = [[2026, 10, 1], [2026, 10, 3], [2026, 10, 14], [2026, 10, 15], [2026, 10, 19], [2026, 12, 1], [2026, 12, 25]];
    states.forEach(function (s) {
      dates.forEach(function (d) {
        Cap.TABS.forEach(function (v) { viewOk(v, s, ctxAt(d[0], d[1], d[2])); });
        assertBalanced(Cap.views.header(s, ctxAt(d[0], d[1], d[2])));
      });
    });
  });
  test('Toutes les vues survivent à des états bizarres', function () {
    [null, {}, { interview: { title: 'x', answers: [1, null] } }, { counters: 'x' }, { tab: 'cap' }].forEach(function (raw) {
      Cap.TABS.forEach(function (v) { viewOk(v, Cap.normalize(raw), ctxAt(2026, 10, 14)); });
    });
  });
}

// ---------- Contenu importé ----------

function contentTests() {
  test('normalizeContent survit à n’importe quoi', function () {
    [null, undefined, 42, 'x', [], {}, { days: 'x' }, { days: { lun: 5 } }, { settings: [], counters: 'x', rules: {} }].forEach(function (raw) {
      var r = Cap.normalizeContent(raw);
      assertValidContent(r.content);
    });
  });
  test('normalizeContent : champs invalides remplacés, signalés', function () {
    var r = Cap.normalizeContent({
      days: {
        lun: {
          name: 'L', c1: 'red; background:url(x)', emoji: '<img src=x>',
          essentiels: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }],
          bonus: [{ id: 'a', label: 'doublon' }, { id: 'mauvais id !', label: 'x' }, 'pas un objet'],
          deroule: [['=w', 'ok'], ['25:99', 'heure impossible'], ['demain', 'x']]
        },
        we: { essentiels: [{ id: 'z', label: 'interdit le week-end' }] }
      }
    });
    var lun = r.content.days.lun;
    eq(lun.c1, Cap.SAMPLE.days.lun.c1, 'couleur refusée');
    eq(lun.essentiels.map(function (i) { return i.id; }), ['a', 'b'], 'deux essentiels au plus');
    eq(lun.bonus, [], 'bonus invalides ignorés');
    eq(lun.deroule, [['=w', 'ok']], 'déroulé filtré');
    eq(r.content.days.we.essentiels, [], 'rien le week-end');
    ok(r.warnings.length >= 4, 'avertissements');
    assertValidContent(r.content);
  });
  test('normalizeContent : drapeau « rapport », amorce après rendu, déroulé', function () {
    var r = Cap.normalizeContent({ days: { mar: {
      amorceApres: 'Après', essentiels: [{ id: 'x1', label: 'X', rapport: true }, { id: 'x2', label: 'Y', rapport: 'oui' }],
      deroule: [['=w', 'A', 'rapport'], ['=c', 'B', 'autre']]
    } } });
    var mar = r.content.days.mar;
    eq(mar.amorceApres, 'Après');
    eq(mar.essentiels, [{ id: 'x1', label: 'X', rapport: true }, { id: 'x2', label: 'Y' }], 'seul true compte');
    eq(mar.deroule, [['=w', 'A', 'rapport'], ['=c', 'B']]);
    eq(r.content.days.we.amorceApres, '');
  });
  test('parseContentText : refus clairs', function () {
    eq(Cap.parseContentText('pas du json').ok, false);
    eq(Cap.parseContentText('{"version":1}').ok, false);
    eq(Cap.parseContentText('null').ok, false);
    ok(Cap.parseContentText(JSON.stringify(Cap.SAMPLE)).ok);
  });
  test('loadContent : vide, corrompu, refusé, valide', function () {
    var data = {};
    var st = { getItem: function (k) { return data[k] || null; }, setItem: function (k, v) { data[k] = v; }, removeItem: function (k) { delete data[k]; } };
    eq(Cap.loadContent(st).source, 'exemple');
    data[Cap.CONTENT_KEY] = '{tronqué';
    eq(Cap.loadContent(st).source, 'exemple');
    eq(Cap.loadContent({ getItem: function () { throw new Error('x'); } }).source, 'exemple');
    eq(Cap.loadContent(null).source, 'exemple');
    var c = Cap.normalizeContent(Cap.SAMPLE).content;
    ok(Cap.saveContent(c, D('2026-10-06'), st));
    var back = Cap.loadContent(st);
    eq(back.source, 'perso'); eq(back.importedAt, '2026-10-06'); eq(back.content, c);
    Cap.clearContent(st);
    eq(Cap.loadContent(st).source, 'exemple');
  });
  test('après import : réglages et récompenses du contenu, cases gardées', function () {
    var s = Cap.defaults();
    var keep = E('lun', 0);
    Cap.toggleDayCheck(s, 'lun', keep);
    var c = Cap.normalizeContent(Cap.SAMPLE).content;
    c.settings.lever = '06:30';
    c.days.lun.reward.text = 'Nouvelle récompense';
    var before = Cap.CONTENT;
    Cap.setContent(c);
    Cap.applyContentSettings(s);
    s = Cap.normalize(s);
    eq(s.settings.lever, '06:30');
    eq(s.rewards.lun, 'Nouvelle récompense');
    ok(s.week.lun.checks[keep] || Cap.DAYS.lun.essentiels.every(function (it) { return it.id !== keep; }));
    Cap.setContent(before);
  });
}

// ---------- Pièges connus et confidentialité (code source) ----------

function sourceTests() {
  test('un seul endroit pose des écouteurs, sur document', function () {
    eq(count(SRC, /addEventListener\(/g), 1, 'nombre d’addEventListener');
    ok(/document\.addEventListener\(type, handle\)/.test(SRC));
    ok(!/\son[a-z]+="/.test(SRC.replace(/<script[\s\S]*?<\/script>/g, '')), 'attribut onclick= dans le HTML');
    ok(SRC.indexOf("closest('[data-act]')") > 0);
  });
  test('décorations : pointer-events none', function () {
    ok(/svg, \.deco, \.tick, \.ico \{ pointer-events: none; \}/.test(SRC));
    ok(/\.hero::before, \.hero::after[^{]*\{[^}]*pointer-events: none/.test(SRC), 'pseudo-éléments décoratifs');
    ok(/\.confetti \{[^}]*pointer-events: none/.test(SRC), 'confettis');
  });
  test('position de défilement restaurée au rendu', function () {
    ok(/var y = window\.scrollY;[\s\S]*?window\.scrollTo\(0, y\);/.test(SRC));
  });
  test('clés de stockage versionnées et accès protégés', function () {
    eq(Cap.STORAGE_KEY, 'cap_v1');
    eq(Cap.CONTENT_KEY, 'cap_v1_contenu');
    eq(count(SRC, /localStorage/g), 2, 'localStorage n’apparaît que dans defaultStorage');
  });
  test('aucune ressource externe hors Google Fonts', function () {
    (SRC.match(/https?:\/\/[^\s"')]+/g) || []).forEach(function (u) {
      ok(/^https:\/\/fonts\.(googleapis|gstatic)\.com/.test(u), 'URL externe : ' + u);
    });
    ok(!/\bfetch\(|XMLHttpRequest|import\(/.test(SRC), 'appel réseau');
  });
  test('perso.json est exclu du dépôt', function () {
    var gi = readText('.gitignore');
    ok(/^perso\.json$/m.test(gi));
  });
}

// Aucun texte du contenu personnel ne doit apparaître dans un fichier publié.
function leakTests(perso) {
  var published = ['index.html', 'README.md', 'tests/run.js'].map(function (f) { return { name: f, text: readText(f) }; });
  var strings = [];
  (function walk(v) {
    if (typeof v === 'string') { if (v.length >= 12) strings.push(v); }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.keys(v).forEach(function (k) { walk(v[k]); });
  })(perso);
  var sample = JSON.stringify(Cap.SAMPLE);
  var mine = strings.filter(function (s) { return sample.indexOf(JSON.stringify(s).slice(1, -1)) < 0; });
  test('aucun texte de perso.json dans les fichiers publiés (' + mine.length + ' textes vérifiés)', function () {
    var found = [];
    published.forEach(function (f) {
      mine.forEach(function (s) { if (f.text.indexOf(s) >= 0) found.push(f.name + ' : « ' + s.slice(0, 40) + ' »'); });
    });
    ok(!found.length, found.slice(0, 5).join(' | '));
  });
  test('aucune date personnelle dans les fichiers publiés', function () {
    published.forEach(function (f) {
      ['finStage', 'rendu'].forEach(function (k) {
        var d = perso.settings[k], p = Cap.parseDate(d);
        var forms = [d, 'new Date(' + p.getFullYear() + ', ' + p.getMonth() + ', ' + p.getDate() + ',', p.getFullYear() + ', ' + (p.getMonth() + 1) + ', ' + p.getDate() + ']'];
        forms.forEach(function (x) { ok(f.text.indexOf(x) < 0, f.name + ' contient ' + k + ' (' + x + ')'); });
      });
    });
  });
}

// ---------- Exécution ----------

prefix = '[exemple] ';
suite();
contentTests();
sourceTests();

if (PERSO_TEXT) {
  var parsed = Cap.parseContentText(PERSO_TEXT);
  prefix = '[perso] ';
  test('perso.json est valide, sans correction', function () {
    ok(parsed.ok, parsed.error);
    eq(parsed.warnings, [], 'avertissements');
  });
  if (parsed.ok) {
    Cap.setContent(parsed.content);
    suite();
    Cap.setContent(Cap.normalizeContent(Cap.SAMPLE).content);
    leakTests(JSON.parse(PERSO_TEXT));
  }
}

var summary = passed + ' test(s) réussi(s), ' + failed.length + ' échec(s).' +
  (PERSO_TEXT ? '' : ' (perso.json absent : tests du contenu personnel ignorés.)');
if (failed.length) {
  var msg = summary + '\n' + failed.map(function (f) { return '  ✗ ' + f; }).join('\n');
  if (isNode) { console.error(msg); process.exit(1); }
  throw new Error(msg);
} else {
  console.log(summary);
}
