import { useState, useEffect } from 'react';

export default function PaymentDialog({ isOpen, employee, outstandingData, onConfirm, onCancel, formatCurrency }) {
  const [selectedDates, setSelectedDates] = useState([]);

  // Reset selection when dialog opens with new employee
  useEffect(() => {
    if (isOpen && outstandingData?.dates) {
      setSelectedDates([...outstandingData.dates]);
    }
  }, [isOpen, outstandingData]);

  if (!isOpen || !outstandingData) return null;

  const { dates, amount, nights } = outstandingData;
  const sortedDates = [...dates].sort();

  // Calculate amount per night (average)
  const amountPerNight = nights > 0 ? amount / nights : 0;

  // Calculate selected amount
  const selectedAmount = selectedDates.length * amountPerNight;

  const toggleDate = (date) => {
    setSelectedDates(prev =>
      prev.includes(date)
        ? prev.filter(d => d !== date)
        : [...prev, date]
    );
  };

  const selectAll = () => {
    setSelectedDates([...dates]);
  };

  const deselectAll = () => {
    setSelectedDates([]);
  };

  const handleConfirm = () => {
    if (selectedDates.length > 0) {
      onConfirm(selectedDates, selectedAmount);
    }
  };

  const formatShortDate = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6 transform transition-all">
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <span className="text-lg font-semibold text-emerald-600">{employee.charAt(0).toUpperCase()}</span>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Pay {employee}</h3>
              <p className="text-sm text-slate-500">Select dates to include in payment</p>
            </div>
          </div>

          {/* Selection Controls */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={selectAll}
              className="min-h-[44px] px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 active:scale-[0.98] rounded-lg transition-all select-none"
            >
              Select All
            </button>
            <button
              onClick={deselectAll}
              className="min-h-[44px] px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 active:scale-[0.98] rounded-lg transition-all select-none"
            >
              Deselect All
            </button>
          </div>

          {/* Date List */}
          <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-xl mb-4">
            {sortedDates.map((date) => {
              const isSelected = selectedDates.includes(date);
              return (
                <label
                  key={date}
                  className={`flex items-center gap-3 px-4 py-3 min-h-[44px] cursor-pointer border-b border-slate-100 last:border-b-0 transition-colors select-none ${
                    isSelected ? 'bg-emerald-50 active:bg-emerald-100' : 'hover:bg-slate-50 active:bg-slate-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleDate(date)}
                    className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
                  />
                  <span className={`text-sm ${isSelected ? 'text-slate-900 font-medium' : 'text-slate-600'}`}>
                    {formatShortDate(date)}
                  </span>
                  <span className={`ml-auto text-sm ${isSelected ? 'text-emerald-600 font-medium' : 'text-slate-400'}`}>
                    {formatCurrency(amountPerNight)}
                  </span>
                </label>
              );
            })}
          </div>

          {/* Summary */}
          <div className="bg-slate-50 rounded-xl p-4 mb-4">
            <div className="flex justify-between items-center text-sm mb-2">
              <span className="text-slate-500">Selected nights</span>
              <span className="font-semibold text-slate-700">{selectedDates.length} of {nights}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Payment amount</span>
              <span className="text-xl font-bold text-emerald-600">{formatCurrency(selectedAmount)}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 min-h-[44px] px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 active:scale-[0.98] rounded-lg transition-all select-none"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={selectedDates.length === 0}
              className={`flex-1 min-h-[44px] px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-all shadow-sm select-none ${
                selectedDates.length > 0
                  ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 active:scale-[0.98]'
                  : 'bg-slate-300 cursor-not-allowed'
              }`}
            >
              Confirm Payment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
