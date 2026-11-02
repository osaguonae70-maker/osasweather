'use strict';
const { z, email, password, fullName } = require('./common');

const register = z.object({
  fullName,
  email,
  password,
  confirmPassword: z.string(),
  acceptTerms: z.literal(true, { error: 'You must accept the Terms and Conditions' }),
}).strict().refine((d) => d.password === d.confirmPassword, {
  path: ['confirmPassword'], message: 'Passwords do not match',
});

const login = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(128),
  rememberMe: z.boolean().optional().default(false),
}).strict();

const forgotPassword = z.object({ email }).strict();

const resetPassword = z.object({
  token: z.string().min(20).max(200),
  password,
  confirmPassword: z.string(),
}).strict().refine((d) => d.password === d.confirmPassword, {
  path: ['confirmPassword'], message: 'Passwords do not match',
});

const changePassword = z.object({
  currentPassword: z.string().min(1, 'Current password is required').max(128),
  newPassword: password,
  confirmPassword: z.string(),
}).strict().refine((d) => d.newPassword === d.confirmPassword, {
  path: ['confirmPassword'], message: 'Passwords do not match',
});

const resetTokenOnly = z.object({ token: z.string().min(20).max(200) }).strict();

const adminChangePassword = z.object({ currentPassword: z.string().min(1).max(128), newPassword: password }).strict();

const adminLogin = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(128),
}).strict();

module.exports = { register, login, forgotPassword, resetPassword, changePassword, adminLogin, resetTokenOnly, adminChangePassword };
