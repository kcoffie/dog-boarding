import { useData } from '../context/DataContext';
import { getDateRange, isOvernight } from '../utils/dateUtils';

export default function SummaryCards({ startDate, days }) {
  const { dogs, boardings, getNightAssignment } = useData();

  const dates = getDateRange(startDate, days);
  const todayStr = new Date().toISOString().split('T')[0];

  // Dogs boarding today (overnight)
  const dogsToday = dogs.filter(dog => {
    const dogBoardings = boardings.filter(b => b.dogId === dog.id);
    return dogBoardings.some(b => isOvernight(b, todayStr));
  }).length;

  // Revenue this period (gross)
  const periodRevenue = dates.reduce((total, dateStr) => {
    let dayGross = 0;
    for (const dog of dogs) {
      const dogBoardings = boardings.filter(b => b.dogId === dog.id);
      for (const boarding of dogBoardings) {
        if (isOvernight(boarding, dateStr)) {
          dayGross += dog.nightRate;
          break;
        }
      }
    }
    return total + dayGross;
  }, 0);

  // Helper to check if date has any dogs boarding
  const hasDogsBoarding = (dateStr) => {
    for (const dog of dogs) {
      const dogBoardings = boardings.filter(b => b.dogId === dog.id);
      if (dogBoardings.some(b => isOvernight(b, dateStr))) {
        return true;
      }
    }
    return false;
  };

  // Nights assigned in range (only count nights with dogs that have employee assigned)
  const assignedNights = dates.filter(dateStr => {
    const employeeName = getNightAssignment(dateStr);
    return employeeName && employeeName !== 'N/A' && hasDogsBoarding(dateStr);
  }).length;

  // Nights with boardings that need employee coverage (exclude N/A nights)
  const nightsWithBoardings = dates.filter(dateStr => {
    // Check if N/A is assigned - if so, no employee needed
    const employeeName = getNightAssignment(dateStr);
    if (employeeName === 'N/A') return false;

    return hasDogsBoarding(dateStr);
  }).length;

  // Active dogs count
  const activeDogs = dogs.filter(d => d.active !== false).length;

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const cards = [
    {
      label: 'Dogs Tonight',
      value: dogsToday,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      ),
      color: 'indigo',
      subtext: 'staying overnight',
    },
    {
      label: 'Period Revenue',
      value: formatCurrency(periodRevenue),
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'emerald',
      subtext: 'gross income',
    },
    {
      label: 'Nights Assigned',
      value: `${assignedNights}/${nightsWithBoardings}`,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      color: nightsWithBoardings > 0 && assignedNights < nightsWithBoardings ? 'amber' : 'sky',
      subtext: nightsWithBoardings > 0 && assignedNights < nightsWithBoardings
        ? `${nightsWithBoardings - assignedNights} unassigned`
        : 'in date range',
    },
    {
      label: 'Active Dogs',
      value: activeDogs,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
      color: 'violet',
      subtext: `${dogs.length} total`,
    },
  ];

  const colorClasses = {
    indigo: {
      bg: 'bg-indigo-50',
      icon: 'bg-indigo-100 text-indigo-600',
      value: 'text-indigo-600',
    },
    emerald: {
      bg: 'bg-emerald-50',
      icon: 'bg-emerald-100 text-emerald-600',
      value: 'text-emerald-600',
    },
    amber: {
      bg: 'bg-amber-50',
      icon: 'bg-amber-100 text-amber-600',
      value: 'text-amber-600',
    },
    sky: {
      bg: 'bg-sky-50',
      icon: 'bg-sky-100 text-sky-600',
      value: 'text-sky-600',
    },
    violet: {
      bg: 'bg-violet-50',
      icon: 'bg-violet-100 text-violet-600',
      value: 'text-violet-600',
    },
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const colors = colorClasses[card.color];
        return (
          <div
            key={card.label}
            className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">{card.label}</p>
                <p className={`text-2xl font-bold mt-1 ${colors.value}`}>
                  {card.value}
                </p>
                <p className="text-xs text-slate-400 mt-1">{card.subtext}</p>
              </div>
              <div className={`w-10 h-10 rounded-lg ${colors.icon} flex items-center justify-center`}>
                {card.icon}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
