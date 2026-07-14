import { body } from 'express-validator';

export const createHouseholdValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
];

export const joinHouseholdValidation = [
  body('code').trim().notEmpty().withMessage('Invite code is required'),
];
