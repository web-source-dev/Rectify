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

const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  jwtSecret: required('JWT_SECRET'),
  familyPin: required('FAMILY_PIN'),
  databaseUrl: required('DATABASE_URL'),
  uploadDir: process.env.UPLOAD_DIR || './data/uploads',
  maxUploadMb: parseInt(process.env.MAX_UPLOAD_MB || '300', 10),
  corsOrigin: process.env.CORS_ORIGIN || '*',
};

module.exports = config;
