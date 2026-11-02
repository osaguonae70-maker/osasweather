'use strict';
const { asyncHandler, ok } = require('../utils/http');

function createWeatherController({ weatherService }) {
  const forecast = (req) => weatherService.getForecast({
    latitude: req.validatedQuery.lat, longitude: req.validatedQuery.lon,
    temperatureUnit: req.validatedQuery.temperatureUnit, windSpeedUnit: req.validatedQuery.windSpeedUnit,
  });
  const base = (f) => ({ location: f.location, units: f.units, meta: { ...f.meta, fetchedAt: f.fetchedAt } });
  const cacheable = (res) => res.set('Cache-Control', 'private, max-age=60');
  return {
    current: asyncHandler(async (req, res) => { const f = await forecast(req); cacheable(res); ok(res, { ...base(f), current: f.current, today: f.today }); }),
    hourly: asyncHandler(async (req, res) => { const f = await forecast(req); cacheable(res); ok(res, { ...base(f), hourly: f.hourly }); }),
    daily: asyncHandler(async (req, res) => { const f = await forecast(req); cacheable(res); ok(res, { ...base(f), daily: f.daily }); }),
    // One round-trip for the dashboard (same cached upstream response).
    overview: asyncHandler(async (req, res) => {
      const f = await forecast(req); cacheable(res);
      ok(res, { ...base(f), current: f.current, today: f.today, hourly: f.hourly, daily: f.daily });
    }),
    search: asyncHandler(async (req, res) => {
      const results = await weatherService.searchLocations(req.validatedQuery.q);
      res.set('Cache-Control', 'public, max-age=300');
      ok(res, { results });
    }),
  };
}
module.exports = { createWeatherController };
