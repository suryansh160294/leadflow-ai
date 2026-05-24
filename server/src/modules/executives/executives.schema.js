// =============================================
//  src/modules/executives/executives.schema.js
// =============================================

'use strict';

const { z } = require('zod');

const createExecutiveSchema = z.object({
  name:               z.string().min(2).max(200),
  email:              z.string().email(),
  phone:              z.string().min(7).max(20).optional(),
  whatsapp_number:    z.string().min(7).max(20).optional(),
  password:           z.string().min(8, 'Password must be at least 8 characters'),
  locations:          z.array(z.string().min(2)).min(1, 'At least one location required'),
  expertise:          z.array(z.string()).optional().default([]),
  max_daily_capacity: z.number().int().min(1).max(50).optional().default(10)
});

const updateExecutiveSchema = z.object({
  name:               z.string().min(2).max(200).optional(),
  phone:              z.string().min(7).max(20).optional(),
  whatsapp_number:    z.string().min(7).max(20).optional(),
  locations:          z.array(z.string().min(2)).optional(),
  expertise:          z.array(z.string()).optional(),
  max_daily_capacity: z.number().int().min(1).max(50).optional(),
  active:             z.boolean().optional()
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided'
});

module.exports = { createExecutiveSchema, updateExecutiveSchema };
