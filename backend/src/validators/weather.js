'use strict';
const { z } = require('./common');

const coords = z.object({
  lat: z.coerce.number({ error: 'lat must be a number' }).min(-90, 'lat must be between -90 and 90').max(90, 'lat must be between -90 and 90'),
  lon: z.coerce.number({ error: 'lon must be a number' }).min(-180, 'lon must be between -180 and 180').max(180, 'lon must be between -180 and 180'),
  temperatureUnit: z.enum(['celsius', 'fahrenheit']).optional().default('celsius'),
  windSpeedUnit: z.enum(['kmh', 'mph', 'ms', 'kn']).optional().default('kmh'),
});
const search = z.object({ q: z.string().trim().min(2, 'Enter at least 2 characters').max(100) });
module.exports = { coords, search };
