require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    // eslint-disable-next-line no-console
    console.error(`Missing required env var: ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value;
}

// The `cors` package echoes this value straight into the Access-Control-Allow-Origin
// header without validating it, so a malformed CORS_ORIGIN (stray characters from a
// botched .env edit, a missing newline merging it with the next line, etc.) silently
// breaks every browser request with an opaque CORS error instead of a clear one. Comma-
// separate multiple real origins if you ever need to restrict this; anything that isn't
// a clean list of http(s) origins falls back to wide open rather than shipping a broken
// header.
function sanitizeCorsOrigin(raw) {
  const value = (raw || '').trim();
  if (!value || value === '*') {
    return '*';
  }
  const origins = value
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  // scheme://host(:port) only — no path, no trailing junk. Deliberately strict so a
  // corrupted/merged env line (e.g. two values concatenated without a newline) can't
  // sneak through as a "valid-looking" origin.
  const isValidOrigin = (origin) => /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/i.test(origin);
  if (origins.length > 0 && origins.every(isValidOrigin)) {
    return origins.length === 1 ? origins[0] : origins;
  }
  // eslint-disable-next-line no-console
  console.warn(`Ignoring malformed CORS_ORIGIN (${JSON.stringify(raw)}); allowing all origins.`);
  return '*';
}

const config = {
  port: parseInt(process.env.PORT || '9015', 10),
  jwtSecret: required('JWT_SECRET'),
  familyPin: required('FAMILY_PIN'),
  databaseUrl: required('DATABASE_URL'),
  uploadDir: process.env.UPLOAD_DIR || './data/uploads',
  maxUploadMb: parseInt(process.env.MAX_UPLOAD_MB || '300', 10),
  corsOrigin: sanitizeCorsOrigin(process.env.CORS_ORIGIN),
};

module.exports = config;
