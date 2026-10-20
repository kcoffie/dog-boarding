import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DataProvider } from './context/DataContext';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import MatrixPage from './pages/MatrixPage';
import DogsPage from './pages/DogsPage';
import SettingsPage from './pages/SettingsPage';
import PayrollPage from './pages/PayrollPage';
import CalendarPage from './pages/CalendarPage';
import ProfilePage from './pages/ProfilePage';
import SyncHistoryPage from './pages/SyncHistoryPage';
import MessageLogPage from './pages/MessageLogPage';
import ProtectedRoute from './components/auth/ProtectedRoute';
import LoginPage from './pages/auth/LoginPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';

function App() {
  return (
    <ErrorBoundary>
    <DataProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />

          {/* Auth routes (public) */}
          <Route path="/login" element={<LoginPage />} />
          {/* No self sign-up: Kate adds accounts in Supabase (REQ-001). Old links land on login. */}
          <Route path="/signup" element={<Navigate to="/login" replace />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Protected routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<MatrixPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="dogs" element={<DogsPage />} />
            <Route path="payroll" element={<PayrollPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="sync-history" element={<SyncHistoryPage />} />
            <Route path="messages" element={<MessageLogPage />} />
            <Route path="profile" element={<ProfilePage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </DataProvider>
    </ErrorBoundary>
  );
}

export default App;
