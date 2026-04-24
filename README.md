# Datumprikker Matchmaker

Een volledig herwerkte datumprikker voor groepen, interviews en samenwerkingen. Organisatoren maken events met meerdere datumopties, nodigen deelnemers uit via persoonlijke links en zien automatisch welke optie de beste matchscore heeft.

## Hoogtepunten

- duidelijk organizer-dashboard met status, reacties en beste datumoptie
- persoonlijke uitnodigingslinks per deelnemer
- vier beschikbaarheidsniveaus: voorkeur, beschikbaar, indien nodig, niet mogelijk
- ranking-engine met transparante score en verplichte deelnemers
- definitieve datum vastzetten + `.ics` export
- Render.com Blueprint met persistente SQLite-disk
- activiteitsoverzicht en eenvoudige reminder-markering

## Stack

- Node.js + Express
- EJS templates
- better-sqlite3
- eigen CSS design system
- Node test runner (`node --test`)

## Lokaal starten

```bash
npm ci
cp .env.example .env
npm start
```

Open daarna <http://localhost:3000>.

## Tests

```bash
npm test
```

## Render deploy

1. Push de branch naar GitHub.
2. Maak in Render een nieuw Blueprint deploy aan voor deze repository.
3. Vul `BASE_URL` in met je Render URL.
4. Laat Render `SESSION_SECRET` en `ADMIN_PASSWORD` genereren.
5. Deploy — de database wordt persistent opgeslagen op `/data/datumprikker.db`.

## Belangrijke routes

- `/` landing page
- `/admin/login` organizer login
- `/admin/dashboard` eventoverzicht
- `/admin` nieuw event
- `/health` health endpoint voor Render
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
