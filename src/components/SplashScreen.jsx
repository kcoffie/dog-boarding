export default function SplashScreen() {
  return (
    <div
      className="fixed inset-0 bg-gradient-to-br from-indigo-600 to-indigo-700 flex items-center justify-center z-50"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)'
      }}
    >
      <div className="text-center animate-fadeIn">
        {/* Logo */}
        <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center mb-6 mx-auto shadow-lg animate-pulse-soft">
          <span className="text-indigo-600 font-bold text-4xl">Q</span>
        </div>

        {/* App Name */}
        <h1 className="text-white text-2xl font-bold tracking-tight mb-2">Qboard</h1>
        <p className="text-indigo-200 text-sm">Boarding Manager</p>

        {/* Loading Spinner */}
        <div className="mt-8">
          <div className="w-8 h-8 border-3 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
        </div>
      </div>
    </div>
  );
}
