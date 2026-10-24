/**
 * Each pet's ID from its own element on the booking page, the client's ID, and rates by pet ID (#344, ADR-008).
 * Page shapes: twoPetPages.js (from two real two-pet bookings) and the recorded single-pet pages in fixtures.js.
 * @requirements REQ-661
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseAppointmentPage, extractPets, extractClient, extractPricing, nameFromTitle } from '../../lib/scraper/extraction.js';
import { twoPetPage, onePetPage, noPetPage, BISCUIT, CLOVER, CLIENT } from './twoPetPages.js';
import { mockRequestCanceledPage } from './fixtures.js';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('REQ-661: each pet and its ID come from the same element', () => {
  it("each pet's ID is the one on its own link, though data-pets lists them the other way round", () => {
    expect(extractPets(twoPetPage())).toEqual([
      { id: '40001', name: 'Biscuit Sample' },
      { id: '40002', name: 'Clover Sample' },
    ]);
  });

  it('the pet list keeps the page order of the links', () => {
    const pets = extractPets(twoPetPage({ links: [CLOVER, BISCUIT] }));
    expect(pets.map((p) => p.id)).toEqual(['40002', '40001']);
  });

  it('the event-pets container and event-pet-wrapper divs are never read as pets', () => {
    expect(extractPets(twoPetPage())).toHaveLength(2);
  });

  it('a class that only starts with event-pet (event-pet-wrapper) is never a pet, even holding text', () => {
    const html = '<div class="event-pet-wrapper" data-pet="40001">Wrapper text<a href="/pets/40001" class="event-pet" data-pet="40001">Biscuit Sample</a></div>';
    expect(extractPets(html)).toEqual([{ id: '40001', name: 'Biscuit Sample' }]);
  });

  it("a link whose href doesn't match its data-pet keeps its name but gets no ID", () => {
    const pets = extractPets(twoPetPage({ linkOverrides: { 40001: { href: '/pets/40009', dataPet: '40001' } } }));
    expect(pets[0]).toEqual({ id: null, name: 'Biscuit Sample' });
  });

  it('a data-pet that is not all digits gives no ID', () => {
    const pets = extractPets(twoPetPage({ linkOverrides: { 40001: { href: '/pets/40001a', dataPet: '40001a' } } }));
    expect(pets[0].id).toBeNull();
  });

  it('spaces around data-pet are trimmed before the check', () => {
    const pets = extractPets(twoPetPage({ linkOverrides: { 40001: { href: '/pets/40001', dataPet: ' 40001 ' } } }));
    expect(pets[0].id).toBe('40001');
  });

  it("the link's attributes are read in any order", () => {
    const html = '<a data-pet="40001" class="event-pet pet-40001" href="/pets/40001">Biscuit Sample</a>';
    expect(extractPets(html)).toEqual([{ id: '40001', name: 'Biscuit Sample' }]);
  });

  it('the recorded single-pet page gives its one pet with its ID', () => {
    expect(extractPets(mockRequestCanceledPage)).toEqual([{ id: '10004', name: 'Juniper Placeholder' }]);
  });

  it('a page with no pet element gives no pets', () => {
    expect(extractPets(noPetPage())).toEqual([]);
  });
});

describe("REQ-661: the booking's client", () => {
  it('the client ID is data-uid on the client block, and the name is the event-client link', () => {
    expect(extractClient(twoPetPage())).toEqual({ uid: '30001', name: 'Sam Sample' });
  });

  it('event-clients-pets is not read as the client name (it made the stored name blank)', () => {
    expect(parseAppointmentPage(twoPetPage()).client_name).toBe(CLIENT.name);
  });

  it('two client blocks give no client ID', () => {
    const block = `<div class="event-clients-pets" data-uid="30001"></div><div class="event-clients-pets" data-uid="30002"></div>`;
    expect(extractClient(block).uid).toBeNull();
  });

  it('the recorded single-pet page gives its client ID', () => {
    expect(extractClient(mockRequestCanceledPage)).toEqual({ uid: '10003', name: 'Lee Placeholder' });
  });
});

describe('REQ-661: rates belong to a pet by the data-pet on its price div', () => {
  it('each pet gets its own night and day rate', () => {
    expect(extractPricing(twoPetPage()).ratesByPet).toEqual({
      40001: { nightRate: 55, dayRate: 50 },
      40002: { nightRate: 45, dayRate: 35 },
    });
  });

  it('price divs listed in the other order still give each pet its own rates', () => {
    expect(extractPricing(twoPetPage({ pricesReversed: true })).ratesByPet).toEqual({
      40001: { nightRate: 55, dayRate: 50 },
      40002: { nightRate: 45, dayRate: 35 },
    });
  });

  it('a price div without data-pet gives no rate to anyone', () => {
    expect(Object.keys(extractPricing(twoPetPage({ unpricedPet: CLOVER.id })).ratesByPet)).toEqual(['40001']);
  });

  it("the booking's total is unchanged: 495 + 405 + 200 + 70", () => {
    expect(extractPricing(twoPetPage()).total).toBe(1170);
  });

  it('a one-pet page whose price divs carry no data-pet has no rates by ID (the mapper uses all of them)', () => {
    expect(extractPricing(onePetPage()).ratesByPet).toEqual({});
  });
});

describe('REQ-661: the parsed booking', () => {
  it('carries the pets, the client ID, and the first pet as pet_name', () => {
    const page = parseAppointmentPage(twoPetPage());
    expect(page.pets).toEqual([BISCUIT, CLOVER]);
    expect(page.client_uid).toBe('30001');
    expect(page.pet_name).toBe('Biscuit Sample');
  });

  it('a page with no pet element has no pet_name of its own', () => {
    expect(parseAppointmentPage(noPetPage()).pet_name).toBeNull();
  });

  it("a multi-pet page logs its raw shape: IDs only, never names", () => {
    parseAppointmentPage(twoPetPage());
    const line = console.log.mock.calls.map((c) => c.join(' ')).find((l) => l.includes('2-pet page'));
    expect(line).toBe('[Extraction] 🐾 2-pet page: pet IDs 40001,40002; data-pets="40002,40001"; priced pet IDs 40001,40002');
  });
});

describe("REQ-661: a staff member's dog is named from the title (#49)", () => {
  it('the name is everything before the first date', () => {
    expect(nameFromTitle('Dog S 3/7-8(Sun)')).toBe('Dog S');
  });

  it('a title that starts with its dates names no dog', () => {
    expect(nameFromTitle('10/24-27')).toBeNull();
  });

  it('no title, no name', () => {
    expect(nameFromTitle(null)).toBeNull();
  });
});
