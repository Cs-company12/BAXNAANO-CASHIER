# Baxnaano WhatsApp Gateway

## Bilaabid (Termux, taleefanka Android) — 3 tallaabo
1. `pkg install unzip -y && unzip baxnaano-wa-gateway.zip && cd baxnaano-wa-gateway`
2. `bash start.sh` (waxay kuu weydiin doontaa furaha Gemini hal mar: aistudio.google.com, bilaash)
3. Browser-ka ku fur **http://localhost:3000** (bogga isku xirka WhatsApp: geli lambarka > koodka). Kadib **Fur system-ka** (/app) — is-xiranayaa.

## Isku xirka WhatsApp
Tab-ka **WhatsApp** > geli lambarka isbitaalka > **Get code** > WhatsApp > Linked devices > Link a device > **Link with phone number instead** > geli koodka. (Haddii aad laba taleefan haysato, QR-ka scan garee.)

## Waxay sameysaa
Fariimaha 30 sekan ku dirta (server-ka dhexdiisa), qoraal/voice/sawir Gemini ayaa fahmaya oo ka jawaabaya, inbox, STOP, calaamadda "Needs human".

## Server (VPS / Docker)
`docker build -t bax-wa . && docker run -d -p 3000:3000 -v bax_wa:/data -e GEMINI_API_KEY=... bax-wa`. Ku dar HTTPS; kadibna system-ka geli URL + token gacanta.

## Digniin
WhatsApp waxay xiri kartaa lambarka haddii la diro fariimo badan oo aan la codsan. Bilow xadka maalinlaha ah 200–300 (tab-ka WhatsApp). Termux waa la dili karaa Android; VPS ayaa ka xasiloon.
