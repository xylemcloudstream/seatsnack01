import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';
import Home from './pages/Home.jsx';
import OrderPage from './pages/OrderPage.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import StaffDashboard from './pages/StaffDashboard.jsx';
import SuperAdminDashboard from './pages/SuperAdminDashboard.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/o/:theatreSlug/:seatCode" element={<OrderPage />} />
        <Route path="/admin/:theatreSlug" element={<AdminDashboard />} />
        <Route path="/staff/:theatreSlug" element={<StaffDashboard />} />
        <Route path="/superadmin" element={<SuperAdminDashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
