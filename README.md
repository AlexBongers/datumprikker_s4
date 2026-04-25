# Datumprikker

Een rustige, lokale webapp om samen een datum te kiezen. Organisatoren maken een event met opties, delen persoonlijke links en kiezen daarna de beste datum.

## Lokaal gebruiken

```bash
npm ci
cp .env.example .env
npm run local
```

Open daarna <http://localhost:3000>.

De data wordt lokaal opgeslagen in `./data/datumprikker.db`.

## Stack

- Node.js + Express
- EJS templates
- better-sqlite3
- eigen CSS design system
- Node test runner (`node --test`)

## Tests

```bash
npm test
```

## Wat de app doet

- organizer-dashboard met beste datumopties
- persoonlijke uitnodigingslinks per deelnemer
- vier beschikbaarheidsniveaus
- definitieve datum vastzetten + `.ics` export
- eenvoudige activiteitshistorie

## Belangrijke routes

- `/` landing page
- `/admin/login` organizer login
- `/admin/dashboard` eventoverzicht
- `/admin` nieuw event
- `/health` health endpoint
- `/events/respond/:token` persoonlijke uitnodiging voor deelnemers

## Omgevingsvariabelen

| Variabele | Betekenis |
| --- | --- |
| `PORT` | Poort van de Express app |
| `NODE_ENV` | `development` of `production` |
| `SESSION_SECRET` | Secret voor sessiecookies |
| `DATABASE_PATH` | Locatie van de SQLite database |
| `ADMIN_PASSWORD` | Wachtwoord voor organizer login |
| `BASE_URL` | Publieke basis-URL voor share links |
