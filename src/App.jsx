import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { DataProvider } from './context/DataContext';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import MatrixPage from './pages/MatrixPage';
import DogsPage from './pages/DogsPage';
import SettingsPage from './pages/SettingsPage';
import PayrollPage from './pages/PayrollPage';
import CalendarPage from './pages/CalendarPage';
import ProtectedRoute from './components/auth/ProtectedRoute';
import LoginPage from './pages/auth/LoginPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';

function App() {
  return (
    <ErrorBoundary>
    <DataProvider>
      <BrowserRouter>
        <Routes>
          {/* Auth routes (public) */}
          <Route path="/login" element={<LoginPage />} />
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
          </Route>
        </Routes>
      </BrowserRouter>
    </DataProvider>
    </ErrorBoundary>
  );
}

export default App;
