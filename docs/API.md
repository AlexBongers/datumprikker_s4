# API-documentatie – Datumprikker

**Versie:** 2.0  
**Datum:** april 2026  
**Base URL:** `http://localhost:3000` (lokaal) / `https://<jouw-domein>` (productie)

---

## Algemeen

### Transport & formaat

- Alle routes leveren **HTML** terug (server-side rendering met EJS), tenzij anders aangegeven.
- Formulieren versturen gegevens als `application/x-www-form-urlencoded`.
- Het enige JSON-endpoint is `GET /health`.

### CSRF-bescherming

Alle muterende verzoeken (POST) vereisen een geldig CSRF-token in het formulierveld `_csrf`.  
Het token is beschikbaar als `<%= csrfToken %>` in elke EJS-template.  
Bij een ongeldig of ontbrekend token retourneert de server **HTTP 403**.

### Authenticatie

| Route-groep | Vereiste |
|-------------|----------|
| `GET /`, `GET /register/bevestiging` | Geen |
| `POST /register/*` | Geen (rate-limited) |
| `GET /events/*` | Geen |
| `GET /admin/login`, `POST /admin/login` | Geen |
| Overige `/admin/*` routes | Sessie (`isAdmin = true`) + geldig CSRF-token |
| Event-mutaties (`/admin/events/:id/*`) | Sessie + geldig `?token=<adminToken>` of `token` in body |

### Rate limits

Per IP-adres per 15-minutenvenster:

| Limiet | Waarde |
|--------|--------|
| Globaal | 200 |
| Admin leesroutes | 120 |
| Admin schrijfroutes | 40 |
| Event leesroutes | 150 |
| Event schrijfroutes | 60 |
| Register schrijfroutes | 20 |

Bij overschrijding: **HTTP 429** met standaard `RateLimit-*` headers.

### Foutpagina's

| HTTP-status | Weergave |
|-------------|----------|
| 403 | `views/403.ejs` met `message`-variabele |
| 404 | `views/404.ejs` |
| 500 | `views/500.ejs` |

---

## Inhoudsopgave

- [Systeem](#systeem)
- [Homepage](#homepage)
- [Zelfregistratie](#zelfregistratie)
- [Events (publiek)](#events-publiek)
- [Admin – Authenticatie](#admin--authenticatie)
- [Admin – Dashboard](#admin--dashboard)
- [Admin – Events](#admin--events)
- [Admin – Registraties](#admin--registraties)

---

## Systeem

### `GET /health`

Gezondheidscheck voor load balancers en monitoring.

**Authenticatie:** Geen  
**Rate limit:** Globaal

**Response – 200 OK**

```json
{
  "status": "ok",
  "uptime": 12345.67
}
```

| Veld | Type | Beschrijving |
|------|------|-------------|
| `status` | string | Altijd `"ok"` als de server reageert |
| `uptime` | number | Uptime van het Node.js-proces in seconden |

---

## Homepage

### `GET /`

Rendert de homepage met twee zelfregistratieformulieren (organisatie + student) en een uitnodigingslink-balk.

**Authenticatie:** Geen  
**Rate limit:** Globaal

**Response – 200 OK** → HTML (`views/index.ejs`)

**Template-variabelen:**

| Variabele | Type | Beschrijving |
|-----------|------|-------------|
| `registerError` | string \| null | Foutmelding bij mislukte registratie |
| `registerRole` | `'ondernemer'` \| `'student'` \| null | Welke rol de fout veroorzaakte |
| `registerValues` | object | Formulierwaarden voor her-invullen |

---

## Zelfregistratie

### `POST /register/ondernemer`

Slaat een zelfregistratie op voor een organisatie/ondernemer.

**Authenticatie:** Geen  
**Rate limit:** 20 req / 15 min

**Body (form-urlencoded):**

| Veld | Verplicht | Type | Beschrijving |
|------|-----------|------|-------------|
| `_csrf` | Ja | string | CSRF-token |
| `name` | Ja | string | Naam contactpersoon |
| `organization` | Ja | string | Organisatienaam |
| `email` | Nee | string (email) | E-mailadres |
| `phone` | Nee | string | Telefoonnummer |
| `slots[]` | Ja (≥1) | string (datetime-local) | Startdatum/tijd voorkeursmomenten |
| `slots_end[]` | Nee | string (datetime-local) | Einddatum/tijd (parallel met `slots[]`) |
| `notes` | Nee | string | Vrije toelichting |

**Responses:**

| Status | Beschrijving |
|--------|-------------|
| 302 | Redirect naar `GET /register/bevestiging?rol=ondernemer` bij succes |
| 200 | HTML-herrendering van de homepage met `registerError`, `registerRole='ondernemer'` en `registerValues` bij validatiefout |

**Validatieregels:**
- `name` mag niet leeg zijn
- `organization` mag niet leeg zijn
- Minimaal één geldig `slots[]` item (niet-lege datetime-string)

---

### `POST /register/student`

Slaat een zelfregistratie op voor een student.

**Authenticatie:** Geen  
**Rate limit:** 20 req / 15 min

**Body (form-urlencoded):**

| Veld | Verplicht | Type | Beschrijving |
|------|-----------|------|-------------|
| `_csrf` | Ja | string | CSRF-token |
| `name` | Ja | string | Naam student |
| `email` | Nee | string (email) | E-mailadres |
| `phone` | Nee | string | Telefoonnummer |
| `slots[]` | Ja (≥1) | string (datetime-local) | Startdatum/tijd voorkeursmomenten |
| `slots_end[]` | Nee | string (datetime-local) | Einddatum/tijd (parallel met `slots[]`) |
| `notes` | Nee | string | Vrije toelichting |

**Responses:**

| Status | Beschrijving |
|--------|-------------|
| 302 | Redirect naar `GET /register/bevestiging?rol=student` bij succes |
| 200 | HTML-herrendering van de homepage met `registerError`, `registerRole='student'` en `registerValues` bij validatiefout |

**Validatieregels:**
- `name` mag niet leeg zijn
- Minimaal één geldig `slots[]` item

---

### `GET /register/bevestiging`

Toont een bevestigingspagina na een succesvolle zelfregistratie.

**Authenticatie:** Geen  
**Rate limit:** Globaal

**Query parameters:**

| Parameter | Verplicht | Waarden | Beschrijving |
|-----------|-----------|---------|-------------|
| `rol` | Nee | `ondernemer` \| `student` | Bepaalt de bevestigingstekst; default `student` |

**Response – 200 OK** → HTML (`views/register/bevestiging.ejs`)

---

## Events (publiek)

### `GET /events/:id`

Toont de publieke samenvatting van een event (zonder gevoelige data).

**Authenticatie:** Geen  
**Rate limit:** 150 req / 15 min

**Path parameters:**

| Parameter | Type | Beschrijving |
|-----------|------|-------------|
| `id` | string (UUID) | Event-ID |

**Responses:**

| Status | Beschrijving |
|--------|-------------|
| 200 | HTML (`views/events/public-summary.ejs`) |
| 404 | HTML 404-pagina |

---

### `GET /events/respond/:token`

Toont het persoonlijke beschikbaarheidsformulier voor een genodigde.

**Authenticatie:** Geen (token fungeert als bewijs van identiteit)  
**Rate limit:** 150 req / 15 min

**Path parameters:**

| Parameter | Type | Beschrijving |
|-----------|------|-------------|
| `token` | string (UUID) | Persoonlijk uitnodigingstoken van de genodigde |

**Query parameters:**

| Parameter | Verplicht | Beschrijving |
|-----------|-----------|-------------|
| `success` | Nee | `1` = toon succesmelding na opslaan |

**Responses:**

| Status | Beschrijving |
|--------|-------------|
| 200 | HTML (`views/events/show.ejs`) met event, slots, huidige keuzen en gesorteerde slots |
| 404 | HTML 404-pagina (token onbekend) |

**Template-variabelen (selectie):**

| Variabele | Type | Beschrijving |
|-----------|------|-------------|
| `event` | object | Eventgegevens |
| `invitee` | object | Genodigde-gegevens |
| `slots` | array | Alle tijdsloten van het event |
| `selectionBySlotId` | object | Bestaande keuzen van de genodigde, gekeyed op `slot_id` |
| `rankedSlots` | array | Gesorteerde slots met score en uitleg |
| `success` | boolean | Successmelding tonen |

---

### `POST /events/respond/:token`

Slaat de beschikbaarheidskeuzen van een genodigde op.

**Authenticatie:** Token  
**Rate limit:** 60 req / 15 min

**Path parameters:**

| Parameter | Type | Beschrijving |
|-----------|------|-------------|
| `token` | string (UUID) | Persoonlijk uitnodigingstoken |

**Body (form-urlencoded):**

| Veld | Verplicht | Type | Beschrijving |
|------|-----------|------|-------------|
| `_csrf` | Ja | string | CSRF-token |
| `availability_<slotId>` | Nee | `preferred` \| `available` \| `if_needed` \| `unavailable` | Keuze per tijdslot; default `unavailable` |
| `response_note` | Nee | string | Persoonlijke opmerking |

`<slotId>` is het integer-ID van een tijdslot.  
Voor elk slot in het event dient een `availability_<slotId>` te worden meegestuurd; ontbrekende waarden worden behandeld als `unavailable`.

**Responses:**

| Status | Beschrijving |
|--------|-------------|
| 302 | Redirect naar `GET /events/respond/:token?success=1` |
| 404 | HTML 404-pagina (token onbekend) |

---

### `GET /events/:id/export`

Exporteert het definitief geplande tijdstip als iCalendar-bestand (`.ics`).

**Authenticatie:** Admin-token (query-parameter)  
**Rate limit:** 150 req / 15 min

**Path parameters:**

| Parameter | Type | Beschrijving |
|-----------|------|-------------|
| `id` | string (UUID) | Event-ID |

**Query parameters:**

| Parameter | Verplicht | Beschrijving |
|-----------|-----------|-------------|
| `token` | Ja | Admin-token van het event |

**Responses:**

| Status | Content-Type | Beschrijving |
|--------|-------------|-------------|
| 200 | `text/calendar; charset=utf-8` | iCalendar-bestand als download |
| 400 | HTML | Event heeft nog geen definitief slot |
| 403 | HTML | Admin-token ongeldig |

**Download-bestandsnaam:** `<eventId>-definitief.ics`

**iCal-velden:**

| iCal-veld | Bron |
|-----------|------|
| `UID` | `<eventId>@datumprikker` |
| `DTSTART` | `finalized_slot.slot_datetime` (UTC) |
| `DTEND` | `finalized_slot.slot_end_datetime` (UTC, indien aanwezig) |
| `SUMMARY` | `event.title` |
| `DESCRIPTION` | `event.description` of standaardtekst |
| `LOCATION` | `event.location_details` |

---

## Admin – Authenticatie

### `GET /admin/login`

Toont het inlogformulier. Redirect naar dashboard als sessie al actief is.

**Authenticatie:** Geen  
**Rate limit:** Admin lees (120 req / 15 min)

**Response – 200 OK** → HTML (`views/admin/login.ejs`)

---

### `POST /admin/login`

Verwerkt het inlogformulier.

**Authenticatie:** Geen  
**Rate limit:** Admin schrijf (40 req / 15 min)

**Body (form-urlencoded):**

| Veld | Verplicht | Beschrijving |
|------|-----------|-------------|
| `_csrf` | Ja | CSRF-token |
| `password` | Ja | Beheerderswachtwoord (vergeleken met `ADMIN_PASSWORD`) |

**Responses:**

| Status | Beschrijving |
|--------|-------------|
| 302 | Redirect naar `GET /admin/dashboard` bij juist wachtwoord |
| 401 | HTML-herrendering login met foutmelding bij onjuist wachtwoord |

---

### `POST /admin/logout`

Vernietigt de sessie.

**Authenticatie:** Sessie  
**Rate limit:** Admin schrijf

**Body (form-urlencoded):**

| Veld | Verplicht | Beschrijving |
|------|-----------|-------------|
| `_csrf` | Ja | CSRF-token |

**Response – 302** → Redirect naar `GET /admin/login`

---

## Admin – Dashboard

### `GET /admin/dashboard`

Toont het overzicht van alle events met statistieken.

**Authenticatie:** Sessie vereist  
**Rate limit:** Admin lees

**Response – 200 OK** → HTML (`views/admin/dashboard.ejs`)

**Template-variabelen:**

| Variabele | Type | Beschrijving |
|-----------|------|-------------|
| `events` | array | Alle events met geaggregeerde statistieken |
| `events[].id` | string | Event-UUID |
| `events[].title` | string | Eventtitel |
| `events[].status` | string | `open` \| `finalized` \| `archived` |
| `events[].invitee_count` | number | Aantal genodigden |
| `events[].responded_invitee_count` | number | Aantal gereageerde genodigden |
| `events[].slot_count` | number | Aantal tijdsloten |
| `events[].strong_match_count` | number | Aantal slots met sterke match |
| `events[].best_slot` | object \| null | Hoogst gerangschikte slot |
| `events[].admin_token` | string | Admin-token (voor links) |
| `totals` | object | Totalen over alle events |
| `totals.events` | number | |
| `totals.invitees` | number | |
| `totals.responses` | number | |
| `totals.matches` | number | |

---

## Admin – Events

### `GET /admin`

Toont het formulier voor het aanmaken van een nieuw event.

**Authenticatie:** Sessie vereist  
**Rate limit:** Admin lees

**Response – 200 OK** → HTML (`views/admin/index.ejs`)

---

### `POST /admin/events`

Maakt een nieuw event aan.

**Authenticatie:** Sessie vereist  
**Rate limit:** Admin schrijf

**Body (form-urlencoded):**

| Veld | Verplicht | Type | Beschrijving |
|------|-----------|------|-------------|
| `_csrf` | Ja | string | CSRF-token |
| `title` | Ja | string | Eventtitel |
| `description` | Nee | string | Omschrijving |
| `location_mode` | Nee | `online` \| `onsite` | Default: `onsite` |
| `location_details` | Nee | string | Link, adres of lokaal |
| `response_deadline` | Nee | string (datetime-local) | Deadline voor reacties |
| `timezone` | Nee | string (IANA) | Default: `Europe/Amsterdam` |
| `slots[]` | Ja (≥1) | string (datetime-local) | Startdatum/tijd per slot |
| `slots_end[]` | Nee | string (datetime-local) | Einddatum/tijd per slot |
| `invitee_name[]` | Nee | string | Naam per genodigde |
| `invitee_role[]` | Nee | `student` \| `ondernemer` | Rol per genodigde |
| `invitee_email[]` | Nee | string (email) | E-mail per genodigde |
| `invitee_phone[]` | Nee | string | Telefoon per genodigde |
| `invitee_organization[]` | Nee | string | Organisatie per genodigde |
| `invitee_required` | Nee | array van indices (string) | Indices van verplichte genodigden |

Alle `invitee_*[]`-velden zijn parallel genummerd.  
`invitee_required` bevat de 0-gebaseerde indices (als string) van genodigden die als verplicht worden gemarkeerd.

**Responses:**

| Status | Beschrijving |
|--------|-------------|
| 302 | Redirect naar `GET /admin/events/<eventId>?token=<adminToken>` bij succes |
| 400 | HTML-herrendering van formulier met `error` bij validatiefout |

---

### `GET /admin/events/:id`

Toont de beheerderdetailpagina van een event.

**Authenticatie:** Admin-token (query-parameter)  
**Rate limit:** Admin lees

**Path parameters:**

| Parameter | Type | Beschrijving |
|-----------|------|-------------|
| `id` | string (UUID) | Event-ID |

**Query parameters:**

| Parameter | Verplicht | Beschrijving |
|-----------|-----------|-------------|
| `token` | Ja | Admin-token |

**Responses:**

| Status | Beschrijving |
|--------|-------------|
| 200 | HTML (`views/admin/event.ejs`) |
| 403 | HTML 403-pagina (token ongeldig) |

**Template-variabelen (selectie):**

| Variabele | Type | Beschrijving |
|-----------|------|-------------|
| `event` | object | Eventgegevens |
| `slots` | array | Alle tijdsloten |
| `invitees` | array | Alle genodigden |
| `rankedSlots` | array | Gesorteerde slots met scores |
| `bestSlot` | object \| null | Slot met hoogste score |
| `stats` | object | `inviteeCount`, `respondedInvitees`, `pendingInvitees`, `slotCount`, `strongMatches` |
| `activities` | array | Laatste 20 activiteitslogregels |
| `token` | string | Admin-token (voor formulieren) |
| `baseUrl` | string | Publieke basis-URL |

---

### `GET /admin/events/:id/edit`

Toont het bewerkingsformulier voor een event.

**Authenticatie:** Admin-token  
**Rate limit:** Admin lees

**Query parameters:**

| Parameter | Verplicht | Beschrijving |
|-----------|-----------|-------------|
| `token` | Ja | Admin-token |

**Responses:**

| Status | Beschrijving |
|--------|-------------|
| 200 | HTML (`views/admin/edit.ejs`) |
| 403 | HTML 403-pagina |

---

### `POST /admin/events/:id/edit`

Werkt een bestaand event bij (vervangt alle slots; alle bestaande availabilities vervallen).

**Authenticatie:** Admin-token (body-veld `token`)  
**Rate limit:** Admin schrijf

**Body:** Zelfde structuur als `POST /admin/events`, plus:

| Veld | Verplicht | Beschrijving |
|------|-----------|-------------|
| `token` | Ja | Admin-token |

**Responses:**

| Status | Beschrijving |
|--------|-------------|
| 302 | Redirect naar `GET /admin/events/:id?token=<token>` |
| 400 | HTML-herrendering van bewerkingsformulier met `error` |
| 403 | HTML 403-pagina |

---

### `POST /admin/events/:id/invitees`

Voegt een genodigde toe aan een bestaand event.

**Authenticatie:** Admin-token (body-veld `token`)  
**Rate limit:** Admin schrijf

**Body (form-urlencoded):**

| Veld | Verplicht | Beschrijving |
|------|-----------|-------------|
| `_csrf` | Ja | CSRF-token |
| `token` | Ja | Admin-token |
| `name` | Ja | Naam genodigde |
| `role` | Ja | `student` \| `ondernemer` |
| `email` | Nee | E-mailadres |
| `phone` | Nee | Telefoonnummer |
| `organization` | Nee | Organisatie |
| `is_required` | Nee | Aanwezig = verplicht |

**Responses:**

| Status | Beschrijving |
|--------|-------------|
| 302 | Redirect naar event-detailpagina |
| 302 | Redirect met `&error=participant` als `name` of `role` ontbreekt |
| 403 | HTML 403-pagina |

---

### `POST /admin/events/:id/invitees/:inviteeId/delete`

Verwijdert een genodigde inclusief diens availabilities.

**Authenticatie:** Admin-token (body-veld `token`)  
**Rate limit:** Admin schrijf

**Body (form-urlencoded):**

| Veld | Verplicht | Beschrijving |
|------|-----------|-------------|
| `_csrf` | Ja | CSRF-token |
| `token` | Ja | Admin-token |

**Responses:**

| Status | Beschrijving |
|--------|-------------|
| 302 | Redirect naar event-detailpagina |
| 403 | HTML 403-pagina |

---

### `POST /admin/events/:id/finalize`

Zet het event op `finalized` en slaat het definitieve tijdslot op.

**Authenticatie:** Admin-token (body-veld `token`)  
**Rate limit:** Admin schrijf

**Body (form-urlencoded):**

| Veld | Verplicht | Beschrijving |
|------|-----------|-------------|
| `_csrf` | Ja | CSRF-token |
| `token` | Ja | Admin-token |
| `slot_id` | Ja | Integer-ID van het definitieve tijdslot |

**Responses:**

| Status | Beschrijving |
|--------|-------------|
| 302 | Redirect naar event-detailpagina |
| 403 | HTML 403-pagina |

---

### `POST /admin/events/:id/archive`

Wijzigt de status van een event naar `archived` of terug naar `open`.

**Authenticatie:** Admin-token (body-veld `token`)  
**Rate limit:** Admin schrijf

**Body (form-urlencoded):**

| Veld | Verplicht | Waarden | Beschrijving |
|------|-----------|---------|-------------|
| `_csrf` | Ja | | CSRF-token |
| `token` | Ja | | Admin-token |
| `status` | Ja | `open` \| anderszins | `open` = heropenen; alles anders = archiveren |

**Responses:**

| Status | Beschrijving |
|--------|-------------|
| 302 | Redirect naar event-detailpagina |
| 403 | HTML 403-pagina |

---

### `POST /admin/events/:id/remind`

Markeert `reminder_sent_at` voor alle genodigden die nog niet hebben gereageerd.

**Authenticatie:** Admin-token (body-veld `token`)  
**Rate limit:** Admin schrijf

**Body (form-urlencoded):**

| Veld | Verplicht | Beschrijving |
|------|-----------|-------------|
| `_csrf` | Ja | CSRF-token |
| `token` | Ja | Admin-token |

**Responses:**

| Status | Beschrijving |
|--------|-------------|
| 302 | Redirect naar event-detailpagina |
| 403 | HTML 403-pagina |

---

### `POST /admin/events/:id/duplicate`

Maakt een kopie van een event (met alle slots en genodigden; beschikbaarheden worden niet gekopieerd).

**Authenticatie:** Admin-token (body-veld `token`)  
**Rate limit:** Admin schrijf

**Body (form-urlencoded):**

| Veld | Verplicht | Beschrijving |
|------|-----------|-------------|
| `_csrf` | Ja | CSRF-token |
| `token` | Ja | Admin-token |

**Responses:**

| Status | Beschrijving |
|--------|-------------|
| 302 | Redirect naar `GET /admin/events/<nieuwEventId>?token=<nieuwAdminToken>` |
| 403 | HTML 403-pagina |

---

### `POST /admin/events/:id/delete`

Verwijdert een event inclusief alle gerelateerde data permanent.

**Authenticatie:** Admin-token (body-veld `token`)  
**Rate limit:** Admin schrijf

**Body (form-urlencoded):**

| Veld | Verplicht | Beschrijving |
|------|-----------|-------------|
| `_csrf` | Ja | CSRF-token |
| `token` | Ja | Admin-token |

**Responses:**

| Status | Beschrijving |
|--------|-------------|
| 302 | Redirect naar `GET /admin/dashboard` |
| 403 | HTML 403-pagina |

---

## Admin – Registraties

### `GET /admin/registraties`

Toont een overzicht van alle zelfregistraties van organisaties en studenten.

**Authenticatie:** Sessie vereist  
**Rate limit:** Admin lees

**Response – 200 OK** → HTML (`views/admin/registraties.ejs`)

**Template-variabelen:**

| Variabele | Type | Beschrijving |
|-----------|------|-------------|
| `registrations` | array | Alle registraties, gesorteerd op `created_at DESC` |
| `registrations[].id` | string | UUID |
| `registrations[].role` | string | `student` \| `ondernemer` |
| `registrations[].name` | string | Naam contactpersoon |
| `registrations[].email` | string \| null | |
| `registrations[].phone` | string \| null | |
| `registrations[].organization` | string \| null | |
| `registrations[].notes` | string \| null | |
| `registrations[].preferred_slots` | array | Geparsde `[{start, end}]` objecten |
| `registrations[].status` | string | `pending` \| `matched` \| `archived` |
| `registrations[].created_at` | string | ISO-8601 datetime |

---

### `POST /admin/registraties/:id/status`

Wijzigt de status van een registratie.

**Authenticatie:** Sessie vereist  
**Rate limit:** Admin schrijf

**Path parameters:**

| Parameter | Type | Beschrijving |
|-----------|------|-------------|
| `id` | string (UUID) | Registratie-ID |

**Body (form-urlencoded):**

| Veld | Verplicht | Waarden | Beschrijving |
|------|-----------|---------|-------------|
| `_csrf` | Ja | | CSRF-token |
| `status` | Ja | `pending` \| `matched` \| `archived` | Nieuwe status; ongeldige waarden worden als `pending` behandeld |

**Responses:**

| Status | Beschrijving |
|--------|-------------|
| 302 | Redirect naar `GET /admin/registraties` |

---

### `POST /admin/registraties/:id/delete`

Verwijdert een registratie definitief.

**Authenticatie:** Sessie vereist  
**Rate limit:** Admin schrijf

**Path parameters:**

| Parameter | Type | Beschrijving |
|-----------|------|-------------|
| `id` | string (UUID) | Registratie-ID |

**Body (form-urlencoded):**

| Veld | Verplicht | Beschrijving |
|------|-----------|-------------|
| `_csrf` | Ja | CSRF-token |

**Responses:**

| Status | Beschrijving |
|--------|-------------|
| 302 | Redirect naar `GET /admin/registraties` |

---

## Beschikbaarheidsniveaus

| Waarde | Weergave | Beschrijving |
|--------|----------|-------------|
| `preferred` | Voorkeur | De deelnemer geeft sterk de voorkeur aan dit moment |
| `available` | Beschikbaar | De deelnemer kan op dit moment |
| `if_needed` | Als het moet | De deelnemer kan, maar met tegenzin |
| `unavailable` | Niet beschikbaar | De deelnemer kan niet op dit moment |

---

## Slot-scoreweging

Zie ook het [Technisch Design Document](./TECHNICAL_DESIGN.md#7-rankingalgoritme).

| Beschikbaarheidsniveau | Gewicht |
|------------------------|---------|
| `preferred` | 4 |
| `available` | 3 |
| `if_needed` | 1 |
| `unavailable` | 0 |

Bonus:
- **+6** als minstens één student én één ondernemer `preferred` of `available` zijn
- **+3** als minstens één student én één ondernemer `preferred`, `available` of `if_needed` zijn
- **+3** per verplichte deelnemer die aanwezig kan zijn
- **−2** per verplichte deelnemer die afwezig is
