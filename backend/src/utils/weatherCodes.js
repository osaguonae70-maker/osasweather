'use strict';
// WMO weather interpretation codes as documented by Open-Meteo.
// Icon keys are consumed by the frontend icon set (assets/js/icons.js).
const TABLE = {
  0:  { day: ['Sunny', 'Clear sky', 'clear-day'], night: ['Clear', 'Clear sky', 'clear-night'] },
  1:  { day: ['Mostly sunny', 'Mainly clear', 'clear-day'], night: ['Mostly clear', 'Mainly clear', 'clear-night'] },
  2:  { day: ['Partly cloudy', 'Partly cloudy skies', 'partly-cloudy-day'], night: ['Partly cloudy', 'Partly cloudy skies', 'partly-cloudy-night'] },
  3:  ['Overcast', 'Overcast skies', 'overcast'],
  45: ['Fog', 'Fog reducing visibility', 'fog'],
  48: ['Fog', 'Freezing fog with rime deposits', 'fog'],
  51: ['Light drizzle', 'Light drizzle', 'rain-light'],
  53: ['Drizzle', 'Moderate drizzle', 'rain-light'],
  55: ['Heavy drizzle', 'Dense drizzle', 'rain-light'],
  56: ['Freezing drizzle', 'Light freezing drizzle', 'rain-light'],
  57: ['Freezing drizzle', 'Dense freezing drizzle', 'rain-light'],
  61: ['Light rain', 'Slight rain', 'rain-light'],
  63: ['Rain', 'Moderate rain', 'rain-heavy'],
  65: ['Heavy rain', 'Heavy rain', 'rain-heavy'],
  66: ['Freezing rain', 'Light freezing rain', 'rain-light'],
  67: ['Freezing rain', 'Heavy freezing rain', 'rain-heavy'],
  71: ['Light snow', 'Slight snowfall', 'snow'],
  73: ['Snow', 'Moderate snowfall', 'snow'],
  75: ['Heavy snow', 'Heavy snowfall', 'snow'],
  77: ['Snow grains', 'Snow grains', 'snow'],
  80: ['Light showers', 'Slight rain showers', 'rain-light'],
  81: ['Showers', 'Moderate rain showers', 'rain-heavy'],
  82: ['Violent showers', 'Violent rain showers', 'rain-heavy'],
  85: ['Snow showers', 'Slight snow showers', 'snow'],
  86: ['Heavy snow showers', 'Heavy snow showers', 'snow'],
  95: ['Thunderstorm', 'Thunderstorm', 'thunder'],
  96: ['Thunderstorm', 'Thunderstorm with slight hail', 'thunder'],
  99: ['Thunderstorm', 'Thunderstorm with heavy hail', 'thunder'],
};

/**
 * Maps a WMO code (+ day/night, + optional visibility in metres) to a label/description/icon.
 * Unknown codes yield a neutral "Unavailable" rather than an invented condition.
 * Mist vs fog is not a separate WMO code: we label fog codes "Mist" only when the
 * reported visibility is >= 1 km (the meteorological threshold).
 */
function describeWeather(code, isDay = true, visibilityM = null) {
  const entry = TABLE[code];
  if (!entry) return { label: 'Unavailable', description: 'Condition not available', icon: 'unknown' };
  const [label, description, icon] = Array.isArray(entry) ? entry : entry[isDay ? 'day' : 'night'];
  if (icon === 'fog' && Number.isFinite(visibilityM) && visibilityM >= 1000) {
    return { label: 'Mist', description: 'Mist with reduced visibility', icon: 'mist' };
  }
  return { label, description, icon };
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const compass = (deg) => (Number.isFinite(deg) ? COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16] : null);

module.exports = { describeWeather, compass };
