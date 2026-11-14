// Baxnaano WhatsApp Gateway
// - QR / pairing-code login (WhatsApp "Linked devices")
// - server-side bulk queue (gap between messages, pause/resume/stop, survives page close)
// - inbox + AI auto-reply (CS AI edge function) with hospital knowledge, opt-out and human hand-off
import express from 'express';
import cors from 'cors';
import QRCode from 'qrcode';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import * as brain from './brain.js';
import * as gem from './gemini.js';

const MOCK = process.env.MOCK === '1';
const PORT = parseInt(process.env.PORT || '3000', 10);
const DATA = path.resolve(process.env.DATA_DIR || './data');
fs.mkdirSync(DATA, { recursive: true });

const AI_URL = process.env.AI_URL || 'https://jqsiqkwtpihryvceovxt.supabase.co/functions/v1/ai-partner';
const AI_KEY = process.env.AI_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impxc2lxa3d0cGlocnl2Y2Vvdnh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5OTY1ODIsImV4cCI6MjEwMzU3MjU4Mn0.xLZC4jxTqD9lsXFGpXnd2FDOn1PAo_pcczebQvSKjY4';  // CS AI anon key (public key of the ai-partner project)
const SB_URL = process.env.SUPABASE_URL || '';     // optional: Baxnaano project, to read wa_doctors / wa_settings
const SB_KEY = process.env.SUPABASE_KEY || '';

const log = pino({ level: process.env.LOG_LEVEL || 'warn' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = () => Date.now();

// ---------- tiny JSON store ----------
function load(name, def) { try { return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8')); } catch { return def; } }
const timers = {};
function save(name, obj) {
  clearTimeout(timers[name]);
  timers[name] = setTimeout(() => { try { fs.writeFileSync(path.join(DATA, name), JSON.stringify(obj)); } catch (e) { log.error(e); } }, 300);
}

// ---------- token ----------
let TOKEN = process.env.GATEWAY_TOKEN || '';
if (!TOKEN) {
  const f = path.join(DATA, 'token.txt');
  try { TOKEN = fs.readFileSync(f, 'utf8').trim(); } catch {}
  if (!TOKEN) { TOKEN = crypto.randomBytes(12).toString('hex'); fs.writeFileSync(f, TOKEN); }
}

// ---------- config ----------
const DEFAULT_KNOWLEDGE = `Baxnaano Hospital, Muqdisho.
(Ku qor halkan xogta isbitaalka: goobta, saacadaha, dhakhaatiirta iyo khidmadaha. Haddii la daayo, waxaa la isticmaalayaa xogta jirta ee wa_doctors / wa_settings.)`;
let cfg = Object.assign({
  autoReply: false,
  harithStatus: 'available',      // available | away | unknown
  harithLeaveUntil: '',          // e.g. 2026-11-20 (ISO date) - away until then
  yaxyeStatus: 'available',
  yaxyeLeaveUntil: '',
  knowledge: DEFAULT_KNOWLEDGE,
  extraRules: '',
  replyDelayMinSec: 4,
  replyDelayMaxSec: 10,
  maxRepliesPerContactPerDay: 15,
  dailyCap: 1000,                  // max bulk messages per day
  jitterSec: 3,                    // random 0..jitter seconds added to the gap
  handoffKeywords: ['dhakhtar la hadal', 'qof la hadal', 'shaqaale', 'human', 'agent', 'cabasho', 'complaint'],
  optoutKeywords: ['stop', 'jooji', 'ha ii dirin', 'ha i diri', 'unsubscribe'],
  nonTextReply: 'Fadlan fariinta ku qor qoraal si aan kuu caawino.',
  optoutReply: 'Waa la ogsoonaaday, mar dambe fariin kuma soo diri doonno. Mahadsanid.',
  handoffReply: 'Waan ku mahadsanahay. Fariintaada waxaan u gudbinay shaqaalaha, waa ku soo jawaabi doonaan dhawaan.'
}, load('config.json', {}));
const saveCfg = () => save('config.json', cfg);

let messages = load('messages.json', []);          // inbox + outbox log
let optout = new Set(load('optout.json', []));
let counts = load('counts.json', {});              // { 'YYYY-MM-DD': n } bulk messages per day
let Q = load('queue.json', null) || { status: 'idle', items: [], delaySec: 30, nextAt: 0, note: '', startedAt: 0 };
if (Q.status === 'running') { Q.status = 'paused'; Q.note = 'Server restarted - press Resume.'; }
const today = () => new Date().toISOString().slice(0, 10);

function addMsg(m) {
  const rec = Object.assign({ id: crypto.randomBytes(5).toString('hex'), at: now() }, m);
  messages.push(rec);
  if (messages.length > 3000) messages = messages.slice(-2000);
  save('messages.json', messages);
  return rec;
}

// ---------- phone helpers ----------
function digits(s) { return String(s || '').replace(/\D/g, ''); }
function normPhone(s) {
  let d = digits(s);
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '252' + d.slice(1);
  else if (d.length === 9) d = '252' + d;
  return d;
}
const toJid = to => (String(to).includes('@') ? String(to) : normPhone(to) + '@s.whatsapp.net');

// ---------- WhatsApp connection ----------
let sock = null, waState = MOCK ? 'open' : 'connecting', lastQr = null, me = MOCK ? { id: 'mock' } : null, pairCode = null;
let reconnectDelay = 2000, starting = false, baileysMod = null;

async function startWA() {
  if (MOCK || starting) return;
  starting = true;
  try {
    const mod = await import('@whiskeysockets/baileys');
    baileysMod = mod;
    const makeWASocket = typeof mod.default === 'function' ? mod.default : mod.makeWASocket;
    const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = mod;
    const { state, saveCreds } = await useMultiFileAuthState(path.join(DATA, 'auth'));
    let version; try { ({ version } = await fetchLatestBaileysVersion()); } catch {}
    waState = 'connecting';
    sock = makeWASocket({
      auth: state, version, logger: pino({ level: 'silent' }),
      browser: Browsers ? Browsers.ubuntu('Baxnaano Gateway') : ['Baxnaano Gateway', 'Chrome', '1.0'],
      markOnlineOnConnect: false, syncFullHistory: false
    });
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', u => {
      const { connection, lastDisconnect, qr } = u;
      if (qr) { lastQr = qr; waState = 'qr'; }
      if (connection === 'open') { waState = 'open'; lastQr = null; pairCode = null; me = sock.user || { id: '?' }; reconnectDelay = 2000; }
      if (connection === 'close') {
        const code = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        waState = 'closed'; me = null;
        if (loggedOut) {
          try { fs.rmSync(path.join(DATA, 'auth'), { recursive: true, force: true }); } catch {}
        }
        starting = false;
        setTimeout(startWA, loggedOut ? 500 : reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 1.7, 60000);
      }
    });
    sock.ev.on('messages.upsert', async ({ messages: ms, type }) => {
      if (type !== 'notify') return;
      for (const m of ms) { try { await onIncoming(m); } catch (e) { log.error(e); } }
    });
  } catch (e) {
    log.error(e); waState = 'closed'; starting = false;
    setTimeout(startWA, reconnectDelay); reconnectDelay = Math.min(reconnectDelay * 1.7, 60000);
    return;
  }
  starting = false;
}

async function sendText(jid, text) {
  if (MOCK) { console.log('[MOCK SEND]', jid, JSON.stringify(text).slice(0, 80)); return; }
  if (!sock || waState !== 'open') throw new Error('WhatsApp not connected');
  if (jid.endsWith('@s.whatsapp.net')) {
    const r = await sock.onWhatsApp(jid);
    if (!r || !r[0] || !r[0].exists) throw new Error('Number is not on WhatsApp');
  }
  try { await sock.presenceSubscribe(jid); await sock.sendPresenceUpdate('composing', jid); await sleep(700 + Math.random() * 1200); await sock.sendPresenceUpdate('paused', jid); } catch {}
  await sock.sendMessage(jid, { text });
}

// ---------- hospital knowledge (optional Supabase tables wa_doctors / wa_settings) ----------
let kbCache = { at: 0, text: '', settings: {} };
async function dbKnowledge() {
  const base = { text: cfg.knowledge || '', settings: kbCache.settings || {} };
  if (!SB_URL || !SB_KEY) return base;
  if (now() - kbCache.at < 5 * 60 * 1000) return { text: (cfg.knowledge || '') + '\n\n' + kbCache.text, settings: kbCache.settings };
  try {
    const h = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };
    const [d, s] = await Promise.all([
      fetch(SB_URL + '/rest/v1/wa_doctors?select=name,arrival,note&active=eq.true', { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(SB_URL + '/rest/v1/wa_settings?select=key,value', { headers: h }).then(r => r.ok ? r.json() : [])
    ]);
    const lines = [];
    if (d.length) lines.push('IMAATINKA DHAKHAATIIRTA (ma jiro qiime):\n' + d.map(x => `- ${x.name}: ${x.arrival || 'lama sheegin'}${x.note ? ', ' + x.note : ''}`).join('\n'));
    const settings = {}; s.forEach(x => { settings[x.key] = x.value; });
    if (s.length) lines.push('XOGTA ISBITAALKA:\n' + s.map(x => `- ${x.key}: ${x.value}`).join('\n'));
    kbCache = { at: now(), text: lines.join('\n\n'), settings };
  } catch (e) { log.error(e); }
  return { text: (cfg.knowledge || '') + '\n\n' + kbCache.text, settings: kbCache.settings };
}

// ---------- patient registry + conversation memory ----------
let registry = load('registry.json', {});          // number -> {name, doctor, visit}
let convos = load('convos.json', {});              // jid -> {at, msgs:[{role,content}]}
const saveConvos = () => save('convos.json', convos);
function getConvo(jid) {
  const c = convos[jid];
  if (!c || now() - c.at > 24 * 3600 * 1000) return { at: now(), msgs: [] };
  return c;
}
function lastOutbound(number) {
  const cutoff = now() - 14 * 86400000;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.number === number && m.dir === 'out' && m.bulk && m.at > cutoff) return { text: m.text, when: new Date(m.at).toISOString().slice(0, 10) };
  }
  return null;
}

// ---------- AI (Gemini direct; falls back to the CS AI edge function for text only) ----------
async function aiReply({ history, number, voice }) {
  const kb = await dbKnowledge();
  const system = brain.buildSystem({ kb: kb.text, cfg, patient: registry[number] || null, outbound: lastOutbound(number), voice });
  if (gem.hasGemini()) return gem.chat({ system, history });
  const headers = { 'Content-Type': 'application/json' };
  if (AI_KEY) { headers.Authorization = 'Bearer ' + AI_KEY; headers.apikey = AI_KEY; }
  const res = await fetch(AI_URL, { method: 'POST', headers, body: JSON.stringify({ messages: history.map(h => ({ role: h.role, content: h.content })), system }) });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.error) throw new Error((data && data.error && (data.error.message || data.error)) || 'AI HTTP ' + res.status);
  const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
  const text = parts.filter(p => typeof p.text === 'string').map(p => p.text).join('\n').trim();
  if (!text) throw new Error('empty AI answer');
  return text;
}

const replyCount = new Map();     // jid -> {day, n}

function textOf(m) {
  const x = m.message || {};
  return (x.conversation || (x.extendedTextMessage && x.extendedTextMessage.text) || (x.imageMessage && x.imageMessage.caption) || (x.videoMessage && x.videoMessage.caption) || '').trim();
}

async function downloadMedia(m) {
  if (!baileysMod) throw new Error('media download unavailable');
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const buf = await baileysMod.downloadMediaMessage(m, 'buffer', {}, { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage });
      if (buf && buf.length) return buf;
    } catch (e) { last = e; }
    await sleep(900 * (i + 1));
  }
  throw last || new Error('empty media');
}

async function onIncoming(m) {
  if (!m.message || m.key.fromMe) return;
  const jid = m.key.remoteJid || '';
  if (jid.endsWith('@g.us') || jid === 'status@broadcast' || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) return;
  const alt = m.key.remoteJidAlt || '';
  const number = digits((alt || jid).split('@')[0]);
  const base = { jid, number, name: m.pushName || '' };
  const msg = m.message;
  const text = textOf(m);
  if (msg.audioMessage) {
    let buf = null, err = null;
    try { buf = await downloadMedia(m); } catch (e) { err = e; }
    return handleIncoming({ ...base, text: '', audio: buf ? { buf, mime: msg.audioMessage.mimetype || 'audio/ogg' } : null, audioError: !!err });
  }
  if (msg.imageMessage) {
    let img = null;
    try { const buf = await downloadMedia(m); if (buf.length <= 6 * 1024 * 1024) img = { mime: msg.imageMessage.mimetype || 'image/jpeg', data: buf.toString('base64') }; } catch (e) { log.error(e); }
    return handleIncoming({ ...base, text, image: img, hasImage: true });
  }
  return handleIncoming({ ...base, text, hasMedia: !text });
}

async function handleIncoming({ jid, number, name, text, audio, audioError, image, hasImage, hasMedia }) {
  const base = { jid, number, name, dir: 'in' };
  let voice = false;
  // 1) voice note -> text (Gemini)
  if (audio !== undefined && !text) {
    voice = true;
    let tr = '';
    if (audio && gem.hasGemini()) { try { tr = (await gem.transcribe(audio.buf, audio.mime)).trim(); } catch (e) { log.error(e); } }
    if (!tr || /^\[?UNCLEAR\]?$/i.test(tr)) {
      addMsg({ ...base, text: '[voice note - not understood]', needsHuman: false, voice: true });
      if (cfg.autoReply) {
        const msg = audio ? 'Waan helnay codkaaga, laakiin si cad uma maqlin. Fadlan mar kale noo soo dir ama fariin qoraal ah noo soo qor.' : 'Waan helnay codkaaga, laakiin lama furin. Fadlan mar kale noo soo dir.';
        await sleep(1500); await sendText(jid, msg); addMsg({ jid, number, name, dir: 'out', text: msg, auto: true });
      }
      return;
    }
    text = tr;
  }
  const low = text.toLowerCase();
  if (text && cfg.optoutKeywords.some(k => low === k || low.startsWith(k + ' '))) {
    optout.add(number); save('optout.json', [...optout]);
    addMsg({ ...base, text, optout: true });
    if (cfg.optoutReply) { await sendText(jid, cfg.optoutReply); addMsg({ jid, number, name, dir: 'out', text: cfg.optoutReply, auto: true }); }
    return;
  }
  const needsHumanKw = !!(text && cfg.handoffKeywords.some(k => low.includes(k)));
  const emergency = text ? brain.emergencyReply(text) : null;
  const rec = addMsg({ ...base, text: (voice ? '🎤 ' : '') + (text || (hasImage ? '[image]' : '[media]')), needsHuman: needsHumanKw || !!emergency, voice, emergency: !!emergency });
  if (!cfg.autoReply) return;
  // per-contact daily limit (emergencies are always answered)
  const rc = replyCount.get(jid) || { day: today(), n: 0 };
  if (rc.day !== today()) { rc.day = today(); rc.n = 0; }
  if (rc.n >= cfg.maxRepliesPerContactPerDay && !emergency) return;
  rc.n++; replyCount.set(jid, rc);

  const convo = getConvo(jid);
  let answer = null, viaRule = false;
  if (emergency) { answer = emergency; viaRule = true; }
  else if (hasMedia && !hasImage) answer = cfg.nonTextReply;
  else if (needsHumanKw) answer = cfg.handoffReply;
  else if (text) {
    const kb = await dbKnowledge();
    answer = brain.doctorPresenceReply(text, cfg) || brain.directRoute(text, cfg, kb.settings);
    if (answer) viaRule = true;
  }
  if (!answer) {
    const userText = text || (hasImage ? '(Bukaanku wuxuu soo diray sawir)' : '');
    const history = convo.msgs.slice(-10).concat([{ role: 'user', content: userText, image: image || undefined }]);
    try { answer = await aiReply({ history, number, voice }); }
    catch (e) { log.error(e); rec.aiError = String(e.message || e); rec.needsHuman = true; save('messages.json', messages); return; }
    if (/\[\[HUMAN\]\]/.test(answer)) { rec.needsHuman = true; save('messages.json', messages); }
    answer = answer.replace(/\[\[HUMAN\]\]/g, '').trim();
  }
  if (!answer) return;
  convo.msgs.push({ role: 'user', content: text || '(sawir)' }, { role: 'assistant', content: answer });
  convo.msgs = convo.msgs.slice(-12); convo.at = now(); convos[jid] = convo; saveConvos();
  await sleep((cfg.replyDelayMinSec + Math.random() * Math.max(0, cfg.replyDelayMaxSec - cfg.replyDelayMinSec)) * 1000);
  await sendText(jid, answer);
  addMsg({ jid, number, name, dir: 'out', text: answer, auto: true, rule: viaRule });
}

// ---------- bulk queue ----------
let loopRunning = false;
const saveQ = () => save('queue.json', Q);
function qStats() {
  const c = { total: Q.items.length, sent: 0, failed: 0, skipped: 0, pending: 0 };
  Q.items.forEach(i => { c[i.status === 'sent' ? 'sent' : i.status === 'failed' ? 'failed' : i.status === 'skipped' ? 'skipped' : 'pending']++; });
  return c;
}
async function queueLoop() {
  if (loopRunning) return; loopRunning = true;
  let fails = 0;
  try {
    while (true) {
      if (Q.status === 'stopped' || Q.status === 'idle' || Q.status === 'done') break;
      if (Q.status === 'paused') { await sleep(500); continue; }
      const it = Q.items.find(x => x.status === 'pending');
      if (!it) { Q.status = 'done'; Q.nextAt = 0; saveQ(); break; }
      if (waState !== 'open') { Q.note = 'Waiting for WhatsApp connection...'; await sleep(2000); continue; }
      Q.note = '';
      const num = normPhone(it.to);
      if (optout.has(num)) { it.status = 'skipped'; it.err = 'opted out'; saveQ(); continue; }
      if ((counts[today()] || 0) >= cfg.dailyCap) { Q.status = 'paused'; Q.note = 'Daily cap reached (' + cfg.dailyCap + '). Resume tomorrow.'; saveQ(); continue; }
      try {
        await sendText(toJid(it.to), it.message);
        it.status = 'sent'; it.err = ''; fails = 0;
        counts[today()] = (counts[today()] || 0) + 1; save('counts.json', counts);
        addMsg({ jid: toJid(it.to), number: num, name: it.name || '', dir: 'out', text: it.message, bulk: true });
      } catch (e) {
        it.status = 'failed'; it.err = String(e.message || e); fails++;
        if (fails >= 5) { Q.status = 'paused'; Q.note = '5 failures in a row - check the connection, then Resume.'; fails = 0; }
      }
      it.at = now(); saveQ();
      if (!Q.items.some(x => x.status === 'pending')) continue;
      const wait = (Q.delaySec + Math.random() * cfg.jitterSec) * 1000;
      Q.nextAt = now() + wait; saveQ();
      const end = Q.nextAt;
      while (now() < end && Q.status === 'running') await sleep(300);
      if (Q.status === 'paused') { Q.nextAt = 0; }
    }
  } finally { loopRunning = false; }
}

// ---------- HTTP ----------
const app = express();
app.use(cors({ origin: true, allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '5mb' }));
app.get('/health', (q, r) => r.json({ ok: true }));
function auth(req, res, next) {
  const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.query.token;
  if (t !== TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  next();
}
app.get('/', (req, res) => res.type('html').send(PAGE));
app.use(auth);

app.get('/status', (q, r) => r.json({
  state: waState, me: me && me.id ? String(me.id).split(':')[0].split('@')[0] : null, mock: MOCK,
  queue: { status: Q.status, note: Q.note, delaySec: Q.delaySec, nextInSec: Q.nextAt ? Math.max(0, Math.ceil((Q.nextAt - now()) / 1000)) : 0, ...qStats() },
  sentToday: counts[today()] || 0, dailyCap: cfg.dailyCap, autoReply: cfg.autoReply, optouts: optout.size,
  needsHuman: messages.filter(m => m.dir === 'in' && m.needsHuman && !m.handled).length
}));
app.get('/qr', async (q, r) => {
  let qr = null;
  if (waState === 'qr' && lastQr) { try { qr = await QRCode.toDataURL(lastQr, { margin: 1, width: 320 }); } catch {} }
  r.json({ state: waState, qr, pairCode });
});
app.post('/pair', async (req, res) => {
  const phone = digits(normPhone(req.body && req.body.phone));
  if (!phone) return res.status(400).json({ error: 'phone required' });
  if (MOCK) return res.json({ code: 'MOCK-1234' });
  if (!sock || waState === 'open') return res.status(409).json({ error: 'Already connected or not ready' });
  try { pairCode = await sock.requestPairingCode(phone); res.json({ code: pairCode }); }
  catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});
app.post('/logout', async (q, r) => {
  try { if (sock) await sock.logout(); } catch {}
  try { fs.rmSync(path.join(DATA, 'auth'), { recursive: true, force: true }); } catch {}
  waState = 'closed'; me = null;
  if (!MOCK) { try { sock && sock.end(undefined); } catch {} starting = false; setTimeout(startWA, 500); }
  r.json({ ok: true });
});
app.post('/send', async (req, res) => {
  const { to, message } = req.body || {};
  if (!to || !message) return res.status(400).json({ error: 'to and message required' });
  const num = normPhone(to);
  if (optout.has(num)) return res.status(409).json({ error: 'opted out' });
  try { await sendText(toJid(to), message); addMsg({ jid: toJid(to), number: num, dir: 'out', text: message }); res.json({ ok: true }); }
  catch (e) { res.status(502).json({ error: String(e.message || e) }); }
});
app.post('/bulk', (req, res) => {
  if (Q.status === 'running' || Q.status === 'paused') return res.status(409).json({ error: 'A queue is already active. Stop it first.' });
  const { items, delaySec } = req.body || {};
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items required' });
  const seen = new Set();
  Q = {
    status: 'running', note: '', startedAt: now(), nextAt: 0,
    delaySec: Math.max(10, parseInt(delaySec, 10) || 30),
    items: items.filter(i => i && i.to && i.message).map(i => ({ to: normPhone(i.to), name: i.name || '', doctor: i.doctor || '', visit: i.visit || '', message: String(i.message), status: 'pending', err: '', at: 0 }))
      .filter(i => i.to && !seen.has(i.to) && seen.add(i.to))
  };
  Q.items.forEach(i => { if (i.name || i.doctor) registry[i.to] = { name: i.name, doctor: i.doctor, visit: i.visit }; }); save('registry.json', registry);
  saveQ(); queueLoop();
  res.json({ ok: true, total: Q.items.length });
});
app.get('/bulk', (q, r) => r.json({ status: Q.status, note: Q.note, delaySec: Q.delaySec, nextInSec: Q.nextAt ? Math.max(0, Math.ceil((Q.nextAt - now()) / 1000)) : 0, stats: qStats(), items: Q.items.map(i => ({ to: i.to, status: i.status, err: i.err })) }));
app.post('/bulk/pause', (q, r) => { if (Q.status === 'running') Q.status = 'paused'; saveQ(); r.json({ ok: true, status: Q.status }); });
app.post('/bulk/resume', (q, r) => { if (Q.status === 'paused' || Q.status === 'stopped') { Q.status = 'running'; Q.note = ''; saveQ(); queueLoop(); } r.json({ ok: true, status: Q.status }); });
app.post('/bulk/stop', (q, r) => { if (Q.status === 'running' || Q.status === 'paused') Q.status = 'stopped'; saveQ(); r.json({ ok: true, status: Q.status }); });
app.post('/registry', (req, res) => {
  const rows = (req.body && req.body.rows) || [];
  rows.forEach(r => { const n = normPhone(r.number || r.to); if (n) registry[n] = { name: r.name || '', doctor: r.doctor || '', visit: r.visit || '' }; });
  save('registry.json', registry); res.json({ ok: true, total: Object.keys(registry).length });
});
app.get('/config', (q, r) => r.json(cfg));
app.post('/config', (req, res) => {
  const b = req.body || {};
  for (const k of Object.keys(cfg)) if (b[k] !== undefined && typeof b[k] === typeof cfg[k]) cfg[k] = b[k];
  for (const k of ['handoffKeywords', 'optoutKeywords']) if (Array.isArray(b[k])) cfg[k] = b[k].map(String).map(s => s.toLowerCase().trim()).filter(Boolean);
  saveCfg(); kbCache.at = 0; res.json(cfg);
});
app.get('/inbox', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 300, 1000);
  res.json(messages.slice(-limit));
});
app.post('/inbox/handled', (req, res) => {
  const n = digits(req.body && req.body.number);
  messages.forEach(m => { if (m.number === n && m.dir === 'in') m.handled = true; });
  save('messages.json', messages); res.json({ ok: true });
});
app.post('/reply', async (req, res) => {
  const { to, message } = req.body || {};
  if (!to || !message) return res.status(400).json({ error: 'to and message required' });
  try {
    const jid = (req.body && req.body.jid) || toJid(to);
    await sendText(jid, message);
    addMsg({ jid, number: normPhone(to), dir: 'out', text: message, manual: true });
    const n = normPhone(to); messages.forEach(m => { if (m.number === n && m.dir === 'in') m.handled = true; });
    res.json({ ok: true });
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
});
app.get('/optout', (q, r) => r.json([...optout]));
app.delete('/optout/:n', (req, res) => { optout.delete(normPhone(req.params.n)); save('optout.json', [...optout]); res.json({ ok: true }); });
if (MOCK) app.post('/_mock/incoming', async (req, res) => {
  const { number, text, name, audio, image } = req.body; const jid = normPhone(number) + '@s.whatsapp.net';
  const p = { jid, number: normPhone(number), name: name || '', text: text || '' };
  if (audio) p.audio = { buf: Buffer.from(audio, 'base64'), mime: 'audio/ogg' };
  if (image) { p.image = { mime: 'image/jpeg', data: image }; p.hasImage = true; }
  if (!text && !audio && !image) p.hasMedia = true;
  await handleIncoming(p); res.json({ ok: true });
});

const PAGE = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Baxnaano WhatsApp Gateway</title>
<body style="font-family:system-ui;max-width:460px;margin:2rem auto;padding:0 1rem"><h2>Baxnaano WhatsApp Gateway</h2>
<p>Token: <input id=t style="width:70%"> <button onclick="go()">Open</button></p><div id=o></div>
<script>
const q=new URLSearchParams(location.search);const T=q.get('token')||localStorage.gwt||'';document.getElementById('t').value=T;
function go(){localStorage.gwt=document.getElementById('t').value;location.search='?token='+document.getElementById('t').value}
async function tick(){if(!T)return;try{const s=await (await fetch('/qr?token='+T)).json();const o=document.getElementById('o');
if(s.state==='open')o.innerHTML='<b style="color:green">Connected</b>';else if(s.qr)o.innerHTML='<p>Scan in WhatsApp > Linked devices > Link a device</p><img src="'+s.qr+'">'+(s.pairCode?'<h3>'+s.pairCode+'</h3>':'');else o.textContent='State: '+s.state;}catch(e){}}
setInterval(tick,2000);tick();
</script></body>`;

app.listen(PORT, () => {
  console.log('\nBaxnaano WhatsApp Gateway running on port ' + PORT + (MOCK ? ' (MOCK MODE)' : ''));
  console.log('TOKEN: ' + TOKEN);
  console.log('Open http://localhost:' + PORT + '/?token=' + TOKEN + ' to link WhatsApp.\n');
});
if (Q.status === 'paused' && Q.items.some(i => i.status === 'pending')) { /* waits for Resume */ }
startWA();
process.on('unhandledRejection', e => log.error(e));
process.on('uncaughtException', e => log.error(e));
