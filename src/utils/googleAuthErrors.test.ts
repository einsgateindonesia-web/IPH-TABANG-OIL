import assert from 'node:assert/strict';
import test from 'node:test';
import { formatGoogleAuthError } from './googleAuthErrors';

test('formatGoogleAuthError translates auth/unauthorized-domain with exact hostname', () => {
  const formatted = formatGoogleAuthError(
    { code: 'auth/unauthorized-domain', message: 'Firebase: Error (auth/unauthorized-domain).' },
    'ip-plant-hauling.vercel.app'
  );
  assert.equal(formatted.code, 'auth/unauthorized-domain');
  assert.equal(formatted.unauthorizedDomain, 'ip-plant-hauling.vercel.app');
  assert.match(formatted.message, /ip-plant-hauling\.vercel\.app/);
  assert.match(formatted.message, /Authorized domains/i);
});

test('formatGoogleAuthError translates popup-blocked and popup-closed-by-user cleanly', () => {
  const blocked = formatGoogleAuthError({ code: 'auth/popup-blocked' });
  assert.equal(blocked.code, 'auth/popup-blocked');
  assert.match(blocked.message, /Popup login Google diblokir/i);

  const closed = formatGoogleAuthError({ code: 'auth/popup-closed-by-user' });
  assert.equal(closed.code, 'auth/popup-closed-by-user');
  assert.match(closed.message, /dibatalkan/i);
});
