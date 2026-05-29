import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import { Toaster } from 'react-hot-toast';

// Admin Pages
import AdminLayout from './pages/AdminLayout';
import AdminDashboard from './pages/AdminDashboard';
import AdminMaterials from './pages/AdminMaterials';
import AdminExchange from './pages/AdminExchange';
import AdminNews from './pages/AdminNews';
import AdminAnalytics from './pages/AdminAnalytics';
import AdminContributions from './pages/AdminContributions';
import AdminProjects from './pages/AdminProjects';
import AdminFeedback from './pages/AdminFeedback';
import AdminReports from './pages/AdminReports';
import AdminChatLogs from './pages/AdminChatLogs';
import AdminCoordinatorsLog from './pages/AdminCoordinatorsLog';
import AdminSettings from './pages/AdminSettings';
import Login from './pages/Login';

import CoordinatorPortal from './pages/CoordinatorPortal';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Toaster position="top-center" />
        <Routes>
          {/* Public Routes */}
          <Route path="/admin/login" element={<Login />} />
          <Route path="/dist" element={<CoordinatorPortal />} />
          
          {/* Protected Admin Routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboard />} />
              <Route path="materials" element={<AdminMaterials />} />
              <Route path="news" element={<AdminNews />} />
              <Route path="contributions" element={<AdminContributions />} />
              <Route path="projects" element={<AdminProjects />} />
              <Route path="exchange" element={<AdminExchange />} />
              <Route path="feedback" element={<AdminFeedback />} />
              <Route path="reports" element={<AdminReports />} />
              <Route path="chat-logs" element={<AdminChatLogs />} />
              <Route path="coordinators-log" element={<AdminCoordinatorsLog />} />
              <Route path="analytics" element={<AdminAnalytics />} />
              <Route path="settings" element={<AdminSettings />} />
            </Route>
          </Route>

          {/* Fallback Redirect */}
          <Route path="/" element={<Navigate to="/admin" replace />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
