/**
 * Expo config — static settings from app.json; secrets from .env (local) or EAS Environment Variables (cloud).
 *
 * Do NOT put API keys in eas.json. Configure once per environment on Expo:
 *   eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value "..." --environment production --visibility plaintext
 */
const appJson = require('./app.json');

const REQUIRED_ENV = [
  'EXPO_PUBLIC_API_BASE_URL',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY',
];

function missingEnvKeys() {
  return REQUIRED_ENV.filter((key) => !process.env[key]?.trim());
}

if (process.env.EAS_BUILD === 'true') {
  const missing = missingEnvKeys();
  if (missing.length > 0) {
    throw new Error(
      `EAS build missing environment variables: ${missing.join(', ')}.\n` +
        'Add them under Expo → Project → Environment variables, or run:\n' +
        '  eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value "..." --environment production --visibility plaintext',
    );
  }
}

module.exports = appJson.expo;
