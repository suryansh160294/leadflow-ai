// =============================================
//  src/modules/leads/leads.schema.js
//  Zod schemas for request validation
// =============================================

'use strict';

const { z } = require('zod');

// ── Create Lead ───────────────────────────────
const createLeadSchema = z.object({
  name: z
    .string({ required_error: 'Name is required' })
    .min(2, 'Name must be at least 2 characters')
    .max(200),

  phone: z
    .string({ required_error: 'Phone is required' })
    .min(7, 'Phone number too short')
    .max(20),

  email: z
    .string().email('Invalid email').optional().or(z.literal('')),

  source: z.enum([
    '99acres', 'MagicBricks', 'Housing.com', 'Facebook Ads',
    'Google Ads', 'Referral', 'Walk-in', 'Instagram', 'NoBroker'
  ], { required_error: 'Source is required' }),

  location: z
    .string({ required_error: 'Location is required' })
    .min(2).max(150),

  budget: z.enum([
    '< ₹30L', '₹30L–₹60L', '₹60L–₹1Cr', '₹1Cr–₹2Cr', '> ₹2Cr'
  ], { required_error: 'Budget is required' }),

  property_type: z.enum([
    '1BHK Apartment', '2BHK Apartment', '3BHK Apartment',
    '4BHK+ Apartment', 'Villa', 'Plot', 'Commercial', 'Penthouse'
  ], { required_error: 'Property type is required' }),

  temperature: z.enum(['hot', 'warm', 'cold'], {
    required_error: 'Temperature is required'
  }),

  notes:       z.string().max(2000).optional(),
  force:       z.boolean().optional().default(false), // override dup warning
  utm_source:  z.string().max(200).optional(),
  utm_campaign: z.string().max(200).optional(),
  source_url:  z.string().url().optional().or(z.literal(''))
});

// ── Update Lead Status ────────────────────────
const updateLeadSchema = z.object({
  status: z.enum([
    'unassigned', 'assigned', 'contacted',
    'site_visit', 'negotiation', 'closed', 'lost'
  ]).optional(),
  notes: z.string().max(2000).optional(),
  temperature: z.enum(['hot', 'warm', 'cold']).optional()
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided'
});

// ── Reassign Lead ─────────────────────────────
const reassignLeadSchema = z.object({
  exec_id: z.string().uuid('exec_id must be a valid UUID'),
  reason:  z.string().max(500).optional()
});

// ── Check Duplicate ───────────────────────────
const checkDupSchema = z.object({
  phone: z.string().min(7).max(20),
  name:  z.string().min(2).max(200).optional()
});

module.exports = {
  createLeadSchema,
  updateLeadSchema,
  reassignLeadSchema,
  checkDupSchema
};
