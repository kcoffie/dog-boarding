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

describe('REQ-661: IDs are digits only, start to end', () => {
  it('a data-pet with letters before its digits gives no ID, even when href agrees', () => {
    expect(extractPets('<a href="/pets/x40001" class="event-pet" data-pet="x40001">Biscuit Sample</a>')[0].id).toBeNull();
  });

  it('a client ID with letters before or after its digits gives no client ID', () => {
    expect(extractClient('<div class="event-clients-pets" data-uid="x30001"></div>').uid).toBeNull();
    expect(extractClient('<div class="event-clients-pets" data-uid="30001x"></div>').uid).toBeNull();
  });

  it('a price div whose data-pet has letters before or after its digits gives no rate', () => {
    const html = twoPetPage().replace(/data-pet="40002" data-client/g, 'data-pet="x40002" data-client');
    expect(Object.keys(extractPricing(html).ratesByPet)).toEqual(['40001']);
    const after = twoPetPage().replace(/data-pet="40002" data-client/g, 'data-pet="40002x" data-client');
    expect(Object.keys(extractPricing(after).ratesByPet)).toEqual(['40001']);
  });

  it('a pet link with no name is not a pet', () => {
    expect(extractPets('<a href="/pets/40001" class="event-pet" data-pet="40001"></a>')).toEqual([]);
  });
});

describe('REQ-661: rates by pet, uneven pages', () => {
  const pricing = (services) => `<fieldset id="confirm-price" class="no-legend">
  <a class="btn toggle-field text quote">Total $100 <i class="fa fa-fw"></i></a>
  <div class="pricing-appt-wrapper services-${services.length} pets-2">
    ${services.map(([name, divs]) => `<div class="service-wrapper"><span class="service-name">${name}</span>
      ${divs.map(([pet, rate]) => `<div class="price p-7" data-pet="${pet}" data-rate="${rate}" data-qty="100" data-amount="1.00"></div>`).join('')}</div>`).join('\n    ')}
  </div>
</fieldset>`;

  it("a pet's night rate is its first night service's, not a later one's", () => {
    const html = pricing([['Boarding (Nights)', [['40001', '5500'], ['40002', '4500']]], ['Extended Stay Nights', [['40001', '9900'], ['40002', '8800']]]]);
    expect(extractPricing(html).ratesByPet['40001'].nightRate).toBe(55);
  });

  it('a page with fewer price divs than services × pets still gives the rates it has', () => {
    const html = pricing([['Boarding (Nights)', [['40001', '5500'], ['40002', '4500']]], ['Boarding (Days)', [['40001', '5000']]]]);
    expect(extractPricing(html).ratesByPet).toEqual({ 40001: { nightRate: 55, dayRate: 50 }, 40002: { nightRate: 45, dayRate: null } });
  });
});

describe('REQ-661: review findings (2026-10-24)', () => {
  const pricing = (services) => `<fieldset id="confirm-price" class="no-legend">
  <a class="btn toggle-field text quote">Total $100 <i class="fa fa-fw"></i></a>
  <div class="pricing-appt-wrapper services-${services.length} pets-2">
    ${services.map(([name, divs]) => `<div class="service-wrapper"><span class="service-name">${name}</span>
      ${divs.map(([pet, rate]) => `<div class="price p-7" data-pet="${pet}" data-rate="${rate}" data-qty="100" data-amount="1.00"></div>`).join('')}</div>`).join('\n    ')}
  </div>
</fieldset>`;

  it("each price is classed by its own service, even when an earlier service has fewer price divs than pets", () => {
    const html = pricing([['Boarding (Nights)', [['40002', '4500']]], ['Boarding (Days)', [['40001', '5000'], ['40002', '3500']]]]);
    expect(extractPricing(html).ratesByPet).toEqual({ 40001: { nightRate: null, dayRate: 50 }, 40002: { nightRate: 45, dayRate: 35 } });
  });

  it('an apostrophe written as &#039; is read as an apostrophe', () => {
    const html = '<a href="/pets/40001" class="event-pet" data-pet="40001">D&#039;Arcy Sample</a>';
    expect(extractPets(html)[0].name).toBe("D'Arcy Sample");
  });

  it('a hex entity is decoded too', () => {
    expect(extractPets('<a href="/pets/40001" class="event-pet" data-pet="40001">D&#x27;Arcy Sample</a>')[0].name).toBe("D'Arcy Sample");
  });

  it("a client's booking page says it has a client block; a staff member's page doesn't", () => {
    expect([parseAppointmentPage(twoPetPage()).has_client_block, parseAppointmentPage(noPetPage()).has_client_block]).toEqual([true, false]);
  });
});
