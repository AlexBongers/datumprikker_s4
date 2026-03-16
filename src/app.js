const express = require('express');
const path = require('path');
const session = require('express-session');
const rateLimit = require('express-rate-limit');

const app = express();

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Rate limiting (applied to all /admin and /events routes as a base layer)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'datumprikker-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
    },
  })
);

// Apply rate limiting to all routes
app.use('/admin', generalLimiter);
app.use('/events', generalLimiter);

// Routes
const adminRouter = require('./routes/admin');
const eventsRouter = require('./routes/events');

app.get('/', (req, res) => {
  res.render('index');
});

app.use('/admin', adminRouter);
app.use('/events', eventsRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).render('404');
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('500');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Datumprikker app running on http://localhost:${PORT}`);
});

module.exports = app;
