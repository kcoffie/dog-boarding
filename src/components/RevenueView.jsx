import { useData } from '../context/DataContext';
import { getDateRange, calculateNights } from '../utils/dateUtils';

export default function RevenueView({ startDate, days }) {
  const { dogs, boardings } = useData();

  const dates = getDateRange(startDate, days);
  const startStr = dates[0];
  const endStr = dates[dates.length - 1];

  // Show boardings whose check-in falls within the selected period
  const inRange = boardings
    .filter(b => {
      const arrivalDate = b.arrivalDateTime.split('T')[0];
      return arrivalDate >= startStr && arrivalDate <= endStr;
    })
    .sort((a, b) => a.arrivalDateTime.localeCompare(b.arrivalDateTime));

  const getDog = (dogId) => dogs.find(d => d.id === dogId);

  const getBoardingRevenue = (boarding) => {
    if (boarding.billedAmount != null) {
      return { amount: boarding.billedAmount, estimated: false };
    }
    const dog = getDog(boarding.dogId);
    const rate = boarding.nightRate ?? (dog?.nightRate ?? 0);
    const nights = calculateNights(boarding.arrivalDateTime, boarding.departureDateTime);
    return { amount: rate * nights, estimated: true };
  };

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);

  const formatDateShort = (isoStr) => {
    const dateStr = isoStr.split('T')[0];
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const rows = inRange.map(boarding => {
    const dog = getDog(boarding.dogId);
    const { amount, estimated } = getBoardingRevenue(boarding);
    return { boarding, dog, amount, estimated };
  });

  const periodTotal = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
          <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-slate-900">Revenue</h2>
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-slate-500 text-sm">No boardings starting in this date range.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Dog</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Check-in</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Check-out</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ boarding, dog, amount, estimated }) => (
                <tr key={boarding.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">
                    {dog?.name ?? 'Unknown'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {formatDateShort(boarding.arrivalDateTime)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {formatDateShort(boarding.departureDateTime)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right tabular-nums">
                    <span className="font-medium text-slate-900">{formatCurrency(amount)}</span>
                    {estimated && (
                      <span className="ml-1 text-xs text-slate-400 font-normal">est.</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200">
                <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-slate-900">
                  Period Total
                </td>
                <td className="px-4 py-3 text-sm font-bold text-emerald-600 text-right tabular-nums">
                  {formatCurrency(periodTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
