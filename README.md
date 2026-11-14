# Baxnaano WhatsApp Gateway — online (GitHub + Render), Termux looma baahna

## 1) GitHub (PRIVATE!)
Samee repo **Private** ah (system-ku wuxuu ku jiraa magacyo iyo lambaro bukaan) oo ku soo geli dhammaan faylasha zip-kan (`Add file > Upload files`).

## 2) Render.com
New > **Web Service** > ku xir GitHub repo-ga > Runtime **Docker** > Instance **Starter ($7/bishii)**.
(Free plan wuu hurdaa 15 daqiiqo kadib, WhatsApp-na wuu go'aa.)
Environment Variables ku dar:
- `GATEWAY_TOKEN` = furaha sirta ah ee aad dooratid (dheer)
- `SUPABASE_SERVICE_KEY` = Supabase > Project Settings > API Keys > **service_role** (SIR — ha ku qorin GitHub)
- `GEMINI_API_KEY` = aistudio.google.com

Deploy. Marka uu "Live" noqdo, Render wuxuu ku siinayaa URL (`https://xxxx.onrender.com`).

## 3) Isku xirka WhatsApp
1. Fur URL-ka, geli `GATEWAY_TOKEN`.
2. Geli lambarka WhatsApp > **Get code** > WhatsApp > Linked devices > Link a device > **Link with phone number instead** > geli koodka.
3. Taabo **Fur system-ka** (/app) — isla markiiba waa isku xiran yahay.

Session-ka, safka iyo xusuusta waxay ku kaydsan yihiin Supabase (`wa_gw_state`), markaa dib-u-bilaabid (restart) ma xiraan WhatsApp.

## Digniin
WhatsApp waxay xiri kartaa lambarka haddii fariimo badan oo aan la codsan la diro. Bilow xadka maalinlaha 200–300.
