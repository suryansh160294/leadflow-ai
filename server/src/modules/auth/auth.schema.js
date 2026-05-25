// =============================================
//  src/modules/auth/auth.schema.js
//  Zod validation schemas for all auth endpoints
// =============================================

'use strict';

const { z } = require('zod');

const loginSchema = z.object({
  email:    z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10, 'Refresh token is required')
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword:     z.string()
    .min(8,  'New password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number')
});

module.exports = { loginSchema, refreshSchema, changePasswordSchema };
