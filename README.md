# Datumprikker — Interview Scheduling

A Dutch-language interview scheduling web application (like datumprikker.nl) where:

1. **Beheerder (Admin)** creates an interview event and sets available time slots
2. **Studenten (Students)** click the time slots when they're available
3. **Ondernemers (Entrepreneurs)** click the time slots when they're available
4. The system automatically highlights **Matches** — time slots where at least one student AND one entrepreneur are both available

## Tech Stack

- **Node.js** + **Express** — web server
- **better-sqlite3** — lightweight embedded database
- **EJS** — server-side templating
- **Bootstrap 5** — responsive UI

## Getting Started

```bash
npm install
npm start
```

The app runs at `http://localhost:3000`.

## Usage

1. Go to `/admin` to create a new interview event with available time slots
2. Share the generated student/entrepreneur links with participants
3. Participants visit their link, enter their name, and tick available slots
4. Matches appear highlighted in green in the overview table
