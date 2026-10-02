import test from 'node:test';
import assert from 'node:assert/strict';

import { requestPasswordReset, resetPasswordWithToken, readStoredUsers } from '../src/lib/authReset.js';

class MemoryStorage {
  constructor() {
    this.store = new Map();
  }

  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }

  setItem(key, value) {
    this.store.set(key, String(value));
  }

  removeItem(key) {
    this.store.delete(key);
  }
}

test('password reset flow updates a stored user password', () => {
  const storage = new MemoryStorage();
  storage.setItem('nexus-chat-users', JSON.stringify([
    {
      nexus_id: '1000000001',
      nexusId: '1000000001',
      member_id: '1000000001',
      first_name: 'Alice',
      last_name: 'Example',
      email: 'alice@example.com',
      password: 'old-password',
    },
  ]));

  const request = requestPasswordReset('alice@example.com', storage);

  assert.equal(request.ok, true);
  assert.ok(request.token);

  const result = resetPasswordWithToken(request.token, 'new-password-123', storage);

  assert.equal(result.ok, true);
  assert.equal(readStoredUsers(storage)[0].password, 'new-password-123');
});
