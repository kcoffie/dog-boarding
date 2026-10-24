/**
 * Booking pages for #344's pet-identity tests, built on the structure read from two real two-pet bookings
 * (2026-10-23, Kate's Chrome, read-only): one `.event-clients-pets[data-uid]` block →
 * `.event-pets.pets-count-2[data-pets]` → one `.event-pet-wrapper[data-pet]` per pet →
 * `a.event-pet[data-pet][href="/pets/N"]`; every price div carries `data-pet` and `data-client`; both pets'
 * night prices are `p-7`, day prices `p-3`. On one of them `data-pets` lists the pets in the opposite order
 * to the links, as `twoPetPage()` does by default. Names, IDs, client and money are synthetic; the rates,
 * quantities and amounts keep the real page's relationships (rate × qty = amount, in cents ÷ 100).
 *
 * Expected values, worked out by hand:
 *   Biscuit (40001): nights $55 (5500) × 9 = $495, days $50 (5000.00) × 4 = $200
 *   Clover  (40002): nights $45 (4500) × 9 = $405, days $35 (3500.00) × 2 = $70
 *   Total $495 + $405 + $200 + $70 = $1170
 *   Check-in 1793721600 = 2026-11-03T16:00:00Z, check-out 1794502800 = 2026-11-12T17:00:00Z
 */

export const BISCUIT = { id: '40001', name: 'Biscuit Sample' };
export const CLOVER = { id: '40002', name: 'Clover Sample' };
export const CLIENT = { uid: '30001', name: 'Sam Sample' };
export const CHECK_IN = '2026-11-03T16:00:00.000Z';
export const CHECK_OUT = '2026-11-12T17:00:00.000Z';

const petLink = (pet, { href = `/pets/${pet.id}`, dataPet = pet.id } = {}) =>
  `<div class="event-pet-wrapper" data-pet="${pet.id}">
              <a href="${href}" class="event-pet pet-${pet.id}" data-pet="${dataPet}">${pet.name}</a>
            </div>`;

const priceDiv = ({ pet, cls, rate, qty, amount, withPet = true }) =>
  `<div class="${cls}" id="price-x"${withPet ? ` data-pet="${pet.id}"` : ''} data-client="${CLIENT.uid}" data-rate="${rate}" data-qty="${qty}" data-amount="${amount}" data-invoiced="0.00"></div>`;

/**
 * A two-pet booking page.
 * @param {Object} [options]
 * @param {Array} [options.links] - the pets in link order (default Biscuit, Clover)
 * @param {string} [options.dataPets] - the container's data-pets (default "40002,40001", the real reversed case)
 * @param {boolean} [options.pricesReversed] - list each service's price divs Clover first
 * @param {string|null} [options.unpricedPet] - a pet ID whose price divs carry no data-pet
 * @param {Object} [options.linkOverrides] - { [petId]: { href, dataPet } } for a link that doesn't check out
 */
export function twoPetPage({
  links = [BISCUIT, CLOVER],
  dataPets = `${CLOVER.id},${BISCUIT.id}`,
  pricesReversed = false,
  unpricedPet = null,
  linkOverrides = {},
} = {}) {
  const nights = [
    { pet: BISCUIT, cls: 'price p-7 has-outstanding editable', rate: '5500', qty: '900', amount: '495.00' },
    { pet: CLOVER, cls: 'price p-7 has-outstanding editable', rate: '4500', qty: '900', amount: '405.00' },
  ];
  const days = [
    { pet: BISCUIT, cls: 'price p-3 has-outstanding editable reset', rate: '5000.00', qty: '400.00', amount: '200.00' },
    { pet: CLOVER, cls: 'price p-3 has-outstanding editable reset', rate: '3500.00', qty: '200.00', amount: '70.00' },
  ];
  const order = (list) => (pricesReversed ? [...list].reverse() : list)
    .map((p) => priceDiv({ ...p, withPet: p.pet.id !== unpricedPet })).join('\n        ');

  return `<!DOCTYPE html>
<html>
<head><title>11/3pm-12 (Thu) | A Girl and Your Dog</title></head>
<body>
  <div class="events-view es-1 et-1">
    <h1>11/3pm-12 (Thu)</h1>
    <div class="appt-info">
      <div class="dt-row" id="when-wrapper"
           data-start_scheduled="1793721600" data-end_scheduled="1794502800"
           data-start_actual="1793721600" data-end_actual="1794502800">
        <div class="field-value">
          <span class="time the start"><span class="time-label" title="">PM</span>, </span>
          <span class="time the"><span class="time-label" title="">AM</span>, </span>
        </div>
      </div>
    </div>
    <div class="appt-clients-pets">
      <div class="field-value">
        <div class="event-clients-pets" id="events-clients-pets-${CLIENT.uid}" data-uid="${CLIENT.uid}">
          <a href="/clients/${CLIENT.uid}" class="event-client">${CLIENT.name}</a>
          <div class="event-pets pets-count-2" data-pets="${dataPets}" data-pet_count="2">
            ${links.map((pet) => petLink(pet, linkOverrides[pet.id])).join('\n            ')}
          </div>
        </div>
      </div>
    </div>
    <fieldset id="confirm-price" class="no-legend">
      <a class="btn toggle-field text quote">Total $1170 <i class="fa fa-fw"></i></a>
      <div class="pricing-client-wrapper pricing-appt-wrapper services-2 pets-2 has-outstanding">
        <div class="pricing-ts-wrapper">
          <div class="service-wrapper" data-service="22215-0" data-srv_order="0">
            <span class="service-name">Boarding discounted nights for DC full-time</span>
            ${order(nights)}
          </div>
          <div class="service-wrapper" data-service="11778-0" data-srv_order="1">
            <span class="service-name">Boarding (Days)</span>
            ${order(days)}
          </div>
        </div>
      </div>
    </fieldset>
  </div>
</body>
</html>
`;
}

/**
 * A one-pet booking page in the same structure, with price divs that carry no data-pet (the recorded
 * single-pet fixtures have none; whether real single-pet price divs do isn't recorded).
 * Expected: nights $60 (6000) × 3 = $180, total $180.
 */
export function onePetPage(pet = BISCUIT) {
  return `<!DOCTYPE html>
<html>
<head><title>11/3-6 | A Girl and Your Dog</title></head>
<body>
  <div class="events-view es-1 et-1">
    <h1>11/3-6</h1>
    <div class="dt-row" id="when-wrapper" data-start_scheduled="1793721600" data-end_scheduled="1794502800"></div>
    <div class="appt-clients-pets">
      <div class="event-clients-pets" id="events-clients-pets-${CLIENT.uid}" data-uid="${CLIENT.uid}">
        <a href="/clients/${CLIENT.uid}" class="event-client">${CLIENT.name}</a>
        <div class="event-pets pets-count-1" data-pets="${pet.id}">
          <div class="event-pet-wrapper" data-pet="${pet.id}">
            <a href="/pets/${pet.id}" class="event-pet pet-${pet.id}" data-pet="${pet.id}">${pet.name}</a>
          </div>
        </div>
      </div>
    </div>
    <fieldset id="confirm-price" class="no-legend">
      <a class="btn toggle-field text quote">Total $180 <i class="fa fa-fw"></i></a>
      <div class="pricing-appt-wrapper services-1 pets-1">
        <div class="service-wrapper">
          <span class="service-name">Boarding (Nights)</span>
          <div class="price p-7 has-outstanding" data-rate="6000" data-qty="300" data-amount="180.00"></div>
        </div>
      </div>
    </fieldset>
  </div>
</body>
</html>
`;
}

/** A staff member's own dog: a booking page with no pet element at all (#49). */
export function noPetPage() {
  return `<!DOCTYPE html>
<html>
<head><title>Dog S 11/3-12 | A Girl and Your Dog</title></head>
<body>
  <h1>Dog S 11/3-12</h1>
  <div class="dt-row" id="when-wrapper" data-start_scheduled="1793721600" data-end_scheduled="1794502800"></div>
</body>
</html>
`;
}
