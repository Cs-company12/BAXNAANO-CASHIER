# Baxnaano WhatsApp Gateway

Waxay sameysaa: (1) ku xirta WhatsApp-ka isbitaalka QR ama pairing code, (2) fariimaha ku dirta 30 sekan kasta (server-ka gudihiisa, boggu xirmo wuu sii shaqeeyaa), (3) fariimaha soo galaya (qoraal, **voice note**, sawir) Gemini ayaa fahmaya oo ka jawaabaya, iyadoo la raacayo xeerarka Baxnaano (degdeg, saacadaha, dhakhaatiirta joogitaankooda, qiimaha -> Cashier), (4) inbox iyo jawaab gacanta ah, (5) "STOP" = bukaanka mar dambe lama diro.

## Ku shaqeynta Termux (taleefankaaga Android)
```
pkg update && pkg install nodejs unzip -y
unzip baxnaano-wa-gateway.zip && cd baxnaano-wa-gateway
npm install
node server.js
```
Ka hor bilaabista, geli furahaaga Gemini (waxaa lagu helaa aistudio.google.com, bilaash):
```
export GEMINI_API_KEY="AIza..."
node server.js
```
Furahan la'aantiis bot-ku wuxuu u shaqaynayaa qoraal oo keliya (CS AI function); **voice note-ka iyo sawirrada** waxay u baahan yihiin GEMINI_API_KEY.

Marka ugu horreysa waxay soo bandhigaysaa **TOKEN**. Ku qor system-ka: tab-ka **WhatsApp** -> URL `http://localhost:3000` + token -> Connect.

Taleefan keliya haddii aad leedahay, QR-ka naftaada ma scan gareysan kartid. Isticmaal **"Link with phone number"** (pairing code): geli lambarka WhatsApp-ka, kadibna WhatsApp > Linked devices > Link with phone number > geli koodka.

## Server (VPS / Docker)
`docker build -t bax-wa . && docker run -d -p 3000:3000 -v bax_wa:/data bax-wa` (volume-ku wuxuu ilaaliyaa login-ka). Ku dar HTTPS (Caddy/nginx) haddii system-ku ka furan yahay https.

## Digniin
- WhatsApp ma oggola fariimo badan oo aan la codsan: lambar waa la xiri karaa. Hay ugu yaraan 30 sekan, hay xadka maalinlaha ah (default 1000, hoos u dhig 200-300 bilowga), oo ha diraynin kuwa aan ku ogayn.
- Termux waa la dili karaa Android: server/VPS ayaa ka sii xasiloon.
