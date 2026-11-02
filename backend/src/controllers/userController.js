'use strict';
const { asyncHandler, ok } = require('../utils/http');
const { E } = require('../utils/errors');
const { publicPreferences, publicUser } = require('../models/serializers');
const favRepo = require('../repositories/favouriteRepository');
const prefRepo = require('../repositories/preferenceRepository');
const userRepo = require('../repositories/userRepository');

const publicFav = (f) => ({ id: f.id, name: f.location_name, country: f.country, latitude: f.latitude, longitude: f.longitude, createdAt: f.created_at });

function createUserController({ pool, authService }) {
  return {
    listFavourites: asyncHandler(async (req, res) => {
      ok(res, { favourites: (await favRepo.list(pool, req.user.id)).map(publicFav) });
    }),
    addFavourite: asyncHandler(async (req, res) => {
      if ((await favRepo.count(pool, req.user.id)) >= favRepo.MAX_PER_USER) {
        throw E.conflict(`You can save up to ${favRepo.MAX_PER_USER} locations.`, 'FAVOURITES_LIMIT');
      }
      try {
        ok(res, { favourite: publicFav(await favRepo.insert(pool, req.user.id, req.body)) }, 201);
      } catch (err) {
        if (err.code === '23505') throw E.conflict('This location is already in your favourites.', 'FAVOURITE_EXISTS');
        throw err;
      }
    }),
    deleteFavourite: asyncHandler(async (req, res) => {
      const removed = await favRepo.remove(pool, req.user.id, req.params.id);
      if (!removed) throw E.notFound('Favourite not found.'); // same answer for "not yours" and "doesn't exist"
      ok(res, { deleted: true });
    }),

    getPreferences: asyncHandler(async (req, res) => ok(res, { preferences: publicPreferences(await prefRepo.get(pool, req.user.id)) })),
    updatePreferences: asyncHandler(async (req, res) => ok(res, { preferences: publicPreferences(await prefRepo.update(pool, req.user.id, req.body)) })),

    updateProfile: asyncHandler(async (req, res) => {
      await pool.query('UPDATE users SET full_name = $2 WHERE id = $1', [req.user.id, req.body.fullName]);
      ok(res, { user: publicUser(await userRepo.findById(pool, req.user.id)) });
    }),
    requestEmailChange: asyncHandler(async (req, res) => {
      await authService.requestEmailChange(req.user, req.body.newEmail, req.body.password);
      ok(res, { message: 'If that address is available, a confirmation link has been sent to it.' });
    }),
    confirmEmailChange: asyncHandler(async (req, res) => {
      await authService.confirmEmailChange(req.body.token);
      ok(res, { message: 'Your email address has been updated.' });
    }),
  };
}
module.exports = { createUserController };
