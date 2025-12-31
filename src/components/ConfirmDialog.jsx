export default function ConfirmDialog({ isOpen, title, message, onConfirm, onCancel, confirmText = 'Delete', confirmColor = 'red' }) {
  if (!isOpen) return null;

  const colorClasses = {
    red: {
      iconBg: 'bg-red-100',
      iconText: 'text-red-600',
      button: 'bg-red-600 hover:bg-red-700',
    },
    emerald: {
      iconBg: 'bg-emerald-100',
      iconText: 'text-emerald-600',
      button: 'bg-emerald-600 hover:bg-emerald-700',
    },
  };

  const colors = colorClasses[confirmColor] || colorClasses.red;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-scaleIn">
          {/* Icon */}
          <div className={`w-12 h-12 mx-auto mb-4 rounded-full ${colors.iconBg} flex items-center justify-center`}>
            {confirmColor === 'emerald' ? (
              <svg className={`w-6 h-6 ${colors.iconText}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className={`w-6 h-6 ${colors.iconText}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
          </div>

          {/* Content */}
          <h3 className="text-lg font-semibold text-slate-900 text-center mb-2">{title}</h3>
          <p className="text-slate-600 text-center mb-6">{message}</p>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 min-h-[44px] px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 active:scale-[0.98] rounded-lg transition-all select-none"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className={`flex-1 min-h-[44px] px-4 py-2.5 text-sm font-medium text-white ${colors.button} active:scale-[0.98] rounded-lg transition-all shadow-sm select-none`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
