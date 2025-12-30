import { formatDate } from '../utils/dateUtils';

export default function DateNavigator({ startDate, onDateChange }) {
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 13); // 14 days total

  const handlePrevWeek = () => {
    const newDate = new Date(startDate);
    newDate.setDate(newDate.getDate() - 7);
    onDateChange(newDate);
  };

  const handlePrevDay = () => {
    const newDate = new Date(startDate);
    newDate.setDate(newDate.getDate() - 1);
    onDateChange(newDate);
  };

  const handleToday = () => {
    onDateChange(new Date());
  };

  const handleNextDay = () => {
    const newDate = new Date(startDate);
    newDate.setDate(newDate.getDate() + 1);
    onDateChange(newDate);
  };

  const handleNextWeek = () => {
    const newDate = new Date(startDate);
    newDate.setDate(newDate.getDate() + 7);
    onDateChange(newDate);
  };

  const buttonClass = "px-3 py-1.5 text-sm font-medium rounded-md transition-colors";
  const navButtonClass = `${buttonClass} text-gray-700 bg-white border border-gray-300 hover:bg-gray-50`;
  const todayButtonClass = `${buttonClass} text-white bg-blue-600 hover:bg-blue-700`;

  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <button onClick={handlePrevWeek} className={navButtonClass}>
          ← Week
        </button>
        <button onClick={handlePrevDay} className={navButtonClass}>
          ← Day
        </button>
        <button onClick={handleToday} className={todayButtonClass}>
          Today
        </button>
        <button onClick={handleNextDay} className={navButtonClass}>
          Day →
        </button>
        <button onClick={handleNextWeek} className={navButtonClass}>
          Week →
        </button>
      </div>
      <div className="text-gray-700 font-medium">
        {formatDate(startDate.toISOString())} - {formatDate(endDate.toISOString())}
      </div>
    </div>
  );
}
