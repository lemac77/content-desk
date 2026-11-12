# Content Desk

Web app installabile (PWA) per gestire i contenuti social dei clienti: reel di ispirazione e altri topic, con spunta "fatto". Funziona da browser e da iPhone, con sync via Supabase.

## 1. Provala subito in locale

```bash
python3 -m http.server 8080
```

Apri http://localhost:8080. Senza Supabase configurato i dati restano nel browser.

## 2. Attiva il sync (browser + iPhone)

1. Crea un progetto gratis su supabase.com.
2. SQL Editor: incolla tutto `supabase.sql` e premi Run.
3. Authentication > Providers > Email: per fare in fretta disattiva "Confirm email".
4. Project Settings > API: copia `Project URL` e la chiave `anon public`.
5. Incollali in `config.js`.
6. Riapri l'app: compare il login. Crea il tuo account e sei dentro.

La anon key e' pubblica per design. I dati sono protetti dalle policy RLS: ognuno vede solo le righe del proprio account.

## 3. Mettila su GitHub Pages

```bash
git init && git add . && git commit -m "Content Desk"
gh repo create content-desk --public --source=. --push
```

Poi su GitHub: Settings > Pages > Deploy from a branch > `main` / root.
L'indirizzo sara' `https://TUOUSER.github.io/content-desk/`.

Il repo e' pubblico ma i dati no: stanno su Supabase dietro login.

## Keep-alive Supabase

Il piano gratuito mette in pausa il progetto dopo 7 giorni di inattivita. Il workflow `.github/workflows/keepalive.yml` fa una query leggera ogni 3 giorni leggendo URL e chiave da `config.js` (nessun secret da impostare). Se `config.js` e' vuoto non fa nulla. Lancialo a mano da GitHub > Actions > Supabase keep-alive > Run workflow.

GitHub sospende i cron dopo 60 giorni senza commit nel repo: se succede, basta un push per riattivarlo.

## 4. iPhone

Apri l'indirizzo in Safari, tocca Condividi, poi "Aggiungi alla schermata Home". Si apre a schermo intero come un'app.

## File

| File | A cosa serve |
|------|--------------|
| `index.html`, `style.css`, `app.js` | l'app |
| `config.js` | chiavi Supabase |
| `supabase.sql` | tabelle e sicurezza |
| `manifest.webmanifest`, `sw.js`, `*.png` | installazione e offline |
