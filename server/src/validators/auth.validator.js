'use strict';

const { z } = require('zod');

const loginSchema = {
  body: z.object({
    email: z.string().email('A valid email is required'),
    password: z.string().min(1, 'Password is required'),
  }),
};

const refreshSchema = {
  body: z.object({
    refreshToken: z.string().min(10, 'A refresh token is required'),
  }),
};

const changePasswordSchema = {
  body: z
    .object({
      currentPassword: z.string().min(1, 'Current password is required'),
      newPassword: z
        .string()
        .min(8, 'New password must be at least 8 characters')
        .max(100),
      confirmPassword: z.string(),
    })
    .refine((d) => d.newPassword === d.confirmPassword, {
      message: 'Passwords do not match',
      path: ['confirmPassword'],
    }),
};

module.exports = { loginSchema, refreshSchema, changePasswordSchema };
