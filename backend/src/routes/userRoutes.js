'use strict';
const express = require('express');
const { validate } = require('../validators/common');
const v = require('../validators/user');

function createFavouriteRoutes({ controller, requireUser }) {
  const r = express.Router();
  r.use(requireUser);
  r.get('/', controller.listFavourites);
  r.post('/', validate(v.favourite), controller.addFavourite);
  r.delete('/:id', validate(v.idParam, 'params'), controller.deleteFavourite);
  return r;
}
function createPreferenceRoutes({ controller, requireUser }) {
  const r = express.Router();
  r.use(requireUser);
  r.get('/', controller.getPreferences);
  r.patch('/', validate(v.preferences), controller.updatePreferences);
  return r;
}
module.exports = { createFavouriteRoutes, createPreferenceRoutes };
