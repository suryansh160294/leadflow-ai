// =============================================
//  src/middleware/validate.js
//  Zod validation middleware factory
//  Usage:  router.post('/', validate(schema), handler)
// =============================================

'use strict';

const { ZodError } = require('zod');

/**
 * Validates req.body against a Zod schema.
 * On success: attaches parsed data to req.validated
 * On failure: passes ZodError to errorHandler
 */
function validate(schema) {
  return (req, res, next) => {
    try {
      req.validated = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          error:   'Validation Error',
          details: err.errors.map(e => ({
            field:   e.path.join('.'),
            message: e.message
          }))
        });
      }
      next(err);
    }
  };
}

module.exports = validate;
