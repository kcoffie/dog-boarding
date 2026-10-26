// One real-shaped night, worked out by hand from REQ-036 (#342). Synthetic names only.
// Night of Fri 2026-10-23:
//   Alder: on its own, booked at $60                     → counts, $60
//   Birch + Cedar: one two-dog booking priced $40 each,  → count, $40 + $40
//     though their own rates are $60 and $55
//   Dogwood: cancelled on the booking site ($60)         → no night
//   Elm: a day visit, gone by 5pm                         → no night
// So: 3 dogs, gross $140, net at 65% = $91.00. Day rates of the 3 = 30 + 30 + 25 = $85.
export const NIGHT = '2026-10-23';

export const dogs = [
  { id: 'a', name: 'Alder Test', dayRate: 30, nightRate: 60, active: true },
  { id: 'b', name: 'Birch Test', dayRate: 30, nightRate: 60, active: true },
  { id: 'c', name: 'Cedar Test', dayRate: 25, nightRate: 55, active: true },
  { id: 'd', name: 'Dogwood Test', dayRate: 30, nightRate: 60, active: true },
  { id: 'e', name: 'Elm Test', dayRate: 35, nightRate: 60, active: true },
];

export const boardings = [
  { id: 'a1', dogId: 'a', arrivalDateTime: '2026-10-22T16:00:00', departureDateTime: '2026-10-25T10:00:00', nightRate: 60 },
  { id: 'b1', dogId: 'b', arrivalDateTime: '2026-10-23T16:00:00', departureDateTime: '2026-10-24T10:00:00', nightRate: 40 },
  { id: 'c1', dogId: 'c', arrivalDateTime: '2026-10-23T16:00:00', departureDateTime: '2026-10-24T10:00:00', nightRate: 40 },
  { id: 'd1', dogId: 'd', arrivalDateTime: '2026-10-21T16:00:00', departureDateTime: '2026-10-26T10:00:00', nightRate: 60, cancelledAt: '2026-10-20T12:00:00Z' },
  { id: 'e1', dogId: 'e', arrivalDateTime: '2026-10-23T09:00:00', departureDateTime: '2026-10-23T17:00:00', nightRate: 60 },
];
