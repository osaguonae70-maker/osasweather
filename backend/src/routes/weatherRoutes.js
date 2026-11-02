'use strict';
const express = require('express');
const { validate } = require('../validators/common');
const v = require('../validators/weather');

function createWeatherRoutes({ controller, limiters }) {
  const r = express.Router();
  r.use(limiters.weather);
  r.get('/search', validate(v.search, 'query'), controller.search);
  r.get('/current', validate(v.coords, 'query'), controller.current);
  r.get('/hourly', validate(v.coords, 'query'), controller.hourly);
  r.get('/daily', validate(v.coords, 'query'), controller.daily);
  r.get('/overview', validate(v.coords, 'query'), controller.overview);
  return r;
}
module.exports = { createWeatherRoutes };
