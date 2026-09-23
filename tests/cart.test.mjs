import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/db.mjs';
import { JsonStore } from '../server/fs-store.mjs';
import { createCartHandler } from '../server/cart.mjs';

for (const Driver of [Store, JsonStore]) {
  test(`${Driver.name}: cart persistence, isolation, checkout failures and retry`, async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'iconfamily-cart-test-'));
    let store = new Driver(directory);
    try {
      store.seedAdmin('admin', 'password');
      const owner = store.authenticate('admin', 'password');
      const other = store.createUser({ username: 'other', password: 'password' });
      const a = store.createProject({
        name: 'A',
        prefix: 'a',
        description: '',
        ownerId: owner.id,
        settings: {},
      });
      const b = store.createProject({
        name: 'B',
        prefix: 'b',
        description: '',
        ownerId: owner.id,
        settings: {},
      });
      const cart = store.addCartItem(owner.id, {
        remoteId: 'remote-1',
        name: 'One',
        svg: '<svg viewBox="0 0 10 10"><path d="M0 0H10V10Z"/></svg>',
      });
      assert.equal(
        store.addCartItem(owner.id, { remoteId: 'remote-1', name: 'Overwrite', svg: '' }).id,
        cart.id,
      );
      assert.equal(store.listCart(owner.id).length, 1);
      assert.equal(store.listCart(other.id).length, 0);
      store.close();
      store = new Driver(directory);
      assert.equal(store.listCart(owner.id)[0].svg, cart.svg);
      let calls = 0;
      let fail = true;
      const handler = createCartHandler({
        store,
        requireUser: (req) => req.user,
        readBody: async (req) => req.body,
        json: (res, status, payload) => Object.assign(res, { status, payload }),
        errorResponse: (res, status, error) => Object.assign(res, { status, error }),
        canAccessProject: ({ user }, project) => project.owner_id === user.id,
        resolveRemoteSvg: async () => {
          throw new Error('Checkout must not contact iconfont');
        },
        importItems: async (project, items) => {
          calls++;
          assert.equal(items[0].svg, cart.svg);
          const failed = fail && project.id === b.id;
          return {
            succeeded: failed ? 0 : 1,
            skipped: 0,
            failed: failed ? 1 : 0,
            report: [
              {
                status: failed ? 'failed' : 'success',
                reason: failed ? 'Simulated storage error' : undefined,
              },
            ],
          };
        },
      });
      const request = async (user, action, body, method = 'POST') => {
        const response = {};
        await handler({ user, body }, response, action ? ['cart', action] : ['cart'], method);
        return response;
      };
      const unauthorized = await request(other, 'checkout', {
        itemIds: [cart.id],
        projectIds: [a.id],
      });
      assert.equal(unauthorized.status, 409);
      assert.equal(calls, 0);
      const inaccessible = store.createProject({
        name: 'Private',
        prefix: 'private',
        description: '',
        ownerId: other.id,
        settings: {},
      });
      const forbidden = await request(owner, 'checkout', {
        itemIds: [cart.id],
        projectIds: [a.id, inaccessible.id],
      });
      assert.equal(forbidden.status, 403);
      assert.equal(calls, 0);
      const partial = await request(owner, 'checkout', {
        itemIds: [cart.id],
        projectIds: [a.id, b.id],
      });
      assert.equal(partial.payload.failures.length, 1);
      assert.deepEqual(partial.payload.removedIds, []);
      assert.equal(store.listCart(owner.id).length, 1);
      fail = false;
      const success = await request(owner, 'checkout', {
        itemIds: [cart.id],
        projectIds: [a.id, b.id],
      });
      assert.deepEqual(success.payload.removedIds, [cart.id]);
      assert.equal(store.listCart(owner.id).length, 0);
      assert.equal(calls, 4);
    } finally {
      store.close();
      assert(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
}
