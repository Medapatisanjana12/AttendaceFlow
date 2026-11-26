import { useState } from 'react';
import AdminDashboard from './components/AdminDashboard';
import UserDashboard from './components/UserDashboard';
import LandingPage from './components/LandingPage';
import AuthModal from './components/AuthModal';
import './App.css';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalPortal, setAuthModalPortal] = useState('user');
  const [adminOnly, setAdminOnly] = useState(false);

  const handleOpenAuth = (portal = 'user', isOnlyAdmin = false) => {
    const isAdm = isOnlyAdmin || portal === 'admin';
    setAuthModalPortal(isAdm ? 'admin' : portal);
    setAdminOnly(isAdm);
    setIsAuthModalOpen(true);
  };

  const handleCloseAuth = () => {
    setIsAuthModalOpen(false);
  };

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    setIsAuthModalOpen(false);
  };

  const handleLogout = () => {
    setCurrentUser(null);
  };

  if (currentUser?.role === 'admin') {
    return (
      <AdminDashboard
        adminUser={currentUser}
        onUpdateAdmin={setCurrentUser}
        onLogout={handleLogout}
      />
    );
  }

  if (currentUser?.role === 'user') {
    return (
      <UserDashboard
        userEmail={currentUser.email}
        currentUser={currentUser}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <>
      <LandingPage onOpenAuth={handleOpenAuth} />
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={handleCloseAuth}
        initialPortal={authModalPortal}
        adminOnly={adminOnly}
        onLoginSuccess={handleLoginSuccess}
      />
    </>
  );
}
