/**
 * A dog is its booking-site pet ID (#344, ADR-008): how mapAndSaveAppointment finds, links and creates each
 * pet's dog, keeps each boarding on its dog, and reports what it can't decide instead of writing it.
 * Pages: twoPetPages.js (structure of two real two-pet bookings), parsed by the real parser.
 * Expected values (rates, totals, dates) are worked out in twoPetPages.js's header.
 * @requirements REQ-661
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mapAndSaveAppointment, findDogsByName } from '../../lib/scraper/mapping.js';
import { parseAppointmentPage } from '../../lib/scraper/extraction.js';
import { createFakeSupabase } from './fakeSupabase.js';
import { twoPetPage, onePetPage, noPetPage, BISCUIT, CLOVER } from './twoPetPages.js';

const BOOKING = 'BK000001';
const read = (html) => ({ ...parseAppointmentPage(html, `/schedule/a/${BOOKING}/1793721600`), external_id: BOOKING });
const save = (db, html = twoPetPage(), options = {}) => mapAndSaveAppointment(read(html), { supabase: db, ...options });

const dogOf = (db, petId) => db._mockData.dogs.find((d) => d.external_pet_id === petId);
const boarding = (db, externalId) => db._mockData.boardings.find((b) => b.external_id === externalId);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-24T12:00:00Z'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.useRealTimers());

describe('REQ-661: a two-pet booking with neither pet in the app', () => {
  it('each pet becomes a dog with its own pet ID', async () => {
    const db = createFakeSupabase();
    await save(db);
    expect(db._mockData.dogs.map((d) => [d.name, d.external_pet_id])).toEqual([
      ['Biscuit Sample', '40001'],
      ['Clover Sample', '40002'],
    ]);
  });

  it('each dog gets the rates on its own price divs', async () => {
    const db = createFakeSupabase();
    await save(db);
    expect([dogOf(db, '40001').night_rate, dogOf(db, '40001').day_rate]).toEqual([55, 50]);
    expect([dogOf(db, '40002').night_rate, dogOf(db, '40002').day_rate]).toEqual([45, 35]);
  });

  it("the first pet takes the booking's ID with its $1170 total; the second takes _p1 with none", async () => {
    const db = createFakeSupabase();
    await save(db);
    expect(boarding(db, BOOKING)).toMatchObject({ dog_id: dogOf(db, '40001').id, billed_amount: 1170, night_rate: 55, day_rate: 50 });
    expect(boarding(db, `${BOOKING}_p1`)).toMatchObject({ dog_id: dogOf(db, '40002').id, billed_amount: null, night_rate: 45, day_rate: 35 });
  });

  it("every pet's boarding has the booking's dates", async () => {
    const db = createFakeSupabase();
    await save(db);
    expect(db._mockData.boardings.map((b) => [b.arrival_datetime, b.departure_datetime])).toEqual([
      ['2026-11-03T16:00:00.000Z', '2026-11-12T17:00:00.000Z'],
      ['2026-11-03T16:00:00.000Z', '2026-11-12T17:00:00.000Z'],
    ]);
  });

  it('no dog is given a booking ID', async () => {
    const db = createFakeSupabase();
    await save(db);
    expect(db._mockData.dogs.map((d) => d.external_id)).toEqual([undefined, undefined]);
  });

  it("the second pet gets a form job by its own pet ID, as the first does", async () => {
    const db = createFakeSupabase();
    await save(db);
    const jobs = db._mockData.sync_queue.map((q) => [q.external_id, q.source_url, q.meta.external_pet_id]);
    expect(jobs).toEqual([
      [`form_${boarding(db, BOOKING).id}`, '/pets/40001/forms', '40001'],
      [`form_${boarding(db, `${BOOKING}_p1`).id}`, '/pets/40002/forms', '40002'],
    ]);
  });

  it("the sync row is linked to the dog and boarding holding the booking's own ID", async () => {
    const db = createFakeSupabase();
    await save(db);
    const row = db._mockData.sync_appointments[0];
    expect([row.mapped_dog_id, row.mapped_boarding_id]).toEqual([dogOf(db, '40001').id, boarding(db, BOOKING).id]);
  });

  it('the stored booking keeps the client ID, for later evidence', async () => {
    const db = createFakeSupabase();
    await save(db);
    expect(db._mockData.sync_appointments[0].raw_data.client_uid).toBe('30001');
  });

  it('reading the booking again adds nothing: still 2 dogs and 2 boardings, no notices', async () => {
    const db = createFakeSupabase();
    await save(db);
    const again = await save(db);
    expect([db._mockData.dogs.length, db._mockData.boardings.length, again.notices]).toEqual([2, 2, []]);
  });
});

describe('REQ-661: a dog that already has the pet ID', () => {
  it("is that pet's dog, and a different name on the site is reported, never written", async () => {
    const db = createFakeSupabase();
    db._addDog({ name: 'Biscuit Old', external_pet_id: '40001', source: 'external' });
    const result = await save(db);
    expect(dogOf(db, '40001').name).toBe('Biscuit Old');
    expect(result.notices).toEqual(['pet 40001 is "Biscuit Sample" on the booking site but "Biscuit Old" in the app (not renamed)']);
  });

  it('gets the rates from its own price divs', async () => {
    const db = createFakeSupabase();
    db._addDog({ name: 'Clover Sample', external_pet_id: '40002', night_rate: 30, day_rate: 20, source: 'external' });
    await save(db);
    expect([dogOf(db, '40002').night_rate, dogOf(db, '40002').day_rate]).toEqual([45, 35]);
  });

  it('a hand-entered dog found by its pet ID stays hand-entered', async () => {
    const db = createFakeSupabase();
    db._addDog({ name: 'Biscuit Sample', external_pet_id: '40001', source: 'manual' });
    await save(db);
    expect(dogOf(db, '40001').source).toBe('manual');
  });

  it('a pet ID held by two dogs (before the unique index) writes nothing for that pet', async () => {
    const db = createFakeSupabase({ uniquePetId: false });
    db._addDog({ name: 'Biscuit Sample', external_pet_id: '40001' });
    db._addDog({ name: 'Biscuit Twin', external_pet_id: '40001' });
    const result = await save(db);
    expect(result.notices).toEqual(['pet 40001 ("Biscuit Sample") is on 2 dogs in the app; nothing saved for this pet']);
    expect(db._mockData.boardings.map((b) => b.dog_id)).toEqual([dogOf(db, '40002').id]);
  });
});

describe('REQ-661: a same-name dog with no pet ID is linked only with evidence (Kate, 2026-10-24)', () => {
  const sameNameDog = (db, extra = {}) => db._addDog({ name: 'Clover Sample', external_pet_id: null, source: 'external', ...extra });

  it('this booking already has a boarding on it: it gets the pet ID and keeps its boarding', async () => {
    const db = createFakeSupabase();
    const clover = sameNameDog(db);
    db._addBoarding({ dog_id: clover.id, external_id: `${BOOKING}_p1`, arrival_datetime: '2026-11-03T16:00:00.000Z', departure_datetime: '2026-11-12T17:00:00.000Z' });
    const result = await save(db);
    expect(clover.external_pet_id).toBe('40002');
    expect(boarding(db, `${BOOKING}_p1`).dog_id).toBe(clover.id);
    expect(db._mockData.dogs).toHaveLength(2);
    expect(result.stats.dogUpdated).toBe(true);
  });

  it('a linked dog counts as updated, not created', async () => {
    const db = createFakeSupabase();
    const clover = sameNameDog(db);
    db._addBoarding({ dog_id: clover.id, external_id: `${BOOKING}_p1` });
    const biscuit = db._addDog({ name: 'Biscuit Sample', external_pet_id: '40001' });
    db._addBoarding({ dog_id: biscuit.id, external_id: BOOKING });
    const result = await save(db);
    expect([result.stats.dogCreated, result.stats.dogUpdated]).toEqual([false, true]);
  });

  it("its stored bookings carry this client's ID: it's linked", async () => {
    const db = createFakeSupabase();
    const clover = sameNameDog(db);
    db._addBoarding({ dog_id: clover.id, external_id: 'OLD00001' });
    db._addSyncAppointment({ external_id: 'OLD00001', client_name: '', raw_data: { client_uid: '30001' } });
    await save(db);
    expect(clover.external_pet_id).toBe('40002');
  });

  it("its stored bookings name this client (ignoring case and spaces): it's linked", async () => {
    const db = createFakeSupabase();
    const clover = sameNameDog(db);
    db._addSyncAppointment({ external_id: 'OLD00001', client_name: ' sam SAMPLE ', mapped_dog_id: clover.id, raw_data: {} });
    await save(db);
    expect(clover.external_pet_id).toBe('40002');
  });

  it('a stored booking from another client: not linked, nothing saved for that pet, Kate is told', async () => {
    const db = createFakeSupabase();
    const clover = sameNameDog(db);
    db._addBoarding({ dog_id: clover.id, external_id: 'OLD00001' });
    db._addSyncAppointment({ external_id: 'OLD00001', client_name: 'Other Person', raw_data: {} });
    const result = await save(db);
    expect(clover.external_pet_id).toBeNull();
    expect(result.notices).toEqual(['"Clover Sample" (pet 40002): the app\'s dog with that name has bookings from another client; not linked, nothing saved for this pet']);
    expect(db._mockData.boardings.filter((b) => b.external_id.startsWith(BOOKING)).map((b) => b.dog_id)).toEqual([dogOf(db, '40001').id]);
  });

  it("another client's booking rules it out even when this booking has a boarding on it", async () => {
    const db = createFakeSupabase();
    const clover = sameNameDog(db);
    db._addBoarding({ dog_id: clover.id, external_id: `${BOOKING}_p1` });
    db._addSyncAppointment({ external_id: 'OLD00001', client_name: 'Other Person', mapped_dog_id: clover.id, raw_data: {} });
    await save(db);
    expect(clover.external_pet_id).toBeNull();
  });

  it("a stored booking with another client's ID rules it out, whatever its name says", async () => {
    const db = createFakeSupabase();
    const clover = sameNameDog(db);
    db._addSyncAppointment({ external_id: 'OLD00001', client_name: 'Sam Sample', mapped_dog_id: clover.id, raw_data: { client_uid: '30999' } });
    await save(db);
    expect(clover.external_pet_id).toBeNull();
  });

  it('no evidence at all (a hand-entered dog with no bookings): not linked, Kate is told', async () => {
    const db = createFakeSupabase();
    const clover = sameNameDog(db, { source: 'manual' });
    const result = await save(db);
    expect(clover.external_pet_id).toBeNull();
    expect(result.notices).toEqual(['"Clover Sample" (pet 40002): the app has a dog with that name, but nothing shows it\'s this pet; not linked, nothing saved for this pet']);
  });

  it('stored bookings with no client recorded are no evidence', async () => {
    const db = createFakeSupabase();
    const clover = sameNameDog(db);
    db._addSyncAppointment({ external_id: 'OLD00001', client_name: '', mapped_dog_id: clover.id, raw_data: {} });
    await save(db);
    expect(clover.external_pet_id).toBeNull();
  });

  it('two same-name dogs with no pet ID: nothing saved for that pet, Kate is told, the other pet is saved', async () => {
    const db = createFakeSupabase();
    sameNameDog(db);
    sameNameDog(db);
    const result = await save(db);
    expect(result.notices).toEqual(['"Clover Sample" (pet 40002): 2 dogs in the app have that name and no pet ID; nothing saved for this pet']);
    expect(db._mockData.boardings.map((b) => [b.external_id, b.dog_id])).toEqual([[BOOKING, dogOf(db, '40001').id]]);
  });

  it('a same-name dog with a different pet ID is another dog: a new dog is made, and it keeps its ID', async () => {
    const db = createFakeSupabase();
    const other = sameNameDog(db, { external_pet_id: '49999' });
    await save(db);
    expect(other.external_pet_id).toBe('49999');
    expect(dogOf(db, '40002').id).not.toBe(other.id);
  });
});

describe('REQ-661: two sync runs at once', () => {
  const linkable = (db) => {
    const clover = db._addDog({ name: 'Clover Sample', external_pet_id: null, source: 'external' });
    db._addBoarding({ dog_id: clover.id, external_id: `${BOOKING}_p1` });
    return clover;
  };

  it('another run gave the dog a different pet ID between the read and the write: no write, Kate is told', async () => {
    const db = createFakeSupabase();
    const clover = linkable(db);
    db._hooks.beforeUpdate = (table, rows) => {
      if (table === 'dogs' && rows.some((r) => r.id === clover.id)) clover.external_pet_id = '48888';
    };
    db._addDog({ name: 'Biscuit Sample', external_pet_id: '40001' });
    db._addBoarding({ dog_id: dogOf(db, '40001').id, external_id: BOOKING });
    const result = await save(db);
    expect(clover.external_pet_id).toBe('48888');
    expect(result.stats.dogCreated).toBe(false);
    expect(result.notices).toEqual(['"Clover Sample" (pet 40002): another sync run gave the app\'s dog with that name a different pet ID first; nothing saved for this pet']);
  });

  it('another run linked the dog to this same pet ID first: it is used, nothing to report', async () => {
    const db = createFakeSupabase();
    const clover = linkable(db);
    db._hooks.beforeUpdate = (table, rows) => {
      if (table === 'dogs' && rows.some((r) => r.id === clover.id)) clover.external_pet_id = '40002';
    };
    const result = await save(db);
    expect([clover.external_pet_id, result.notices]).toEqual(['40002', []]);
    expect(boarding(db, `${BOOKING}_p1`).dog_id).toBe(clover.id);
  });

  it('another run gave a different dog this pet ID while linking (a unique-index error): that dog is used', async () => {
    const db = createFakeSupabase();
    const clover = linkable(db);
    db._hooks.beforeUpdate = (table, rows) => {
      if (table === 'dogs' && rows.some((r) => r.id === clover.id) && !dogOf(db, '40002')) {
        db._addDog({ id: 'dog-other-run', name: 'Clover Sample', external_pet_id: '40002' });
      }
    };
    const result = await save(db);
    expect(clover.external_pet_id).toBeNull();
    expect(dogOf(db, '40002').id).toBe('dog-other-run');
    expect(result.notices).toEqual([`boarding ${BOOKING}_p1 is on a dog that isn't on this booking's page now; left as it is`]);
  });

  it("another run created the pet's dog first (a unique-index error): that dog is used, no duplicate", async () => {
    const db = createFakeSupabase();
    db._hooks.beforeInsert = (table, rows) => {
      if (table === 'dogs' && rows[0].external_pet_id === '40001' && !dogOf(db, '40001')) {
        db._addDog({ id: 'dog-other-run', name: 'Biscuit Sample', external_pet_id: '40001' });
      }
    };
    await save(db);
    expect(db._mockData.dogs.filter((d) => d.external_pet_id === '40001').map((d) => d.id)).toEqual(['dog-other-run']);
    expect(boarding(db, BOOKING).dog_id).toBe('dog-other-run');
  });
});

describe('REQ-661: each boarding stays on its dog', () => {
  const bothDogs = (db) => ({
    biscuit: db._addDog({ name: 'Biscuit Sample', external_pet_id: '40001' }),
    clover: db._addDog({ name: 'Clover Sample', external_pet_id: '40002' }),
  });

  it("a change in pet order moves no boarding: the booking's ID stays on its dog, with the total", async () => {
    const db = createFakeSupabase();
    const { biscuit, clover } = bothDogs(db);
    db._addBoarding({ dog_id: clover.id, external_id: BOOKING, billed_amount: 1170 });
    db._addBoarding({ dog_id: biscuit.id, external_id: `${BOOKING}_p1`, billed_amount: null });
    await save(db);
    expect(boarding(db, BOOKING)).toMatchObject({ dog_id: clover.id, billed_amount: 1170, night_rate: 45 });
    expect(boarding(db, `${BOOKING}_p1`)).toMatchObject({ dog_id: biscuit.id, billed_amount: null, night_rate: 55 });
    expect(db._mockData.boardings).toHaveLength(2);
  });

  it("after a pet-order change the sync row stays linked to the dog holding the booking's ID", async () => {
    const db = createFakeSupabase();
    const { biscuit, clover } = bothDogs(db);
    db._addBoarding({ dog_id: clover.id, external_id: BOOKING });
    db._addBoarding({ dog_id: biscuit.id, external_id: `${BOOKING}_p1` });
    await save(db);
    expect(db._mockData.sync_appointments[0].mapped_dog_id).toBe(clover.id);
  });

  it("a boarding on a dog that isn't on the page now is left as it is and reported; the pets take free slots", async () => {
    const db = createFakeSupabase();
    const other = db._addDog({ name: 'Other Dog', external_pet_id: '49999' });
    db._addBoarding({ dog_id: other.id, external_id: BOOKING, billed_amount: 900 });
    const result = await save(db);
    expect(boarding(db, BOOKING)).toMatchObject({ dog_id: other.id, billed_amount: 900 });
    expect([boarding(db, `${BOOKING}_p1`).dog_id, boarding(db, `${BOOKING}_p2`).dog_id]).toEqual([dogOf(db, '40001').id, dogOf(db, '40002').id]);
    expect(result.notices).toEqual([`boarding ${BOOKING} is on a dog that isn't on this booking's page now; left as it is`]);
  });

  it("another booking whose ID starts with this one's is not this booking's boarding", async () => {
    const db = createFakeSupabase();
    const { biscuit } = bothDogs(db);
    db._addBoarding({ dog_id: biscuit.id, external_id: `${BOOKING}X` });
    await save(db);
    expect(boarding(db, `${BOOKING}X`).dog_id).toBe(biscuit.id);
    expect(boarding(db, BOOKING).dog_id).toBe(biscuit.id);
    expect(db._mockData.boardings).toHaveLength(3);
  });

  it("a cancelled booking is cancelled on every pet's boarding", async () => {
    const db = createFakeSupabase();
    await mapAndSaveAppointment({ ...read(twoPetPage()), booking_status: 'canceled' }, { supabase: db });
    expect(db._mockData.boardings.map((b) => b.booking_status)).toEqual(['canceled', 'canceled']);
  });
});

describe("REQ-661: pets the page doesn't identify", () => {
  it("a pet whose link doesn't check out is not saved and is reported; the other pet takes the booking's ID", async () => {
    const db = createFakeSupabase();
    const result = await save(db, twoPetPage({ linkOverrides: { 40001: { href: '/pets/40009', dataPet: '40001' } } }));
    expect(result.notices).toEqual(['"Biscuit Sample": the page gave no usable pet ID, so nothing was saved for this pet']);
    expect(db._mockData.dogs.map((d) => d.external_pet_id)).toEqual(['40002']);
    expect(boarding(db, BOOKING)).toMatchObject({ dog_id: dogOf(db, '40002').id, billed_amount: 1170 });
  });

  it('the same pet listed twice is saved once and reported', async () => {
    const db = createFakeSupabase();
    const result = await save(db, twoPetPage({ links: [BISCUIT, BISCUIT] }));
    expect(db._mockData.boardings.map((b) => b.external_id)).toEqual([BOOKING]);
    expect(result.notices).toEqual([`two pets on the page are the same dog in the app (${dogOf(db, '40001').id}); the second wasn't saved`]);
  });

  it('a pet with no price div of its own gets no rates: a new dog at $0, a boarding with none', async () => {
    const db = createFakeSupabase();
    await save(db, twoPetPage({ unpricedPet: CLOVER.id }));
    expect([dogOf(db, '40002').night_rate, boarding(db, `${BOOKING}_p1`).night_rate]).toEqual([0, null]);
  });

  it("a pet ID the schedule lists but the page doesn't is logged", async () => {
    const db = createFakeSupabase();
    await save(db, twoPetPage(), { schedulePetIds: ['40002', '40003'] });
    expect(console.warn.mock.calls.map((c) => c.join(' ')).some((l) => l.includes(`${BOOKING}: schedule lists pet ID(s) 40003 that the booking's page doesn't`))).toBe(true);
  });
});

describe('REQ-661: a one-pet booking', () => {
  it("every price on the page is the pet's, even without data-pet: $60 a night, $180 billed", async () => {
    const db = createFakeSupabase();
    await save(db, onePetPage());
    expect([dogOf(db, '40001').night_rate, boarding(db, BOOKING).night_rate, boarding(db, BOOKING).billed_amount]).toEqual([60, 60, 180]);
  });
});

describe("REQ-661: a staff member's dog (no pet element; Kate, 2026-10-24)", () => {
  const staffPage = (name = 'Dog S') => ({ ...read(noPetPage()), pet_name: name });

  it('one same-name dog with no pet ID is the dog', async () => {
    const db = createFakeSupabase();
    const staffDog = db._addDog({ name: 'Dog S', external_pet_id: null });
    await mapAndSaveAppointment(staffPage(), { supabase: db });
    expect(boarding(db, BOOKING).dog_id).toBe(staffDog.id);
    expect(db._mockData.dogs).toHaveLength(1);
  });

  it('no such dog: one is created, with no pet ID', async () => {
    const db = createFakeSupabase();
    const result = await mapAndSaveAppointment(staffPage(), { supabase: db });
    expect(db._mockData.dogs.map((d) => [d.name, d.external_pet_id])).toEqual([['Dog S', undefined]]);
    expect(result.stats.dogCreated).toBe(true);
  });

  it('a same-name dog with a pet ID is not it', async () => {
    const db = createFakeSupabase();
    const petDog = db._addDog({ name: 'Dog S', external_pet_id: '40005' });
    await mapAndSaveAppointment(staffPage(), { supabase: db });
    expect(boarding(db, BOOKING).dog_id).not.toBe(petDog.id);
  });

  it('two same-name dogs with no pet ID: nothing saved but the sync row, Kate is told', async () => {
    const db = createFakeSupabase();
    db._addDog({ name: 'Dog S', external_pet_id: null });
    db._addDog({ name: 'Dog S', external_pet_id: null });
    const result = await mapAndSaveAppointment(staffPage(), { supabase: db });
    expect(result.notices).toEqual(['"Dog S" (no pet on the page): 2 dogs in the app have that name and no pet ID; nothing saved']);
    expect(db._mockData.boardings).toHaveLength(0);
    expect(db._mockData.sync_appointments[0].mapped_dog_id).toBeNull();
    expect([result.stats.dogCreated, result.stats.dogUpdated]).toEqual([false, false]);
  });

  it('no name in the title either: nothing saved, Kate is told', async () => {
    const db = createFakeSupabase();
    const result = await mapAndSaveAppointment(staffPage(null), { supabase: db });
    expect(result.notices).toEqual(['no pet on the page and no name in its title; nothing saved']);
    expect(db._mockData.dogs).toHaveLength(0);
    expect([result.stats.dogCreated, result.stats.dogUpdated]).toEqual([false, false]);
  });
});

describe('REQ-661: what a save reports and returns', () => {
  it('the first read of a booking creates its dogs and boardings', async () => {
    const result = await save(createFakeSupabase());
    expect(result.stats).toMatchObject({ dogCreated: true, dogUpdated: false, boardingCreated: true, boardingUpdated: false });
  });

  it('reading it again updates them and creates nothing', async () => {
    const db = createFakeSupabase();
    await save(db);
    const result = await save(db);
    expect(result.stats).toMatchObject({ dogCreated: false, dogUpdated: true, boardingCreated: false, boardingUpdated: true });
  });

  it('one known pet and one new pet: a dog is both updated and created', async () => {
    const db = createFakeSupabase();
    db._addDog({ name: 'Biscuit Sample', external_pet_id: '40001' });
    const result = await save(db);
    expect([result.stats.dogCreated, result.stats.dogUpdated]).toEqual([true, true]);
  });

  it('a booking where no pet could be saved counts nothing as created or updated', async () => {
    const db = createFakeSupabase();
    const bad = { href: '/pets/49999', dataPet: '40001' };
    const result = await save(db, twoPetPage({ linkOverrides: { 40001: bad, 40002: { href: '/pets/49999', dataPet: '40002' } } }));
    expect(result.stats).toMatchObject({ dogCreated: false, dogUpdated: false, boardingCreated: false, boardingUpdated: false });
    expect([result.dog, result.boarding]).toEqual([null, null]);
  });

  it("it returns the dog and boarding holding the booking's ID", async () => {
    const db = createFakeSupabase();
    const result = await save(db);
    expect([result.dog.id, result.boarding.external_id]).toEqual([dogOf(db, '40001').id, BOOKING]);
  });
});

describe('REQ-661: new and refreshed dogs', () => {
  it('a new dog is active and from the booking site', async () => {
    const db = createFakeSupabase();
    await save(db);
    expect([dogOf(db, '40001').active, dogOf(db, '40001').source]).toEqual([true, 'external']);
  });

  it('a dog the booking site still books is made active again', async () => {
    const db = createFakeSupabase();
    db._addDog({ name: 'Biscuit Sample', external_pet_id: '40001', active: false });
    await save(db);
    expect(dogOf(db, '40001').active).toBe(true);
  });

  it('a linked dog is made active too', async () => {
    const db = createFakeSupabase();
    const clover = db._addDog({ name: 'Clover Sample', external_pet_id: null, active: false });
    db._addBoarding({ dog_id: clover.id, external_id: `${BOOKING}_p1` });
    await save(db);
    expect(clover.active).toBe(true);
  });

  it('a page without pricing leaves the stored rates as they are', async () => {
    const db = createFakeSupabase();
    db._addDog({ name: 'Biscuit Sample', external_pet_id: '40001', night_rate: 65, day_rate: 40 });
    await mapAndSaveAppointment({ ...read(twoPetPage()), pricing: null }, { supabase: db });
    expect([dogOf(db, '40001').night_rate, dogOf(db, '40001').day_rate]).toEqual([65, 40]);
  });

  it('a two-pet page without pricing saves both dogs at $0', async () => {
    const db = createFakeSupabase();
    await mapAndSaveAppointment({ ...read(twoPetPage()), pricing: null }, { supabase: db });
    expect(db._mockData.dogs.map((d) => [d.night_rate, d.day_rate])).toEqual([[0, 0], [0, 0]]);
  });

  it('a $0 rate on the site never overwrites a stored rate', async () => {
    const db = createFakeSupabase();
    db._addDog({ name: 'Biscuit Sample', external_pet_id: '40001', night_rate: 65, day_rate: 40 });
    const page = read(twoPetPage());
    page.pricing.ratesByPet['40001'] = { nightRate: 0, dayRate: 0 };
    await mapAndSaveAppointment(page, { supabase: db });
    expect([dogOf(db, '40001').night_rate, dogOf(db, '40001').day_rate]).toEqual([65, 40]);
  });

  it('before the unique index exists, a known pet ID still never gets a second dog', async () => {
    const db = createFakeSupabase({ uniquePetId: false });
    db._addDog({ name: 'Biscuit Sample', external_pet_id: '40001' });
    await save(db);
    expect(db._mockData.dogs.filter((d) => d.external_pet_id === '40001')).toHaveLength(1);
  });

  it('a name with a LIKE wildcard in it matches only itself', async () => {
    const db = createFakeSupabase();
    db._addDog({ name: 'Max_1' });
    db._addDog({ name: 'Max21' });
    expect((await findDogsByName(db, 'Max_1')).map((d) => d.name)).toEqual(['Max_1']);
  });
});

describe('REQ-661: evidence for a link, edge cases', () => {
  const sameNameDog = (db) => db._addDog({ name: 'Clover Sample', external_pet_id: null });

  it("a dog's second-pet boarding on another booking counts that booking's client", async () => {
    const db = createFakeSupabase();
    const clover = sameNameDog(db);
    db._addBoarding({ dog_id: clover.id, external_id: 'OLD00001_p1' });
    db._addSyncAppointment({ external_id: 'OLD00001', client_name: 'Sam Sample', raw_data: {} });
    await save(db);
    expect(clover.external_pet_id).toBe('40002');
  });

  it("this booking's boarding on a different dog is no evidence for this one", async () => {
    const db = createFakeSupabase();
    const clover = sameNameDog(db);
    const other = db._addDog({ name: 'Other Dog', external_pet_id: '49999' });
    db._addBoarding({ dog_id: other.id, external_id: BOOKING });
    await save(db);
    expect(clover.external_pet_id).toBeNull();
  });

  it("a stored booking with no client name and no raw data can't confirm or rule out", async () => {
    const db = createFakeSupabase();
    const clover = sameNameDog(db);
    db._addSyncAppointment({ external_id: 'OLD00001', client_name: null, mapped_dog_id: clover.id, raw_data: null });
    const result = await save(db);
    expect(clover.external_pet_id).toBeNull();
    expect(result.notices[0]).toContain("nothing shows it's this pet");
  });

  it("a page with no client name can't confirm a stored name", async () => {
    const db = createFakeSupabase();
    const clover = sameNameDog(db);
    db._addSyncAppointment({ external_id: 'OLD00001', client_name: 'Sam Sample', mapped_dog_id: clover.id, raw_data: {} });
    const result = await mapAndSaveAppointment({ ...read(twoPetPage()), client_name: null, client_uid: null }, { supabase: db });
    expect(clover.external_pet_id).toBeNull();
    expect(result.notices[0]).toContain("nothing shows it's this pet");
  });
});

describe('REQ-661: database errors fail the save, so the item is retried', () => {
  const failing = (match) => createFakeSupabase({ failOn: (table, op, filters) => (match(table, op, filters) ? { code: 'XX000', message: 'boom' } : null) });
  const has = (filters, field) => filters.some(([, f]) => f === field);

  it("reading the booking's boardings", async () => {
    await expect(save(failing((t, op, f) => t === 'boardings' && op === 'select' && !has(f, 'dog_id')))).rejects.toMatchObject({ message: 'boom' });
  });

  it("reading a candidate dog's boardings for evidence", async () => {
    const db = failing((t, op, f) => t === 'boardings' && op === 'select' && has(f, 'dog_id') && !has(f, 'lte'));
    db._addDog({ name: 'Clover Sample', external_pet_id: null });
    await expect(save(db)).rejects.toMatchObject({ message: 'boom' });
  });

  it("reading a candidate dog's stored bookings for evidence", async () => {
    const db = failing((t, op, f) => t === 'sync_appointments' && op === 'select' && has(f, 'mapped_dog_id'));
    db._addDog({ name: 'Clover Sample', external_pet_id: null });
    await expect(save(db)).rejects.toMatchObject({ message: 'boom' });
  });

  it('refreshing a known dog', async () => {
    const db = failing((t, op) => t === 'dogs' && op === 'update');
    db._addDog({ name: 'Biscuit Sample', external_pet_id: '40001' });
    await expect(save(db)).rejects.toMatchObject({ message: 'boom' });
  });

  it('linking a dog (any error but a duplicate)', async () => {
    const db = failing((t, op) => t === 'dogs' && op === 'update');
    const clover = db._addDog({ name: 'Clover Sample', external_pet_id: null });
    db._addBoarding({ dog_id: clover.id, external_id: `${BOOKING}_p1` });
    await expect(save(db)).rejects.toMatchObject({ message: 'boom' });
  });

  it('creating a dog', async () => {
    await expect(save(failing((t, op) => t === 'dogs' && op === 'insert'))).rejects.toMatchObject({ message: 'boom' });
  });

  it("refreshing a staff member's dog", async () => {
    const db = failing((t, op) => t === 'dogs' && op === 'update');
    db._addDog({ name: 'Dog S', external_pet_id: null });
    await expect(mapAndSaveAppointment({ ...read(noPetPage()), pet_name: 'Dog S' }, { supabase: db })).rejects.toMatchObject({ message: 'boom' });
  });

  it("a failed form check doesn't fail the save: no form job, the booking is still saved", async () => {
    const db = failing((t, op) => t === 'boarding_forms' && op === 'select');
    await save(db);
    expect([db._mockData.sync_queue.length, db._mockData.boardings.length]).toEqual([0, 2]);
  });
});

describe('REQ-661: form jobs', () => {
  it('a boarding whose form is already stored gets no new form job', async () => {
    const db = createFakeSupabase();
    await save(db);
    db._mockData.sync_queue = [];
    db._mockData.boarding_forms.push({ id: 'form-1', boarding_id: boarding(db, BOOKING).id });
    await save(db);
    expect(db._mockData.sync_queue.map((q) => q.source_url)).toEqual(['/pets/40002/forms']);
  });

  it('a form job is a form-type item that re-opens if it ran before without a form', async () => {
    const db = createFakeSupabase();
    db._addQueueItem({ external_id: 'placeholder' });
    await save(db);
    const job = db._mockData.sync_queue.find((q) => q.source_url === '/pets/40001/forms');
    expect(job.type).toBe('form');
    db._mockData.sync_queue.forEach((q) => { q.status = 'done'; });
    await save(db);
    expect(db._mockData.sync_queue.find((q) => q.source_url === '/pets/40001/forms').status).toBe('pending');
  });

  it('a boarding that ended before today gets no form job', async () => {
    vi.setSystemTime(new Date('2026-11-20T12:00:00Z'));
    const db = createFakeSupabase();
    await save(db);
    expect(db._mockData.sync_queue).toHaveLength(0);
  });

  it('a boarding that ends later today still gets its form job', async () => {
    vi.setSystemTime(new Date('2026-11-12T23:30:00'));
    const db = createFakeSupabase();
    await mapAndSaveAppointment({ ...read(twoPetPage()), check_out_datetime: new Date('2026-11-12T00:30:00').toISOString() }, { supabase: db });
    expect(db._mockData.sync_queue).toHaveLength(2);
  });
});

describe("REQ-661: a staff member's dog, rates and notices", () => {
  it("a staff member's dog gets the page's rates when created", async () => {
    const db = createFakeSupabase();
    await mapAndSaveAppointment({ ...read(noPetPage()), pet_name: 'Dog S', pricing: read(onePetPage()).pricing }, { supabase: db });
    expect(db._mockData.dogs[0].night_rate).toBe(60);
  });

  it("a new staff member's dog with no pricing starts at $0, active, from the booking site", async () => {
    const db = createFakeSupabase();
    await mapAndSaveAppointment({ ...read(noPetPage()), pet_name: 'Dog S' }, { supabase: db });
    expect(db._mockData.dogs.map((d) => [d.night_rate, d.day_rate, d.active, d.source])).toEqual([[0, 0, true, 'external']]);
  });

  it("an existing staff member's dog is refreshed and made active, with nothing to report", async () => {
    const db = createFakeSupabase();
    const staffDog = db._addDog({ name: 'Dog S', external_pet_id: null, active: false, night_rate: 30 });
    const result = await mapAndSaveAppointment({ ...read(noPetPage()), pet_name: 'Dog S', pricing: read(onePetPage()).pricing }, { supabase: db });
    expect([staffDog.active, staffDog.night_rate, result.notices, result.stats.dogUpdated, result.stats.dogCreated]).toEqual([true, 60, [], true, false]);
  });
});
