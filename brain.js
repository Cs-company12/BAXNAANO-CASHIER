// Baxnaano "brain": deterministic safety/routing rules + the Gemini system prompt.
// Rebuilt from the old index2.js (kept: hours, doctors, numbers, emergency priority, truth rules).
export const NUM_CC = '0613490055';        // Customer Care / Cashier / appointments
export const NUM_PHARM = '0770844167';     // Pharmacy
export const NUM_YAXYE = '0610923020';     // Dr. Yaxye direct
export const LINK = 'https://baxnaano.com/';
export const HOURS_TEXT = '06:30 subaxnimo ilaa 20:00 fiidnimo';

const SO_DAYS = { Saturday: 'Sabti', Sunday: 'Axad', Monday: 'Isniin', Tuesday: 'Talaado', Wednesday: 'Arbaco', Thursday: 'Khamiis', Friday: 'Jimce' };

// Official clock: Africa/Mogadishu. Open Saturday-Thursday 06:30-20:00, Friday closed.
export function workday(dayOffset = 0, base = new Date()) {
  const d = new Date(base.getTime() + dayOffset * 86400000);
  const weekdayEn = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Mogadishu', weekday: 'long' }).format(d);
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Mogadishu', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const p = k => (parts.find(x => x.type === k) || {}).value || '00';
  const mins = Number(p('hour')) * 60 + Number(p('minute'));
  const isWorkingDay = weekdayEn !== 'Friday';
  const withinHours = mins >= 390 && mins < 1200;
  return { date: d, weekdayEn, weekdaySo: SO_DAYS[weekdayEn] || weekdayEn, timeText: `${p('hour')}:${p('minute')}`, isWorkingDay, withinHours, isOpenNow: dayOffset === 0 && isWorkingDay && withinHours, hoursText: HOURS_TEXT };
}

export function norm(t) {
  return String(t || '').toLowerCase().replace(/[’‘`]/g, "'").replace(/([a-z])\1{2,}/g, '$1$1').replace(/\s+/g, ' ').trim();
}
const has = (re, t) => re.test(t);

// ---------- emergency ----------
const EMERGENCY = [
  /neef\s*(qabsi|la'?aan|ma\s*qaad\w*|ku\s*adk\w*|xanuun\w*\s*culus)|neefta?\s+ku\s+adk\w*|neefsashada?\s+(ku\s+adk\w*|dhib\w*)|can'?t\s+breathe|difficulty\s+breathing/,
  /suux\w*|miyir[\s-]*beel|lumay\s+miyirka|miyirka\s+(ayuu|ayay|buu|bay)?\s*(lumay|waayay)|unconscious|fainted/,
  /\bqalal\w*|gariir\s+(culus|xoog)|seizure|convuls\w*/,
  /dhiig[\s-]*(bax\w*|ka\s+baxaya|ka\s+yimid)\s*(aad\s+u\s+|xoog|badan|joogto|joogsan\s+waayay)?.{0,30}(badan|xoog|joogsan\s+waa\w*|aad\s+u)|dhiigbax\s+(xoog|culus|badan)|dhiig\s+badan\s+(ayuu|ayay|buu|bay|ayaa)/,
  /wadne[\s-]*xanuun|laabta?\s+.{0,25}(xanuun\w*|cadaadis\w*|ku\s+xidhan|culus)|chest\s+pain|heart\s+attack/,
  /(wej\w*|af\w*|bushim\w*).{0,25}qalooc\w*.{0,40}(kedis|hadda|maanta|subaxdii)|hal\s+(dhinac|gacan|lug).{0,30}(daciif|kabuub|tabar\s*darr\w*).{0,30}(kedis|hadda|maanta)|faalig\s+(kedis|hadda)|stroke/,
  /dhaawac\s*culus|shil\s*(culus|gaari|baabuur)|ruxay\s+shil|rasaas|mindi\s+lagu\s+(mudey|dhuftay)|gubasho\s+culus/,
  /kaadi.{0,40}(celin|xakam\w*|joogsan\s+waa\w*)|saxaro.{0,40}(celin|xakam\w*)|lugaha?.{0,35}(daciif|tabar\s*darr\w*|kabuub\w*).{0,40}(kedis|hadda|maanta|dhabar)/,
  /ilmaha?.{0,40}(qandho\s+(aad\s+u\s+)?(sar|kulul|culus)|ma\s+(cabbayo|nuugayo)|bukaan\s+culus|is\s+ma\s+dhaqaajiyo)/,
  /dawo\s+(badan\s+)?(cabbay|cab\w+)\s+(oo\s+)?(dhan|badan)|poison|sunteed|sun\s+cab\w*/
];
const CRISIS = /is\s*dil\w*|isdil\w*|naftayda\s+(dili|dil\w*)|dhimasho\s+(rabaa|doonayaa)|ma\s+rabo\s+(inaan\s+)?noolaado|kill\s+myself|suicid\w*/;

export function emergencyReply(text) {
  const t = norm(text);
  if (!t) return null;
  if (has(CRISIS, t)) {
    return 'Walaal, waan ka xumahay inaad sidaas dareemayso, adigu muhiim ayaad tahay. Fadlan kaligaa ha ahaan: hadda qof aad ku kalsoon tahay (qoys ama saaxiib) u sheeg oo la joog, oo isbitaalka ugu dhow ama qaybta gurmadka u tag isla markiiba. Haddii aad halis ku jirto hadda, wac gargaar degdeg ah.';
  }
  if (EMERGENCY.some(re => re.test(t))) {
    return 'Walaal, calaamadaha aad sheegtay waxay u baahan yihiin gargaar degdeg ah. Fadlan isla markiiba u tag qaybta gurmadka degdegga ah ee isbitaalka ugu dhow (ama Baxnaano Hospital haddii aad dhow tahay), hana sugin ballan caadi ah. Haddii aad awoodid, qof ku raac.';
  }
  return null;
}

// ---------- availability of named doctors ----------
const DOC = {
  harith: { name: 'Dr. Harith', role: 'dhakhtarka neerfaha', re: /\b(?:harith|haris|haarith|xaaris|xaarith|xaris|xariis|xaariis)\b/ },
  yaxye: { name: 'Dr. Yaxye', role: 'dhakhtarka carruurta', re: /\b(?:yaxye|yahye|yaxyee|yahyee|yahya|yaxya|shoole|shole)\b/ }
};
const PRESENCE = /(?:jo+g+|maq[a-z]*|fasax|shaq[a-z]*|qaabil[a-z]*|imaan\w*|yimaad\w*|soo\s+laab\w*)/;
const TOMORROW = /\b(?:berri|biri|bari|beriye)\b/;

function onLeave(status, untilRaw, dayDate) {
  const s = String(status || 'available').toLowerCase();
  let leave = ['away', 'leave', 'fasax', 'maqan', 'absent'].includes(s);
  if (untilRaw) { const u = new Date(untilRaw); if (!Number.isNaN(u.getTime())) leave = dayDate < u; }
  return leave;
}

export function doctorPresenceReply(text, cfg, base = new Date()) {
  const t = norm(text);
  let key = null;
  for (const k of Object.keys(DOC)) if (DOC[k].re.test(t)) key = k;
  if (!key && /\b(?:neerf\w*|nerf\w*|neurolog\w*)\b/.test(t) && PRESENCE.test(t)) key = 'harith';
  if (!key) return null;
  if (!(PRESENCE.test(t) || TOMORROW.test(t))) return null;
  const d = DOC[key];
  const tomorrow = TOMORROW.test(t);
  const day = workday(tomorrow ? 1 : 0, base);
  const status = key === 'harith' ? cfg.harithStatus : cfg.yaxyeStatus;
  const until = key === 'harith' ? cfg.harithLeaveUntil : cfg.yaxyeLeaveUntil;
  const book = `${LINK} ama wac ${NUM_CC}`;
  if (onLeave(status, until, day.date)) return `Walaal, ${d.name} hadda wuxuu ku maqan yahay fasax. Faahfaahinta soo laabashadiisa ka hubi Customer Care-ka ${NUM_CC}.`;
  if (!day.isWorkingDay) return `Walaal, ${tomorrow ? 'berri' : 'maanta'} waa Jimce, maalintaasna isbitaalku wuu xiran yahay. Ballanta maalinta shaqada xigta ka qabsado ${LINK}.`;
  if (!tomorrow && !day.isOpenNow) return `Walaal, hadda waa ${day.weekdaySo}, saacaddu waa ${day.timeText}. Isbitaalku wuxuu shaqeeyaa Sabti ilaa Khamiis, ${HOURS_TEXT}; hadda waa ka baxsan yahay waqtigaas. Ballan ka qabsado ${LINK}.`;
  if (['unknown', 'checking', 'unconfirmed'].includes(String(status || '').toLowerCase())) {
    return `Walaal, ${day.weekdaySo} isbitaalku wuxuu shaqeeyaa ${HOURS_TEXT}, laakiin xaaladda gaarka ah ee ${d.name} lama xaqiijin. Ballan ka qabsado ${book}.`;
  }
  if (tomorrow) return `Haa walaal, berri waa ${day.weekdaySo}; isbitaalku wuxuu furan yahay ${HOURS_TEXT}. Ballanta ${d.name} (${d.role}) ka qabsado ${book}.`;
  return `Haa walaal, ${d.name} wuu joogaa. Haddii aad rabto inaad la kulanto, ballanta ka qabsado ${book}.`;
}

// ---------- other direct routes ----------
export function directRoute(text, cfg, kbSettings = {}) {
  const t = norm(text);
  if (!t) return null;

  // Online consultation ($20)
  if (/(?:\bonline\b|fogaan[\s-]*arag)/.test(t) && /(?:consult\w*|la[\s-]*tashi|dhakhtar|adeeg|caafimaad|jiraa?|jiraan|helaa|qiim\w*|lacag|ma\s*jir)/.test(t)) {
    return `Haa walaal, Baxnaano Hospital waxay leedahay adeeg Online Consultation oo qiimihiisu yahay $20. Waxaa laguugu hagaajin karaa Dr. Harith (Neerfaha) ama Dr. Yaxye (carruurta), iyadoo ku xiran baahidaada. Fadlan wac Customer Care ${NUM_CC} si laguu hago.`;
  }

  // Child doctor number / booking
  const child = /\b(carruur\w*|caruur\w*|ilmo|pediatric\w*)\b/.test(t);
  const wantsNumber = /\b(?:lambar\w*|number\w*|nambar\w*|telefoon|phone|contact)\b/.test(t) || /(?:number|nambar|lambar)\s*(?:kiisa|kisa|keeda)/.test(t);
  const yaxyeNamed = DOC.yaxye.re.test(t);
  const booking = /\b(ballan|balan|booking|appointment|qaabilaad)\b/.test(t);
  const queue = /(?:\b(?:ii|iiga|iga|iigu|soo)\s*(?:jar|jaro|jari|jarto)\b)/.test(t);
  if ((child || yaxyeNamed) && wantsNumber) {
    if (booking || queue) return `Walaal, ballanta Dr. Yaxye waxaad ka qabsan kartaa ${LINK} ama waxaad wici kartaa ${NUM_CC}.`;
    const direct = /\b(?:ii|iigu|iiga|isoo)\s*(?:soo\s*)?dir\b|\bsoo\s+dir\b|\bla\s+hadl\w*|\bla\s*(?:xiriir|xariir)\w*|su'?aal.{0,60}weydi\w*/.test(t);
    return direct ? `Waa hagaag walaal, lambarka Dr. Yaxye Shoole waa ${NUM_YAXYE}.` : `Walaal, numberka ballanta Dr. Yaxye waxaad ka qabsan kartaa ${LINK}. Haddii link-gu kugu adkaado, wac Customer Care ${NUM_CC}.`;
  }

  // Spine / back pain -> Dr. Harith
  if (/(?:laf[\s-]*dhabar\w*|lafta[\s-]*dhabar\w*|dhabar[\s-]*xanuun\w*|dhabarka?\s+(?:ayaa|ayuu|ayay)?\s*(?:i\s+)?xanuun\w*|spine|sciatica|sciatic|disc[\s-]*prolapse)/.test(t) && !PRESENCE.test(t)) {
    return `Walaal, xanuunka dhabarka ama lafdhabarta waxaad kala tashan kartaa Dr. Harith Abdulkadir (Neerfaha). Ballan waxaad ka qabsan kartaa ${LINK} ama waxaad wici kartaa ${NUM_CC}.`;
  }

  // Pharmacy contact (only when the patient asks for the pharmacy number/contact)
  if (/(?:farmash\w*|farmasi\w*|pharmacy|dawo(?:yin)?\s*(?:dukaan|bakhaar))/.test(t) && /\b(?:lambar\w*|number\w*|nambar\w*|telefoon|phone|contact|wac\w*|la\s*xiriir\w*)\b/.test(t)) {
    const hrs = kbSettings.pharmacy_hours ? ` Saacadaha: ${kbSettings.pharmacy_hours}.` : '';
    return `Walaal, lambarka Pharmacy-ga Baxnaano waa ${NUM_PHARM}.${hrs}`;
  }

  // Price -> cashier (never quote prices from the bot)
  if (/(?:qiim\w*|lacag\w*|immisa|imisa|kharash\w*|\bfee\b|price|cost|how\s+much|\bkoob\b)/.test(t) && !/\bonline\b/.test(t) && !/(?:number|numberka|lambar\w*).{0,15}(?:1\s*bil|bil|muddo)/.test(t)) {
    return `Walaal, qiimaha adeegga ama dhakhtarka Cashier-ka ayaa si sax ah kuu sheegi kara. Fadlan wac ${NUM_CC}.`;
  }

  // Hospital hours
  if (/(?:saac\w*|goorma\s+(?:la\s+)?(?:furan|xiran|fur\w*|xir\w*|shaq\w*)|furan\s+(?:yahay|tahay|yihiin)|xiran\s+(?:yahay|tahay)|waqtiga\s+(?:shaqada|furitaanka)|open|opening|closing|hours)/.test(t) && !DOC.harith.re.test(t) && !DOC.yaxye.re.test(t) && !/farmash|farmasi|pharmacy/.test(t)) {
    const d = workday(0);
    const nowTxt = d.isOpenNow ? 'Hadda isbitaalku wuu furan yahay.' : (d.isWorkingDay ? 'Hadda waa ka baxsan yahay waqtiga shaqada.' : 'Maanta waa Jimce, isbitaalku wuu xiran yahay.');
    return `Walaal, Baxnaano Hospital wuxuu shaqeeyaa Sabti ilaa Khamiis, ${HOURS_TEXT}. Jimce waa xiran yahay. ${nowTxt}`;
  }
  return null;
}

// ---------- Gemini system prompt ----------
export const STATIC_KB = `DHAKHAATIIRTA BAXNAANO (Muqdisho):
- Dr. Harith Abdulkadir Sheikh Mohamud: Neerfaha (neurology) - madax xanuun, qalal, suuxdin, kabuub, dhabar/lafdhabar, xasuus, wareer.
- Dr. Yaxye Shoole: carruurta, caloosha iyo bateriga carruurta (pediatric gastroenterology).
- Sadia Omar Salim: Cilmi-nafsiga iyo daawaynta hadalka (psychology & speech therapy), tusaale hadal-dib-u-dhac carruurta.
- Dr. A. Y. Hersi: Dhakhtarka guud (internal medicine).
- Dr. Mohamed Saney Abdi: Dhegaha, sanka iyo cunaha (ENT).
ADEEGYADA: Online Consultation $20 (Dr. Harith ama Dr. Yaxye).
LAMBARADA: Customer Care/Cashier/ballanta ${NUM_CC}; Pharmacy ${NUM_PHARM}. Ballan online: ${LINK}
SAACADAHA: Sabti ilaa Khamiis ${HOURS_TEXT}; Jimce waa xiran yahay.`;

export function buildSystem({ kb = '', cfg = {}, patient = null, outbound = null, voice = false, now = new Date() }) {
  const d = workday(0, now);
  const live = `HADDA: ${d.weekdaySo}, saacaddu waa ${d.timeText} (Muqdisho). Isbitaalku hadda: ${d.isOpenNow ? 'FURAN' : 'XIRAN'}.`;
  const pat = patient ? `\n[BUKAANKA - xogta diiwaanka lambarkan]\nMagaca: ${patient.name || '?'}\nDhakhtarka booqashadii u dambaysay: ${patient.doctor || '?'}\nBooqashadii u dambaysay: ${patient.visit || '?'}\nXEER: ha u qaadan sidii bukaan cusub; ha weydiin magaca ama dhakhtarka mar kale; ha isticmaalin magac haddii aanu muuqan.\n` : '';
  const out = outbound ? `\n[FARIINTII BAXNAANO HORAY U DIRTAY BUKAANKAN (${outbound.when})]\n"""\n${outbound.text}\n"""\nXEER: fariinta bukaanku hadda soo diray u faham inay noqon karto jawaab ku saabsan fariintan (tusaale "Diyaar waaye", "Dr", "Mahadsanid", "Waan imaanayaa"). Ku xiro. Ha abuurin wax aan fariintaas ku jirin.\n` : '';
  return `Waxaad tahay qaybta Customer Care / Soo Dhaweynta Macaamiisha ee Baxnaano Hospital (Muqdisho), WhatsApp. Waxaad la hadlaysaa bukaan ama qoyskiisa.

SIDA LOO FAHMO FARIINTA (MUHIIM):
- Marka hore faham macnaha fariinta oo dhan iyo wada sheekaysigii hore; ha ku xukumin hal eray. Fariinta hadda timid ayaa mudnaanta leh.
- Faham Af-Soomaaliga caadiga ah, lahjadaha, higgaad-xumada, ereyada Ingiriis iyo Soomaali isku qasan, iyo qoraalka codka laga beddelay (waxaa laga yaabaa inuu khalad yeesho). Haddii macnuhu aanu cadayn, weydii HAL su'aal oo gaaban; ha qiyaasin.
- Haddii bukaanku yiraahdo "Dr", "Diyaar waaye", "Haa", "Mahadsanid", ku xiro wada sheekaysigii hore; ha ku bilaabin "Sideen kuu caawin karaa?".
- Ha ku celcelin salaanta ama jawaabtii hore. Haddii uu xog hore bixiyey, ha weydiin mar kale.

SI AAD U JAWAABTO:
- Af-Soomaali dabiici ah, kooban (ugu badnaan 4-5 sadar), ixtiraam leh, sida shaqaale dhab ah. U jawaab luqadda uu bukaanku isticmaalo (Ingiriis haddii uu Ingiriis qoray).
- Si toos ah uga jawaab su'aasha. Ha u leexan farmashiyaha ama dhakhtar kale haddii aanay ahayn ujeeddada fariinta.
- Ha sheegin "AI baan ahay", "bot", "Gemini" ama hadal farsamo. Ha iska dhigin dhakhtar; haddii la weydiiyo, waxaad tahay Customer Care ee Baxnaano Hospital.

XAQIIQADA (WALIGAA):
- Isticmaal XOGTA ISBITAALKA hoose oo keliya. Ha curin magac, qiime, saacad, ballan, natiijo, daawo ama dhakhtar. Haddii xogta maqan tahay, si daacad ah u sheeg inaadan hubin oo ugu hagid Customer Care ${NUM_CC}, mana ku dari [[HUMAN]].
- QIIMAHA: ha sheegin qiime (ka sokow Online Consultation $20). Qiime kasta Cashier-ka ${NUM_CC} ayaa sheegaya.
- Ha sheegin ficil aanad dhab ahaan samayn ("waan u gudbiyey dhakhtarka", "diiwaankaaga waan helay", "dhakhtarku wuu kuu soo jawaabayaa"). Ha u ballanqaadin jawaab dhakhtar.
- MRI, CT, scan, natiijo ama warqad caafimaad: ha abuurin natiijo. Sawirka bukaanku soo diray ha u fasirin sidii baaritaan; u sheeg in dhakhtar uun uu akhriyi karo.
- "Number", "1 bil", "ballan", "dhacay" ha u qaadan lacag. Ha soo celin saacadaha haddii aan la weydiin.
- Qaybaha: Cashier = lacag/qiime; Pharmacy = dawo (lambarka ${NUM_PHARM} kaliya marka si cad loo codsado); Lab = shaybaar; Doctor = xog caafimaad; Customer Care = ballan iyo adeeg guud. Ballan: ${LINK} ama ${NUM_CC}.
- Dawada: ha qorin dawo ama qiyaas; ha ku talin in la joojiyo ama la beddelo. U sheeg in dhakhtar uun uu go'aamin karo; kala talin la kulanka dhakhtarka.
- Su'aal caafimaad guud: ka jawaab si kooban oo guud, ha baarin xanuun, oo kala tali dhakhtar. Haddii calaamado degdeg ah (neef-qabsi, suuxdin, qalal, dhiig-bax xoog leh, laab xanuun, faalig, dhaawac culus), u sheeg inuu isla markiiba u tago gurmadka oo ku dar [[HUMAN]].
- Haddii uu codsado qof inuu la hadlo, ama cabasho/qoomamo, ku dar [[HUMAN]] (adigoon ballan ka qaadin waqtiga jawaabta).
- Fariin aan la fahmin ama aan macno lahayn: weydii hal su'aal oo kooban.
${cfg.extraRules ? '- ' + cfg.extraRules + '\n' : ''}${voice ? '\nFARIINTAN WAXAY KA TIMID CODKA (voice note); qoraalka waa transcript oo laga yaabo inuu khalad yeesho. Haddii wax aan macno lahayn jiraan, weydii bukaanka inuu cadeeyo.\n' : ''}
${live}
${pat}${out}
XOGTA ISBITAALKA:
${STATIC_KB}

${kb}`.trim();
}
