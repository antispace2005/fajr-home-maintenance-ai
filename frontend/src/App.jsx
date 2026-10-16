import { useState, useEffect } from 'react';
import CustomerChat from './pages/CustomerChat';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener('popstate', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  const navigateTo = (path) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
  };

  const handleLoginSuccess = () => {
    navigateTo('/admin');
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    navigateTo('/login');
  };

  // Route matching
  if (currentPath === '/login') {
    // If already logged in, redirect to admin
    const token = localStorage.getItem('admin_token');
    if (token) {
      navigateTo('/admin');
      return null;
    }
    return <AdminLogin onLoginSuccess={handleLoginSuccess} />;
  }

  if (currentPath === '/admin') {
    const token = localStorage.getItem('admin_token');
    if (!token) {
      return <AdminLogin onLoginSuccess={handleLoginSuccess} />;
    }
    return <AdminDashboard onLogout={handleLogout} />;
  }

  // Default: Customer-facing chat application (no visible link to admin)
  return <CustomerChat />;
}
