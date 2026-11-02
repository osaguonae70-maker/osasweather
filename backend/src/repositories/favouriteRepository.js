'use strict';
const COLS = 'id, location_name, country, latitude::float8 AS latitude, longitude::float8 AS longitude, created_at';
const MAX_PER_USER = 50;

const list = async (db, userId) =>
  (await db.query(`SELECT ${COLS} FROM favourite_locations WHERE user_id = $1 ORDER BY created_at DESC`, [userId])).rows;

const count = async (db, userId) =>
  Number((await db.query('SELECT count(*) AS n FROM favourite_locations WHERE user_id = $1', [userId])).rows[0].n);

const insert = async (db, userId, { name, country, latitude, longitude }) =>
  (await db.query(
    `INSERT INTO favourite_locations (user_id, location_name, country, latitude, longitude)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${COLS}`,
    [userId, name, country, latitude, longitude])).rows[0];

// Ownership is part of the WHERE clause: another user's id simply matches nothing.
const remove = async (db, userId, id) =>
  (await db.query('DELETE FROM favourite_locations WHERE id = $1 AND user_id = $2', [id, userId])).rowCount;

module.exports = { list, count, insert, remove, MAX_PER_USER };
