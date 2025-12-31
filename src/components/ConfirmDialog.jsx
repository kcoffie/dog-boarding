export default function ConfirmDialog({ isOpen, title, message, onConfirm, onCancel, confirmText = 'Delete', confirmColor = 'red' }) {
  if (!isOpen) return null;

  const colorClasses = {
    red: {
      iconBg: 'bg-red-100',
      iconText: 'text-red-600',
      button: 'bg-red-600 hover:bg-red-700 active:bg-red-800',
    },
    emerald: {
      iconBg: 'bg-emerald-100',
      iconText: 'text-emerald-600',
      button: 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800',
    },
  };

  const colors = colorClasses[confirmColor] || colorClasses.red;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 transition-opacity"
        onClick={onCancel}
      />

      {/* Mobile: Bottom sheet style, Desktop: Centered dialog */}
      <div className="fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center">
        <div
          className="relative bg-white rounded-t-2xl md:rounded-2xl shadow-xl w-full md:max-w-sm md:mx-4 animate-slideUp md:animate-scaleIn"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="p-5">
            {/* Drag handle - mobile only */}
            <div className="md:hidden w-10 h-1 bg-slate-300 rounded-full mx-auto mb-4" />

            {/* Icon and content in a row on mobile for compactness */}
            <div className="flex items-start gap-4 md:flex-col md:items-center">
              {/* Icon */}
              <div className={`flex-shrink-0 w-10 h-10 md:w-12 md:h-12 md:mb-3 rounded-full ${colors.iconBg} flex items-center justify-center`}>
                {confirmColor === 'emerald' ? (
                  <svg className={`w-5 h-5 md:w-6 md:h-6 ${colors.iconText}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className={`w-5 h-5 md:w-6 md:h-6 ${colors.iconText}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 md:text-center">
                <h3 className="text-base font-semibold text-slate-900 mb-1">{title}</h3>
                <p className="text-sm text-slate-600">{message}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-5">
              <button
                onClick={onCancel}
                className="flex-1 min-h-[44px] px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 active:scale-[0.98] rounded-xl transition-all select-none"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className={`flex-1 min-h-[44px] px-4 py-2.5 text-sm font-medium text-white ${colors.button} active:scale-[0.98] rounded-xl transition-all shadow-sm select-none`}
              >
                {confirmText}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
