export default function AuthLayout({ children, title, subtitle }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12"
      style={{
        paddingTop: 'calc(3rem + env(safe-area-inset-top))',
        paddingBottom: 'calc(3rem + env(safe-area-inset-bottom))'
      }}
    >
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg mx-auto mb-4">
            <span className="text-white font-bold text-2xl">Q</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          {subtitle && <p className="text-slate-500 mt-2">{subtitle}</p>}
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
