import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { DataProvider } from './context/DataContext';
import Layout from './components/Layout';
import MatrixPage from './pages/MatrixPage';
import DogsPage from './pages/DogsPage';
import SettingsPage from './pages/SettingsPage';
import PayrollPage from './pages/PayrollPage';

function App() {
  return (
    <DataProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<MatrixPage />} />
            <Route path="dogs" element={<DogsPage />} />
            <Route path="payroll" element={<PayrollPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </DataProvider>
  );
}

export default App;
