// =============================================
//  src/middleware/errorHandler.js
//  Global error handler — last middleware in chain
//  Formats all errors into a consistent JSON shape
// =============================================

'use strict';

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  // Zod validation errors
  if (err.name === 'ZodError') {
    return res.status(400).json({
      error:   'Validation Error',
      details: err.errors.map(e => ({
        field:   e.path.join('.'),
        message: e.message
      }))
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid token' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token expired' });
  }

  // PostgreSQL errors
  if (err.code) {
    switch (err.code) {
      case '23505': // unique_violation
        return res.status(409).json({
          error:  'Conflict',
          detail: err.detail || 'A record with these values already exists.'
        });
      case '23503': // foreign_key_violation
        return res.status(400).json({
          error:  'Invalid Reference',
          detail: err.detail || 'Referenced record does not exist.'
        });
      case '22P02': // invalid_text_representation (bad UUID etc.)
        return res.status(400).json({ error: 'Invalid ID format' });
    }
  }

  // Custom app errors (thrown as { status, message })
  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }

  // Unknown server error
  const isDev = process.env.NODE_ENV === 'development';
  console.error('  ❌  Unhandled error:', err);

  return res.status(500).json({
    error:   'Internal Server Error',
    ...(isDev && { detail: err.message, stack: err.stack })
  });
}

module.exports = errorHandler;
