import Joi from 'joi';
import { ROLES } from '../constants/roles.js';

const email = Joi.string().trim().lowercase().email({ tlds: { allow: false } });

export const registerSchema = Joi.object({
  name: Joi.string().required(),
  email: email.required(),
  phone: Joi.string().allow(''),
  password: Joi.string().min(8).required(),
  role: Joi.string().valid(...Object.values(ROLES)),
  manager: Joi.string(),
  branch: Joi.string().allow(''),
  territory: Joi.string().allow('')
});

export const loginSchema = Joi.object({
  email: email.required(),
  password: Joi.string().required()
});
