import { useData } from '../context/DataContext';
import { getDateRange, formatDateShort, getDayOfWeek, isOvernight, isDayPresent } from '../utils/dateUtils';

export default function BoardingMatrix({ startDate }) {
  const { dogs, boardings, settings } = useData();

  const dates = getDateRange(startDate.toISOString().split('T')[0], 14);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getPresenceIndicator = (dog, dateStr) => {
    const dogBoardings = boardings.filter(b => b.dogId === dog.id);

    let isDay = false;
    let isNight = false;

    for (const boarding of dogBoardings) {
      if (isDayPresent(boarding, dateStr)) {
        isDay = true;
      }
      if (isOvernight(boarding, dateStr)) {
        isNight = true;
      }
    }

    if (isNight) {
      return (
        <div className="w-6 h-6 mx-auto rounded-full bg-blue-600" title="Overnight" />
      );
    } else if (isDay) {
      return (
        <div className="w-6 h-6 mx-auto rounded-full bg-yellow-400" title="Day only" />
      );
    }
    return <span className="text-gray-300">-</span>;
  };

  const calculateDayGross = (dateStr) => {
    let total = 0;
    for (const dog of dogs) {
      const dogBoardings = boardings.filter(b => b.dogId === dog.id);
      for (const boarding of dogBoardings) {
        if (isOvernight(boarding, dateStr)) {
          total += dog.nightRate;
          break; // Only count once per dog per night
        }
      }
    }
    return total;
  };

  const calculateDayNet = (dateStr) => {
    const gross = calculateDayGross(dateStr);
    return gross * (settings.netPercentage / 100);
  };

  if (dogs.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
        No dogs added yet. Go to the Dogs page to add some dogs first.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-x-auto">
      <table className="w-full min-w-max">
        <thead>
          <tr className="bg-gray-50 border-b">
            <th className="text-left px-4 py-3 text-sm font-semibold text-gray-900 sticky left-0 bg-gray-50 min-w-[120px]">
              Dog
            </th>
            <th className="text-right px-3 py-3 text-sm font-semibold text-gray-900 min-w-[70px]">
              Day
            </th>
            <th className="text-right px-3 py-3 text-sm font-semibold text-gray-900 min-w-[70px]">
              Night
            </th>
            {dates.map((dateStr) => (
              <th key={dateStr} className="text-center px-2 py-3 text-xs font-semibold text-gray-900 min-w-[50px]">
                <div>{getDayOfWeek(dateStr)}</div>
                <div className="font-normal text-gray-600">{formatDateShort(dateStr)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dogs.map((dog) => (
            <tr key={dog.id} className="border-b hover:bg-gray-50">
              <td className="px-4 py-3 text-sm text-gray-900 sticky left-0 bg-white font-medium">
                {dog.name}
              </td>
              <td className="px-3 py-3 text-sm text-gray-600 text-right">
                ${dog.dayRate}
              </td>
              <td className="px-3 py-3 text-sm text-gray-600 text-right">
                ${dog.nightRate}
              </td>
              {dates.map((dateStr) => (
                <td key={dateStr} className="px-2 py-3 text-center">
                  {getPresenceIndicator(dog, dateStr)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          {/* Gross Row */}
          <tr className="bg-gray-50 border-t-2">
            <td className="px-4 py-3 text-sm font-semibold text-gray-900 sticky left-0 bg-gray-50">
              Gross
            </td>
            <td colSpan={2}></td>
            {dates.map((dateStr) => {
              const gross = calculateDayGross(dateStr);
              return (
                <td key={dateStr} className="px-2 py-3 text-center text-sm font-medium text-gray-900">
                  {gross > 0 ? formatCurrency(gross) : '-'}
                </td>
              );
            })}
          </tr>
          {/* Net Row */}
          <tr className="bg-gray-50">
            <td className="px-4 py-3 text-sm font-semibold text-gray-900 sticky left-0 bg-gray-50">
              Net ({settings.netPercentage}%)
            </td>
            <td colSpan={2}></td>
            {dates.map((dateStr) => {
              const net = calculateDayNet(dateStr);
              return (
                <td key={dateStr} className="px-2 py-3 text-center text-sm font-medium text-green-600">
                  {net > 0 ? formatCurrency(net) : '-'}
                </td>
              );
            })}
          </tr>
        </tfoot>
      </table>

      {/* Legend */}
      <div className="px-4 py-3 border-t bg-gray-50 flex items-center gap-6 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-blue-600" />
          <span>Overnight</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-yellow-400" />
          <span>Day only</span>
        </div>
      </div>
    </div>
  );
}
