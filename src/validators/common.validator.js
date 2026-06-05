import Joi from 'joi';

export const idParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required()
});

export const locationSchema = Joi.object({
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  geoFenceVerified: Joi.boolean()
});
