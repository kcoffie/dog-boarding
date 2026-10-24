/**
 * A form job is fetched only for its boarding's dog's own pet ID (#344): jobs queued before PR 2 took the
 * schedule's first pet, which can be another pet's.
 * @requirements REQ-661
 */

import { describe, it, expect } from 'vitest';
import { formJobPetMatches } from '../../lib/scraper/forms.js';
import { createFakeSupabase } from './fakeSupabase.js';

const withBoarding = (petId) => {
  const db = createFakeSupabase();
  const dog = db._addDog({ name: 'Biscuit Sample', external_pet_id: petId });
  const boarding = db._addBoarding({ dog_id: dog.id, external_id: 'BK000001' });
  return { db, boarding };
};

describe("REQ-661: a form job only for its boarding's dog's pet", () => {
  it("the dog's own pet ID: fetch", async () => {
    const { db, boarding } = withBoarding('40001');
    expect(await formJobPetMatches(db, boarding.id, '40001')).toBe(true);
  });

  it("another pet's ID: no fetch", async () => {
    const { db, boarding } = withBoarding('40001');
    expect(await formJobPetMatches(db, boarding.id, '40002')).toBe(false);
  });

  it('a dog with no pet ID: no fetch', async () => {
    const { db, boarding } = withBoarding(null);
    expect(await formJobPetMatches(db, boarding.id, '40001')).toBe(false);
  });

  it('a boarding that no longer exists: no fetch', async () => {
    const { db } = withBoarding('40001');
    expect(await formJobPetMatches(db, 'boarding-gone', '40001')).toBe(false);
  });

  it('a database error is thrown, not read as a match', async () => {
    const db = createFakeSupabase({ failOn: (table) => (table === 'dogs' ? { code: 'XX000', message: 'boom' } : null) });
    const boarding = db._addBoarding({ dog_id: 'dog-1', external_id: 'BK000001' });
    await expect(formJobPetMatches(db, boarding.id, '40001')).rejects.toMatchObject({ message: 'boom' });
  });

  it('a database error reading the boarding is thrown too', async () => {
    const db = createFakeSupabase({ failOn: (table) => (table === 'boardings' ? { code: 'XX000', message: 'boom' } : null) });
    await expect(formJobPetMatches(db, 'b1', '40001')).rejects.toMatchObject({ message: 'boom' });
  });
});
