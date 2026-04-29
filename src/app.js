const express = require('express');
const path = require('path');
const crypto = require('crypto');
const session = require('express-session');
const rateLimit = require('express-rate-limit');

const adminRouter = require('./routes/admin');
const eventsRouter = require('./routes/events');
const registerRouter = require('./routes/register');
const { formatDateTimeRange, formatDateLabel, formatLocationMode, formatRelativeState, formatDeadlineLabel } = require('./lib/view-helpers');

const app = express();

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(globalLimiter);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use(
  session({
    name: 'datumprikker.sid',
    secret: process.env.SESSION_SECRET || 'datumprikker-secret-key',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

app.use((req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  res.locals.isAdmin = !!req.session.isAdmin;
  res.locals.currentPath = req.path;
  res.locals.helpers = {
    formatDateTimeRange,
    formatDateLabel,
    formatLocationMode,
    formatRelativeState,
    formatDeadlineLabel,
  };
  next();
});

app.use((req, res, next) => {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) return next();
  const token = req.body && req.body._csrf;
  if (!token || token !== req.session.csrfToken) {
    return res.status(403).render('403', { message: 'Je formulier is verlopen. Vernieuw de pagina en probeer opnieuw.' });
  }
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/', (req, res) => {
  res.render('index', { registerError: null, registerRole: null, registerValues: {} });
});

app.use('/admin', adminRouter);
app.use('/events', eventsRouter);
app.use('/register', registerRouter);

app.use((req, res) => {
  res.status(404).render('404');
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('500');
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Datumprikker app running on http://localhost:${PORT}`);
  });
}

module.exports = app;
