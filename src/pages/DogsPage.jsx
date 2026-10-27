import { useState, Fragment } from 'react';
import { useData } from '../context/DataContext';
import BoardingFormModal from '../components/BoardingFormModal';
import { useBoardingForms } from '../hooks/useBoardingForms';
import { calculateNights, formatName } from '../utils/dateUtils';
import { bookingDateTime, siteNow } from '../utils/siteClock';
import { nightRate } from '../utils/calculations';

export default function DogsPage() {
  // Dogs and boardings come only from the booking site's sync: no add, edit, delete or deactivate here (#351, #342)
  const { dogs, boardings } = useData();
  const { formsByBoardingId } = useBoardingForms();

  const [formModalState, setFormModalState] = useState({ isOpen: false, dogName: '', formData: null, boarding: null });
  const [sortColumn, setSortColumn] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [boardingSortColumn, setBoardingSortColumn] = useState('arrivalDateTime');
  const [boardingSortDirection, setBoardingSortDirection] = useState('desc');
  const [pastBoardingSortColumn, setPastBoardingSortColumn] = useState('departureDateTime');
  const [pastBoardingSortDirection, setPastBoardingSortDirection] = useState('desc');
  const [searchTerm, setSearchTerm] = useState('');

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getDogName = (dogId) => {
    return formatName(dogs.find(d => d.id === dogId)?.name) || 'Unknown';
  };

  // A stay's gross counts its nights at the booking's price, as on Payroll (#342).
  // A cancelled boarding has no nights (REQ-108), so it's $0.
  const getBoardingGross = (boarding) =>
    boarding.cancelledAt ? 0 :
    calculateNights(boarding.arrivalDateTime, boarding.departureDateTime) *
    nightRate(boarding, dogs.find(d => d.id === boarding.dogId));

  // Booking times are San Francisco clock times written as UTC (ADR-009): compare them with
  // San Francisco's now written the same way, as moments (Supabase writes "+00:00", not "Z")
  const siteNowMs = () => Date.parse(siteNow());

  // Past = departed; a cancelled boarding stays in whichever table its dates put it in
  const isPastBoarding = (boarding) => siteNowMs() > Date.parse(boarding.departureDateTime);

  const getInitials = (name) => {
    if (!name) return '?';
    const words = name.trim().split(/\s+/);
    if (words.length === 1) return words[0].charAt(0).toUpperCase();
    return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
  };

  const getBoardingStatus = (boarding) => {
    if (boarding.cancelledAt) return 'cancelled';
    const now = siteNowMs();
    const arrival = Date.parse(boarding.arrivalDateTime);
    const departure = Date.parse(boarding.departureDateTime);

    if (now < arrival) return 'upcoming';
    if (now > departure) return 'past';
    return 'current';
  };

  const statusConfig = {
    current: { label: 'Current', bg: 'bg-emerald-100', text: 'text-emerald-700' },
    upcoming: { label: 'Upcoming', bg: 'bg-sky-100', text: 'text-sky-700' },
    past: { label: 'Past', bg: 'bg-slate-100', text: 'text-slate-500' },
    cancelled: { label: 'Cancelled', bg: 'bg-slate-100', text: 'text-slate-400 line-through' },
  };

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const handleBoardingSort = (column) => {
    if (boardingSortColumn === column) {
      setBoardingSortDirection(boardingSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setBoardingSortColumn(column);
      setBoardingSortDirection('asc');
    }
  };

  const handlePastBoardingSort = (column) => {
    if (pastBoardingSortColumn === column) {
      setPastBoardingSortDirection(pastBoardingSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setPastBoardingSortColumn(column);
      setPastBoardingSortDirection('asc');
    }
  };

  const trimmedSearch = searchTerm.trim().toLowerCase();
  const filteredAndSortedDogs = [...dogs]
    .filter(dog => (dog.name || '').toLowerCase().includes(trimmedSearch))
    .sort((a, b) => {
      let aVal = a[sortColumn];
      let bVal = b[sortColumn];

      if (sortColumn === 'name') {
        aVal = (aVal || '').toLowerCase();
        bVal = (bVal || '').toLowerCase();
        const result = aVal.localeCompare(bVal);
        return sortDirection === 'asc' ? result : -result;
      }

      aVal = aVal || 0;
      bVal = bVal || 0;
      const result = aVal - bVal;
      return sortDirection === 'asc' ? result : -result;
    });

  const renderSortIcon = (column) => {
    if (sortColumn !== column) {
      return <span className="text-slate-300 ml-1">↕</span>;
    }
    return <span className="ml-1 text-indigo-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>;
  };

  const renderBoardingSortIcon = (column) => {
    if (boardingSortColumn !== column) {
      return <span className="text-slate-300 ml-1">↕</span>;
    }
    return <span className="ml-1 text-indigo-600">{boardingSortDirection === 'asc' ? '↑' : '↓'}</span>;
  };

  const renderPastBoardingSortIcon = (column) => {
    if (pastBoardingSortColumn !== column) {
      return <span className="text-slate-300 ml-1">↕</span>;
    }
    return <span className="ml-1 text-indigo-600">{pastBoardingSortDirection === 'asc' ? '↑' : '↓'}</span>;
  };

  // Filter out past boardings from main table - only show current and upcoming
  const sortedBoardings = [...boardings]
    .filter(b => !isPastBoarding(b))
    .sort((a, b) => {
    let aVal, bVal;

    switch (boardingSortColumn) {
      case 'dogName':
        aVal = getDogName(a.dogId).toLowerCase();
        bVal = getDogName(b.dogId).toLowerCase();
        break;
      case 'status': {
        // Sort order: current, upcoming, past
        const statusOrder = { current: 0, upcoming: 1, past: 2, cancelled: 3 };
        aVal = statusOrder[getBoardingStatus(a)];
        bVal = statusOrder[getBoardingStatus(b)];
        break;
      }
      case 'arrivalDateTime':
      case 'departureDateTime':
        aVal = new Date(a[boardingSortColumn]).getTime();
        bVal = new Date(b[boardingSortColumn]).getTime();
        break;
      case 'nights':
        aVal = calculateNights(a.arrivalDateTime, a.departureDateTime);
        bVal = calculateNights(b.arrivalDateTime, b.departureDateTime);
        break;
      case 'gross':
        aVal = getBoardingGross(a);
        bVal = getBoardingGross(b);
        break;
      default:
        return 0;
    }

    if (typeof aVal === 'string') {
      const result = aVal.localeCompare(bVal);
      return boardingSortDirection === 'asc' ? result : -result;
    }

    const result = aVal - bVal;
    return boardingSortDirection === 'asc' ? result : -result;
  });

  return (
    <div className="space-y-8">
      {/* Boardings Section */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Boardings</h1>
            <p className="text-slate-500 mt-1">From the booking site</p>
          </div>
        </div>

        {/* Boarding List */}
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          {boardings.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-slate-900 mb-1">No boardings yet</h3>
              <p className="text-slate-500">Boardings appear here after the booking site syncs</p>
            </div>
          ) : (
            <>
            {/* Mobile Card Layout */}
            <div className="md:hidden divide-y divide-slate-100">
              {sortedBoardings.map((boarding) => {
                const nights = calculateNights(boarding.arrivalDateTime, boarding.departureDateTime);
                const gross = getBoardingGross(boarding);
                const dogName = getDogName(boarding.dogId);
                const status = getBoardingStatus(boarding);
                const statusStyle = statusConfig[status];

                return (
                  <div key={boarding.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-semibold text-indigo-600">{getInitials(dogName)}</span>
                        </div>
                        <div className="min-w-0">
                          {(() => {
                            const formData = formsByBoardingId[boarding.id];
                            return (
                              <button
                                onClick={() => setFormModalState({ isOpen: true, dogName, formData: formData || null, boarding })}
                                className={`font-medium truncate text-left hover:underline ${!formData ? 'text-red-600' : !formData.form_data?.priorityFields?.length ? 'text-amber-600' : 'text-indigo-700'}`}
                                title={!formData ? 'No boarding form found' : !formData.form_data?.priorityFields?.length ? 'Form found — no key fields' : 'View boarding form'}
                              >
                                {dogName}
                              </button>
                            );
                          })()}
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                            {statusStyle.label}
                          </span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-lg font-semibold text-slate-900">{formatCurrency(gross)}</div>
                        <div className="text-xs text-slate-500">{nights} nights</div>
                      </div>
                    </div>
                    <div className="mt-3 text-sm text-slate-600">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Arrival:</span>
                        <span>{bookingDateTime(boarding.arrivalDateTime, boarding.arrivalAmPm)}</span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-slate-500">Departure:</span>
                        <span>{bookingDateTime(boarding.departureDateTime, boarding.departureAmPm)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table Layout */}
            <table className="w-full hidden md:table">
              <thead>
                <tr className="border-b border-slate-200">
                  <th
                    className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => handleBoardingSort('dogName')}
                  >
                    Dog{renderBoardingSortIcon('dogName')}
                  </th>
                  <th
                    className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => handleBoardingSort('status')}
                  >
                    Status{renderBoardingSortIcon('status')}
                  </th>
                  <th
                    className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => handleBoardingSort('arrivalDateTime')}
                  >
                    Arrival{renderBoardingSortIcon('arrivalDateTime')}
                  </th>
                  <th
                    className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => handleBoardingSort('departureDateTime')}
                  >
                    Departure{renderBoardingSortIcon('departureDateTime')}
                  </th>
                  <th
                    className="text-right px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => handleBoardingSort('nights')}
                  >
                    Nights{renderBoardingSortIcon('nights')}
                  </th>
                  <th
                    className="text-right px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => handleBoardingSort('gross')}
                  >
                    Gross{renderBoardingSortIcon('gross')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedBoardings.map((boarding) => {
                  const nights = calculateNights(boarding.arrivalDateTime, boarding.departureDateTime);
                  const gross = getBoardingGross(boarding);
                  const dogName = getDogName(boarding.dogId);
                  const status = getBoardingStatus(boarding);
                  const statusStyle = statusConfig[status];

                  return (
                      <tr key={boarding.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-semibold text-indigo-600">{getInitials(dogName)}</span>
                            </div>
                            {(() => {
                              const formData = formsByBoardingId[boarding.id];
                              return (
                                <button
                                  onClick={() => setFormModalState({ isOpen: true, dogName, formData: formData || null, boarding })}
                                  className={`text-sm font-medium text-left hover:underline ${!formData ? 'text-red-600' : !formData.form_data?.priorityFields?.length ? 'text-amber-600' : 'text-indigo-700 hover:text-indigo-900'}`}
                                  title={!formData ? 'No boarding form found' : !formData.form_data?.priorityFields?.length ? 'Form found — no key fields' : 'View boarding form'}
                                >
                                  {dogName}
                                </button>
                              );
                            })()}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                            {statusStyle.label}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-600">{bookingDateTime(boarding.arrivalDateTime, boarding.arrivalAmPm)}</td>
                        <td className="px-5 py-4 text-sm text-slate-600">{bookingDateTime(boarding.departureDateTime, boarding.departureAmPm)}</td>
                        <td className="px-5 py-4 text-sm text-slate-600 text-right tabular-nums">{nights}</td>
                        <td className="px-5 py-4 text-sm font-medium text-slate-900 text-right tabular-nums">{formatCurrency(gross)}</td>
                      </tr>
                  );
                })}
              </tbody>
            </table>
            </>
          )}
        </div>
      </div>

      {/* Dogs Section */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Dogs</h2>
            <p className="text-slate-500 mt-1">From the booking site</p>
          </div>
        </div>

        {/* Search */}
        {dogs.length > 0 && (
          <div className="mb-4">
            <div className="relative max-w-xs">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search dogs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>
        )}

        {/* Dog List */}
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
          {dogs.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-slate-900 mb-1">No dogs yet</h3>
              <p className="text-slate-500">Dogs appear here after the booking site syncs</p>
            </div>
          ) : (
            <>
            {/* Mobile Card Layout */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredAndSortedDogs.map((dog) => (
                <div key={dog.id} className={`p-4 ${dog.active === false ? 'opacity-50' : ''}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-semibold text-indigo-600">{getInitials(formatName(dog.name))}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {dog.active !== false ? (
                            <span className="font-medium text-slate-900 truncate">
                              {formatName(dog.name)}
                            </span>
                          ) : (
                            <span className="font-medium text-slate-400 truncate">{formatName(dog.name)}</span>
                          )}
                          {dog.source === 'external' && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-cyan-100 text-cyan-700 flex-shrink-0">
                              External
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm text-slate-600">
                        <span className="text-slate-400">Day:</span> {formatCurrency(dog.dayRate)}
                      </div>
                      <div className="text-sm text-slate-600">
                        <span className="text-slate-400">Night:</span> {formatCurrency(dog.nightRate)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table Layout */}
            <table className="w-full hidden md:table">
              <thead>
                <tr className="border-b border-slate-200">
                  <th
                    className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => handleSort('name')}
                  >
                    Name{renderSortIcon('name')}
                  </th>
                  <th
                    className="text-right px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => handleSort('dayRate')}
                  >
                    Day Rate{renderSortIcon('dayRate')}
                  </th>
                  <th
                    className="text-right px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => handleSort('nightRate')}
                  >
                    Night Rate{renderSortIcon('nightRate')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAndSortedDogs.map((dog) => (
                  <Fragment key={dog.id}>
                    <tr className={`hover:bg-slate-50/50 transition-colors ${dog.active === false ? 'opacity-50' : ''}`}>
                      <td className={`px-5 py-4 ${dog.active === false ? 'text-slate-400' : 'text-slate-900'}`}>
                        <div className="flex items-center gap-2">
                          {dog.active !== false ? (
                            <span className="text-sm font-medium text-slate-900">
                              {formatName(dog.name)}
                            </span>
                          ) : (
                            <span className="text-sm font-medium">{formatName(dog.name)}</span>
                          )}
                          {dog.source === 'external' && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-cyan-100 text-cyan-700">
                              External
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={`px-5 py-4 text-sm text-right tabular-nums ${dog.active === false ? 'text-slate-400' : 'text-slate-600'}`}>{formatCurrency(dog.dayRate)}</td>
                      <td className={`px-5 py-4 text-sm text-right tabular-nums ${dog.active === false ? 'text-slate-400' : 'text-slate-600'}`}>{formatCurrency(dog.nightRate)}</td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
            </>
          )}
        </div>
      </div>

      {/* Past Boardings Section */}
      {(() => {
        const pastBoardings = boardings
          .filter(b => isPastBoarding(b))
          .sort((a, b) => {
            let aVal, bVal;

            switch (pastBoardingSortColumn) {
              case 'dogName':
                aVal = getDogName(a.dogId).toLowerCase();
                bVal = getDogName(b.dogId).toLowerCase();
                break;
              case 'arrivalDateTime':
              case 'departureDateTime':
                aVal = new Date(a[pastBoardingSortColumn]).getTime();
                bVal = new Date(b[pastBoardingSortColumn]).getTime();
                break;
              case 'nights':
                aVal = calculateNights(a.arrivalDateTime, a.departureDateTime);
                bVal = calculateNights(b.arrivalDateTime, b.departureDateTime);
                break;
              case 'gross':
                aVal = getBoardingGross(a);
                bVal = getBoardingGross(b);
                break;
              default:
                return 0;
            }

            if (typeof aVal === 'string') {
              const result = aVal.localeCompare(bVal);
              return pastBoardingSortDirection === 'asc' ? result : -result;
            }

            const result = aVal - bVal;
            return pastBoardingSortDirection === 'asc' ? result : -result;
          });

        if (pastBoardings.length === 0) return null;

        return (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">Past Boardings</h2>
                <p className="text-slate-500 mt-1">Historical boarding records ({pastBoardings.length} total)</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
              {/* Mobile Card Layout */}
              <div className="md:hidden max-h-[600px] overflow-y-auto divide-y divide-slate-100">
                {pastBoardings.map((boarding) => {
                  const nights = calculateNights(boarding.arrivalDateTime, boarding.departureDateTime);
                  const gross = getBoardingGross(boarding);
                  const dogName = getDogName(boarding.dogId);

                  return (
                    <div key={boarding.id} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-semibold text-slate-500">{getInitials(dogName)}</span>
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900 truncate">{dogName}</div>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                              Past
                            </span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-lg font-semibold text-slate-900">{formatCurrency(gross)}</div>
                          <div className="text-xs text-slate-500">{nights} nights</div>
                        </div>
                      </div>
                      <div className="mt-3 text-sm text-slate-600">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Arrival:</span>
                          <span>{bookingDateTime(boarding.arrivalDateTime, boarding.arrivalAmPm)}</span>
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-slate-500">Departure:</span>
                          <span>{bookingDateTime(boarding.departureDateTime, boarding.departureAmPm)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table Layout - 12 rows visible with scroll */}
              <div className="hidden md:block max-h-[528px] overflow-y-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-white border-b border-slate-200 z-10">
                    <tr>
                      <th
                        className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => handlePastBoardingSort('dogName')}
                      >
                        Dog{renderPastBoardingSortIcon('dogName')}
                      </th>
                      <th
                        className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => handlePastBoardingSort('arrivalDateTime')}
                      >
                        Arrival{renderPastBoardingSortIcon('arrivalDateTime')}
                      </th>
                      <th
                        className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => handlePastBoardingSort('departureDateTime')}
                      >
                        Departure{renderPastBoardingSortIcon('departureDateTime')}
                      </th>
                      <th
                        className="text-right px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => handlePastBoardingSort('nights')}
                      >
                        Nights{renderPastBoardingSortIcon('nights')}
                      </th>
                      <th
                        className="text-right px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => handlePastBoardingSort('gross')}
                      >
                        Gross{renderPastBoardingSortIcon('gross')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pastBoardings.map((boarding) => {
                      const nights = calculateNights(boarding.arrivalDateTime, boarding.departureDateTime);
                      const gross = getBoardingGross(boarding);
                      const dogName = getDogName(boarding.dogId);

                      return (
                        <tr key={boarding.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                                <span className="text-xs font-semibold text-slate-500">{getInitials(dogName)}</span>
                              </div>
                              <span className="text-sm font-medium text-slate-900">{dogName}</span>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-600">{bookingDateTime(boarding.arrivalDateTime, boarding.arrivalAmPm)}</td>
                          <td className="px-5 py-4 text-sm text-slate-600">{bookingDateTime(boarding.departureDateTime, boarding.departureAmPm)}</td>
                          <td className="px-5 py-4 text-sm text-slate-600 text-right tabular-nums">{nights}</td>
                          <td className="px-5 py-4 text-sm font-medium text-slate-900 text-right tabular-nums">{formatCurrency(gross)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Boarding form modal */}
      <BoardingFormModal
        isOpen={formModalState.isOpen}
        onClose={() => setFormModalState(s => ({ ...s, isOpen: false }))}
        dogName={formModalState.dogName}
        formData={formModalState.formData}
        boarding={formModalState.boarding}
      />
    </div>
  );
}
