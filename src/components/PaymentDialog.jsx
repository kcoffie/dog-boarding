import { useState, useEffect, useRef } from 'react';

/**
 * Mark as Paid: each night shows its own amount and the payment is the sum of the ticked nights,
 * in whole cents (#370). One click saves once; a failed save keeps the box open with the error.
 * @requirements REQ-041
 */
export default function PaymentDialog({ isOpen, employee, outstandingData, onConfirm, onCancel, formatCurrency }) {
  const [selectedDates, setSelectedDates] = useState([]);
  const [openedFor, setOpenedFor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const savingRef = useRef(false);

  // Tick every night only when the box opens (or opens for someone else), adjusting state during
  // render as React recommends. The page rebuilds outstandingData on every render, so keying on it
  // would re-tick a night left out.
  const openKey = isOpen && outstandingData ? employee : null;
  if (openKey !== openedFor) {
    setOpenedFor(openKey);
    setSelectedDates(openKey === null ? [] : [...outstandingData.dates]);
    setSaving(false);
    setError(null);
  }

  // The saving guard is a ref so a second click in the same tick sees it; reset it on each open.
  useEffect(() => {
    if (openKey !== null) savingRef.current = false;
  }, [openKey]);

  if (!isOpen || !outstandingData) return null;

  const { dates, nights, nightCents = {} } = outstandingData;
  const sortedDates = [...dates].sort();
  // A data change can remove a tick (a night just paid elsewhere), never add one.
  const ticked = sortedDates.filter((d) => selectedDates.includes(d));
  const centsFor = (date) => nightCents[date] ?? 0;
  const selectedCents = ticked.reduce((sum, d) => sum + centsFor(d), 0);

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

  const handleConfirm = async () => {
    if (savingRef.current || ticked.length === 0) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    const nightAmounts = Object.fromEntries(ticked.map((d) => [d, centsFor(d) / 100]));
    try {
      await onConfirm(ticked, selectedCents / 100, nightAmounts);
    } catch (err) {
      setError(err?.message || 'The payment was not saved.');
    } finally {
      savingRef.current = false;
      setSaving(false);
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
        onClick={saving ? undefined : onCancel}
      />

      {/* Dialog */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-scaleIn">
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
              const isSelected = ticked.includes(date);
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
                    disabled={saving}
                    className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
                  />
                  <span className={`text-sm ${isSelected ? 'text-slate-900 font-medium' : 'text-slate-600'}`}>
                    {formatShortDate(date)}
                  </span>
                  <span className={`ml-auto text-sm ${isSelected ? 'text-emerald-600 font-medium' : 'text-slate-400'}`}>
                    {formatCurrency(centsFor(date) / 100)}
                  </span>
                </label>
              );
            })}
          </div>

          {/* Summary */}
          <div className="bg-slate-50 rounded-xl p-4 mb-4">
            <div className="flex justify-between items-center text-sm mb-2">
              <span className="text-slate-500">Selected nights</span>
              <span className="font-semibold text-slate-700">{ticked.length} of {nights}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Payment amount</span>
              <span className="text-xl font-bold text-emerald-600">{formatCurrency(selectedCents / 100)}</span>
            </div>
          </div>

          {error && (
            <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={saving}
              className="flex-1 min-h-[44px] px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 active:scale-[0.98] rounded-lg transition-all select-none"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={saving || ticked.length === 0}
              className={`flex-1 min-h-[44px] px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-all shadow-sm select-none ${
                !saving && ticked.length > 0
                  ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 active:scale-[0.98]'
                  : 'bg-slate-300 cursor-not-allowed'
              }`}
            >
              {saving ? 'Saving…' : 'Confirm Payment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
