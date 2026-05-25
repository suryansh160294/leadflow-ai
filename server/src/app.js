// =============================================
//  src/app.js — Express Application
//  Wires middleware, routes, and error handler
// =============================================

'use strict';

const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const morgan      = require('morgan');
const rateLimit   = require('express-rate-limit');

const cookieParser = require('cookie-parser');

const leadsRouter      = require('./modules/leads/leads.router');
const executivesRouter = require('./modules/executives/executives.router');
const authRouter       = require('./modules/auth/auth.router');
const errorHandler     = require('./middleware/errorHandler');

const path        = require('path');

const app = express();

// ── Security headers ─────────────────────────
app.use(helmet({
  contentSecurityPolicy: false
}));

// ── CORS ─────────────────────────────────────
app.use(cors({
  origin:      process.env.CORS_ORIGIN || '*',
  methods:     ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ── Body parsing ─────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve frontend static files from the project root
app.use(express.static(path.join(__dirname, '../../')));

// ── Request logging ───────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ── Rate limiting ─────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_MAX)        || 100,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api', limiter);

// ── Health check (no auth required) ──────────
app.get('/health', (req, res) => {
  res.json({
    status:      'ok',
    service:     'LeadFlow AI API',
    version:     '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp:   new Date().toISOString()
  });
});

// ── API Routes ────────────────────────────────
app.use('/api/auth',       authRouter);
app.use('/api/leads',      leadsRouter);
app.use('/api/executives', executivesRouter);

// ── 404 handler ───────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error:  'Not Found',
    path:   req.originalUrl,
    method: req.method
  });
});

// ── Global error handler ─────────────────────
app.use(errorHandler);

module.exports = app;
