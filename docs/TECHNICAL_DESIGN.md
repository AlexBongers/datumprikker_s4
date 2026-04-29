# Technisch Design Document – Datumprikker

**Versie:** 2.0  
**Datum:** april 2026  
**Project:** `datumprikker-s4`  
**Repository:** <https://github.com/AlexBongers/datumprikker_s4>

---

## Inhoudsopgave

1. [Projectoverzicht](#1-projectoverzicht)
2. [Doelstellingen](#2-doelstellingen)
3. [Architectuur](#3-architectuur)
4. [Mappenstructuur](#4-mappenstructuur)
5. [Datamodel](#5-datamodel)
6. [Servicelaag](#6-servicelaag)
7. [Rankingalgoritme](#7-rankingalgoritme)
8. [Beveiliging](#8-beveiliging)
9. [Rate limiting](#9-rate-limiting)
10. [Databasemigraties](#10-databasemigraties)
11. [Omgevingsvariabelen](#11-omgevingsvariabelen)
12. [Deployment](#12-deployment)
13. [Testen](#13-testen)
14. [Afhankelijkheden](#14-afhankelijkheden)
15. [Bekende beperkingen en toekomstplannen](#15-bekende-beperkingen-en-toekomstplannen)

---

## 1. Projectoverzicht

Datumprikker is een zelfgehoste webapplicatie waarmee een beheerder events aanmaakt met meerdere datumopties, deelnemers uitnodigt via persoonlijke links, en op basis van de ingezamelde beschikbaarheidsreacties automatisch de beste datum kiest.

Versie 2.0 voegt een **zelfregistratiestroom** toe: organisaties en studenten kunnen via de homepage hun voorkeursmomenten rechtstreeks opgeven, zonder dat er een beheerdersinvite nodig is. De beheerder bekijkt en verwerkt deze aanmeldingen in een apart overzicht.

---

## 2. Doelstellingen

| Doel | Toelichting |
|------|-------------|
| Eenvoud | Geen database-server, geen aparte frontend-build, geen authenticatie voor deelnemers |
| Privacy | Alle data blijft op de eigen server; geen externe diensten buiten Google Fonts / Bootstrap Icons CDN |
| Onderhoudbaarheid | Conventionele Node.js / Express structuur, minimale abstractielagen |
| Betrouwbaarheid | WAL-mode SQLite, transacties voor alle schrijfoperaties, CSRF-bescherming |

---

## 3. Architectuur

```
Browser
  │
  ▼
Express 5 (src/app.js)
  ├─ Global rate limiter (200 req / 15 min)
  ├─ Session middleware (express-session, cookie httpOnly/SameSite)
  ├─ CSRF-controle op alle niet-veilige methoden
  ├─ Static files (public/)
  │
  ├─ Router: /admin        → src/routes/admin.js
  ├─ Router: /events       → src/routes/events.js
  └─ Router: /register     → src/routes/register.js
       │
       ▼
  Service layer
  ├─ src/services/event-service.js
  ├─ src/services/ranking-service.js
  ├─ src/services/registration-service.js
  └─ src/services/activity-service.js
       │
       ▼
  Database (better-sqlite3)
  └─ src/db/database.js  →  SQLite WAL (DATABASE_PATH)
```

### Renderlaag

Alle pagina's worden server-side gerenderd met **EJS**-templates (views/). Er is geen aparte JavaScript-framework-build; clientside JS in `public/js/app.js` is vanilla en verantwoordelijk voor dynamische formulierrijen.

### Opmerking over statelessness

De applicatie is *niet* volledig stateless: elke Node.js-instantie houdt één SQLite-verbinding open. Horizontaal schalen vereist een externe database of sticky sessions.

---

## 4. Mappenstructuur

```
datumprikker_s4/
├── public/
│   ├── css/style.css          # Design system (CSS custom properties, HU-kleurschema)
│   └── js/app.js              # Clientside JS (dynamische rijen, help-dialoog, clipboard)
├── src/
│   ├── app.js                 # Express-applicatie, middleware, routemounting
│   ├── db/
│   │   └── database.js        # DB-initialisatie, schema-definitie, migraties
│   ├── lib/
│   │   └── view-helpers.js    # Opmaakfuncties voor datum/tijd, status
│   ├── routes/
│   │   ├── admin.js           # Beveiligde beheerdersroutes
│   │   ├── events.js          # Publieke event- en uitnodigingsroutes
│   │   └── register.js        # Publieke zelfregistratieroutes
│   └── services/
│       ├── activity-service.js    # Activiteitenlog
│       ├── event-service.js       # CRUD events, invitees, availability
│       ├── ranking-service.js     # Slotscore-algoritme
│       └── registration-service.js# CRUD zelfregistraties
├── tests/
│   └── ranking.test.js        # Unit tests (Node built-in test runner)
├── views/
│   ├── admin/                 # Beheerder-templates
│   │   ├── dashboard.ejs
│   │   ├── edit.ejs
│   │   ├── event.ejs
│   │   ├── index.ejs
│   │   ├── login.ejs
│   │   └── registraties.ejs
│   ├── events/
│   │   ├── public-summary.ejs
│   │   └── show.ejs
│   ├── register/
│   │   └── bevestiging.ejs
│   ├── partials/
│   │   ├── footer.ejs
│   │   └── header.ejs
│   ├── index.ejs
│   ├── 403.ejs / 404.ejs / 500.ejs
├── .env.example
├── Dockerfile
├── package.json
├── render.yaml
└── README.md
```

---

## 5. Datamodel

De database is een SQLite-bestand (standaard `./data/datumprikker.db`, instelbaar via `DATABASE_PATH`).

### 5.1 Tabel `events`

| Kolom | Type | Constraints | Beschrijving |
|-------|------|-------------|--------------|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `title` | TEXT | NOT NULL | Eventnaam |
| `description` | TEXT | | Optionele omschrijving |
| `admin_token` | TEXT | NOT NULL | UUID v4, geheim beheerders-token |
| `timezone` | TEXT | DEFAULT `'Europe/Amsterdam'` | IANA-tijdzone |
| `location_mode` | TEXT | CHECK `('online','onsite')` | Online of op locatie |
| `location_details` | TEXT | | Teams-link, lokaal, adres, etc. |
| `response_deadline` | TEXT | | ISO-8601 datetime, optioneel |
| `status` | TEXT | CHECK `('open','finalized','archived')` | Eventstatus |
| `finalized_slot_id` | INTEGER | FK → `time_slots.id` | Definitief gekozen slot |
| `created_at` | DATETIME | DEFAULT NOW | |
| `updated_at` | DATETIME | DEFAULT NOW | |

### 5.2 Tabel `time_slots`

| Kolom | Type | Constraints | Beschrijving |
|-------|------|-------------|--------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | |
| `event_id` | TEXT | NOT NULL, FK → `events.id` CASCADE | |
| `slot_datetime` | TEXT | NOT NULL | ISO-8601 starttijdstip |
| `slot_end_datetime` | TEXT | | ISO-8601 eindtijdstip (optioneel) |

### 5.3 Tabel `invitees`

| Kolom | Type | Constraints | Beschrijving |
|-------|------|-------------|--------------|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `event_id` | TEXT | NOT NULL, FK → `events.id` CASCADE | |
| `name` | TEXT | NOT NULL | Volledige naam |
| `email` | TEXT | | Optioneel |
| `phone` | TEXT | | Optioneel |
| `organization` | TEXT | | Bedrijf / instelling |
| `role` | TEXT | CHECK `('student','ondernemer')` | Rol van de deelnemer |
| `is_required` | INTEGER | DEFAULT 0 | 1 = verplicht aanwezig voor match |
| `invite_token` | TEXT | NOT NULL UNIQUE | UUID v4, geheime uitnodigingslink |
| `response_note` | TEXT | | Persoonlijke toelichting deelnemer |
| `responded_at` | TEXT | | Tijdstip van laatste reactie |
| `reminder_sent_at` | TEXT | | Tijdstip van gemarkeerde herinnering |
| `created_at` | DATETIME | DEFAULT NOW | |
| `updated_at` | DATETIME | DEFAULT NOW | |

### 5.4 Tabel `availabilities`

| Kolom | Type | Constraints | Beschrijving |
|-------|------|-------------|--------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | |
| `invitee_id` | TEXT | NOT NULL, FK → `invitees.id` CASCADE | |
| `slot_id` | INTEGER | NOT NULL, FK → `time_slots.id` CASCADE | |
| `availability` | TEXT | CHECK `('preferred','available','if_needed','unavailable')` | Beschikbaarheidsniveau |
| `updated_at` | DATETIME | DEFAULT NOW | |
| | | UNIQUE(`invitee_id`, `slot_id`) | |

### 5.5 Tabel `activity_log`

| Kolom | Type | Constraints | Beschrijving |
|-------|------|-------------|--------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | |
| `event_id` | TEXT | NOT NULL, FK → `events.id` CASCADE | |
| `actor_label` | TEXT | NOT NULL | Naam of rol van de actor |
| `action` | TEXT | NOT NULL | Actiesleutel (bijv. `event_created`) |
| `details` | TEXT | | Leesbare omschrijving |
| `created_at` | DATETIME | DEFAULT NOW | |

### 5.6 Tabel `self_registrations`

| Kolom | Type | Constraints | Beschrijving |
|-------|------|-------------|--------------|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `role` | TEXT | NOT NULL, CHECK `('student','ondernemer')` | Rol van de aanmelder |
| `name` | TEXT | NOT NULL | Naam contactpersoon |
| `email` | TEXT | | Optioneel |
| `phone` | TEXT | | Optioneel |
| `organization` | TEXT | | Organisatienaam (verplicht voor ondernemer) |
| `notes` | TEXT | | Vrije toelichting |
| `preferred_slots` | TEXT | NOT NULL DEFAULT `'[]'` | JSON-array van `{start, end}` objecten |
| `status` | TEXT | NOT NULL, CHECK `('pending','matched','archived')` | Verwerkingsstatus |
| `created_at` | DATETIME | DEFAULT NOW | |

### 5.7 Tabel `responses` (legacy)

De tabel `responses` bestaat nog voor achterwaartse compatibiliteit met data van vóór versie 2.0. Bij opstarten worden alle rijen automatisch gemigreerd naar `invitees` + `availabilities`.

---

## 6. Servicelaag

### 6.1 `event-service.js`

Verantwoordelijk voor alle CRUD-operaties op events, time_slots, invitees en availabilities.

| Functie | Beschrijving |
|---------|-------------|
| `createEvent(payload)` | Maakt event, time_slots en invitees aan in één transactie. Retourneert `{ eventId, adminToken }` |
| `updateEvent(eventId, payload)` | Vervangt title/description/location/slots. Verwijdert alle bestaande time_slots + availabilities en maakt nieuwe aan |
| `deleteEvent(eventId)` | Verwijdert event en alle gerelateerde rijen (CASCADE + activity_log) |
| `duplicateEvent(eventId)` | Kopieert event, slots en invitees naar een nieuw event |
| `getEventWithDetails(eventId)` | Laadt event, slots, invitees, availabilities, gerangschikte slots en statistieken |
| `getDashboardData()` | Lijst alle events met aggregated statistics |
| `getEventByAdminToken(eventId, token)` | Valideert beheerderstoegang |
| `addInvitee(eventId, payload)` | Voegt deelnemer toe aan bestaand event |
| `removeInvitee(eventId, inviteeId)` | Verwijdert deelnemer inclusief availabilities |
| `getInviteeByToken(token)` | Laadt deelnemer, event, slots en bestaande beschikbaarheid via uitnodigingstoken |
| `saveInviteeAvailability(inviteeId, payload)` | Overschrijft alle availabilities van een deelnemer in één transactie |
| `finalizeEvent(eventId, slotId)` | Zet status op `finalized`, slaat `finalized_slot_id` op |
| `setEventStatus(eventId, status)` | Wijzigt status naar `open` of `archived` |
| `markReminder(eventId)` | Markeert `reminder_sent_at` voor alle niet-gereageerde invitees |
| `validateEventInput(payload)` | Valideert titel en aanwezigheid van ≥1 datumoptie |

### 6.2 `ranking-service.js`

Puur functioneel, geen database-toegang. Zie [sectie 7](#7-rankingalgoritme).

### 6.3 `registration-service.js`

| Functie | Beschrijving |
|---------|-------------|
| `validateRegistration(payload, role)` | Valideert naam, organisatienaam (ondernemer) en ≥1 slot |
| `createRegistration(payload, role)` | Slaat aanmelding op als JSON-gestored voorkeursmomenten |
| `getAllRegistrations()` | Retourneert alle registraties, gesorteerd op `created_at DESC` |
| `getRegistrationById(id)` | Enkelvoudige registratie op UUID |
| `setRegistrationStatus(id, status)` | Update status naar `pending`/`matched`/`archived` |
| `deleteRegistration(id)` | Definitief verwijderen |

### 6.4 `activity-service.js`

| Functie | Beschrijving |
|---------|-------------|
| `logActivity(eventId, actorLabel, action, details)` | Schrijft één rij in `activity_log` |

---

## 7. Rankingalgoritme

Het algoritme berekent voor elk tijdslot een **score** op basis van de ingediende beschikbaarheidsreacties van alle genodigden.

### Gewichten

| Beschikbaarheidsniveau | Gewicht |
|------------------------|---------|
| `preferred` | 4 |
| `available` | 3 |
| `if_needed` | 1 |
| `unavailable` | 0 |

### Scoreformule

```
score = (preferred × 4)
      + (available × 3)
      + (if_needed × 1)
      + (requiredCovered × 3)
      - (requiredMissing × 2)
      + roleCoverageBonus
```

**`roleCoverageBonus`**:
- `+6` als minstens één student én minstens één ondernemer `preferred` of `available` is (= **strong match**)
- `+3` als minstens één student én minstens één ondernemer `preferred`, `available` of `if_needed` is (= soft match)
- `0` anders

### Sortering

1. Hoogste score eerst
2. Bij gelijke score: vroegste datum eerst (`slot_datetime` ascending)

### `isStrongMatch`

Een slot wordt als sterke match gemarkeerd (`isStrongMatch = true`) als er minimaal één student en één ondernemer zijn die `preferred` of `available` hebben opgegeven. Dit wordt zichtbaar getoond in het admin-dashboard.

---

## 8. Beveiliging

### 8.1 Authenticatie – beheerder

- Eenmalig wachtwoord ingesteld via omgevingsvariabele `ADMIN_PASSWORD`
- Na succesvol inloggen: `req.session.isAdmin = true`
- Sessie verloopt na 8 uur inactiviteit (`maxAge: 8 * 60 * 60 * 1000`, `rolling: true`)
- Cookie-instellingen: `httpOnly: true`, `sameSite: 'lax'`, `secure: true` in productie

### 8.2 Authenticatie – beheerder event-acties

Event-specifieke beheerderacties (bijwerken, finaliseren, dupliceren, verwijderen) vereisen naast de sessie ook het `admin_token` als query-parameter of formulierveld. Dit UUID-token is alleen bekend aan de beheerder die het event heeft aangemaakt en staat niet in de URL van de publieke eventpagina.

### 8.3 CSRF-bescherming

Alle POST/PUT/DELETE-verzoeken worden gevalideerd via een synchronizer-token patroon:

1. Bij het openen van een sessie wordt `req.session.csrfToken` gegenereerd via `crypto.randomBytes(32)`
2. Het token wordt als `res.locals.csrfToken` doorgegeven aan alle EJS-templates
3. Elk formulier bevat `<input type="hidden" name="_csrf" value="<%= csrfToken %>">`
4. De middleware in `src/app.js` verifieert dat `req.body._csrf === req.session.csrfToken` voor alle niet-veilige methoden

### 8.4 Token-gebaseerde toegang voor deelnemers

Elke genodigde heeft een uniek, random `invite_token` (UUID v4). De persoonlijke uitnodigings-URL `/events/respond/:token` is alleen toegankelijk als het token in de database bestaat. Er is geen apart wachtwoord nodig.

---

## 9. Rate limiting

Rate limiting wordt verzorgd door `express-rate-limit`. Alle limieten gelden per IP-adres per 15-minutenvenster.

| Context | Limiet |
|---------|--------|
| Globale limiet (alle routes) | 200 req / 15 min |
| Leesroutes admin | 120 req / 15 min |
| Schrijfroutes admin | 40 req / 15 min |
| Leesroutes events | 150 req / 15 min |
| Schrijfroutes events | 60 req / 15 min |
| Schrijfroutes register | 20 req / 15 min |

Bij overschrijding retourneert `express-rate-limit` automatisch HTTP 429 met standaard `RateLimit-*` headers.

`app.set('trust proxy', 1)` is ingesteld zodat het IP-adres van achter een proxy (Render.com) correct wordt bepaald.

---

## 10. Databasemigraties

Er is geen apart migratieraamwerk. Migraties worden bij elke opstart uitgevoerd via een try/catch-patroon:

```js
for (const sql of migrations) {
  try { db.exec(sql); } catch (_) {}
}
```

SQLite retourneert een fout als een kolom al bestaat (`ALTER TABLE … ADD COLUMN` is idempotent via de catch). Destructieve migraties (hertabelleren) worden uitgevoerd in een transactie met `foreign_keys = OFF`.

### Migratiereeksen

1. `eventMigrations` – voegt kolommen toe aan `events` die in oudere versies ontbraken
2. `responseMigrations` – voegt kolommen toe aan `responses` en `time_slots`
3. Legacy invitee-migratie – converteert `responses`-rijen naar `invitees` + `availabilities`
4. `self_registrations`-tabel aanmaken (idempotent `CREATE TABLE IF NOT EXISTS`)

---

## 11. Omgevingsvariabelen

| Variabele | Verplicht in productie | Standaardwaarde | Beschrijving |
|-----------|----------------------|-----------------|--------------|
| `PORT` | Nee | `3000` | TCP-poort van de Express-server |
| `NODE_ENV` | Nee | `development` | Zet op `production` voor veilige cookies en striktere controles |
| `SESSION_SECRET` | Ja | `datumprikker-secret-key` | Willekeurige string voor sessie-encryptie |
| `DATABASE_PATH` | Nee | `./data/datumprikker.db` | Absoluut of relatief pad naar SQLite-bestand |
| `ADMIN_PASSWORD` | Ja | `admin` | Wachtwoord voor het beheerdersdashboard |
| `BASE_URL` | Nee | Afgeleid van `req.protocol + host` | Publieke basis-URL voor uitnodigingslinks |

---

## 12. Deployment

### 12.1 Render.com (primair)

Geconfigureerd via `render.yaml`:

- **Runtime:** Node.js
- **Build:** `npm ci`
- **Start:** `npm start`
- **Health check:** `GET /health`
- **Persistent disk:** `/data` (1 GB), database op `/data/datumprikker.db`
- Geheimen (`SESSION_SECRET`, `ADMIN_PASSWORD`) worden automatisch gegenereerd

### 12.2 Docker

Een `Dockerfile` is aanwezig voor containerisatie. De applicatie draait als een stateless Node.js-proces; de database moet worden gemount als een volume (`-v /host/data:/data`).

### 12.3 Fly.io

`fly.toml` is aanwezig voor deployment op Fly.io.

---

## 13. Testen

Tests bevinden zich in `tests/` en gebruiken de **Node.js ingebouwde test runner** (`node:test`).

```bash
npm ci
npm test
```

### Huidige testdekking

| Test | Wat wordt getest |
|------|-----------------|
| Ranking prefers strong matches | `buildRankedSlots` met preferred/available reacties |
| normalizeSlotInputs removes empty/duplicates | Lege strings en duplicaten worden gefilterd |
| validateEventInput requires title and slot | Validatiefoutmeldingen bij lege invoer |
| normalizeLocationMode | Alleen `'online'` en `'onsite'` worden geaccepteerd |

### Testbestand: `tests/ranking.test.js`

Tests importeren direct uit `src/services/ranking-service.js` en `src/services/event-service.js` (pure functies, geen database-afhankelijkheid).

---

## 14. Afhankelijkheden

| Package | Versie | Doel |
|---------|--------|------|
| `express` | ^5.2.1 | HTTP-framework |
| `ejs` | ^5.0.1 | Server-side templating |
| `better-sqlite3` | ^12.8.0 | Synchrone SQLite-driver |
| `express-session` | ^1.19.0 | Sessiebeheer (in-memory store) |
| `express-rate-limit` | ^8.3.1 | Rate limiting |
| `uuid` | ^13.0.0 | UUID v4-generatie (niet gebruikt in productie – crypto.randomUUID() wordt gebruikt) |

**Runtime-omgeving:** Node.js ≥ 18 (vereist voor `node:test`, `crypto.randomUUID()`)

---

## 15. Bekende beperkingen en toekomstplannen

| Beperking | Toelichting |
|-----------|-------------|
| In-memory sessie-store | Sessions gaan verloren bij herstart van het proces; uitbreidbaar naar `connect-sqlite3` of Redis |
| Geen e-mailnotificaties | Uitnodigingslinks worden handmatig gedeeld; integratie met SMTP/SendGrid is nog niet aanwezig |
| Enkelvoudige instantie | SQLite is niet geschikt voor meerdere gelijktijdige schrijfprocessen; voor horizontaal schalen is een PostgreSQL-migratie nodig |
| Geen rol-authenticatie voor deelnemers | Deelnemers authenticeren uitsluitend via hun unieke token; er is geen accountsysteem |
| Geen automatische matching | De beheerder matcht zelfregistraties handmatig; automatisch koppelen op basis van overlappende voorkeursmomenten is nog niet geïmplementeerd |
