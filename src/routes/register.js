const express = require('express');
const rateLimit = require('express-rate-limit');
const { validateRegistration, createRegistration } = require('../services/registration-service');

const router = express.Router();
const writeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

router.post('/ondernemer', writeLimiter, (req, res) => {
  const { errors, slots } = validateRegistration(req.body, 'ondernemer');
  if (errors.length > 0) {
    return res.render('index', { registerError: errors[0], registerRole: 'ondernemer', registerValues: req.body });
  }
  createRegistration(req.body, 'ondernemer');
  return res.redirect('/register/bevestiging?rol=ondernemer');
});

router.post('/student', writeLimiter, (req, res) => {
  const { errors } = validateRegistration(req.body, 'student');
  if (errors.length > 0) {
    return res.render('index', { registerError: errors[0], registerRole: 'student', registerValues: req.body });
  }
  createRegistration(req.body, 'student');
  return res.redirect('/register/bevestiging?rol=student');
});

router.get('/bevestiging', (req, res) => {
  const rol = req.query.rol === 'ondernemer' ? 'ondernemer' : 'student';
  res.render('register/bevestiging', { rol });
});

module.exports = router;
