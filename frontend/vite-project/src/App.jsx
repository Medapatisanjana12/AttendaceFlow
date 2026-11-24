import { useState } from 'react';
import axios from 'axios';
import AdminDashboard from './components/AdminDashboard';
import UserDashboard from './components/UserDashboard';
import { BrandLogo, HeroEditorialIllustration } from './components/Illustrations';
import { API_BASE_URL } from './config';
import './App.css';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loginPortal, setLoginPortal] = useState('user');
  const [isRegisterMode, setIsRegisterMode] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const switchPortal = (portal) => {
    setLoginPortal(portal);
    setIsRegisterMode(false);
    setError('');
    setSuccessMsg('');
    setEmail('');
    setPassword('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    try {
      if (isRegisterMode && loginPortal === 'user') {
        await axios.post(`${API_BASE_URL}/register`, {
          name,
          email,
          password,
        });
        setSuccessMsg('Account created! Please sign in.');
        setIsRegisterMode(false);
        setPassword('');
      } else {
        const res = await axios.post(`${API_BASE_URL}/login`, {
          email,
          password,
        });

        if (res.data.role !== loginPortal) {
          setError(
            loginPortal === 'admin'
              ? 'Access denied: This account does not have Admin privileges.'
              : 'Please switch to the Admin Login tab to sign in with an Admin account.'
          );
          return;
        }

        setCurrentUser(res.data);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setEmail('');
    setPassword('');
    setError('');
    setSuccessMsg('');
  };

  if (currentUser?.role === 'admin') {
    return <AdminDashboard onLogout={handleLogout} />;
  }

  if (currentUser?.role === 'user') {
    return <UserDashboard userEmail={currentUser.email} onLogout={handleLogout} />;
  }

  return (
    <div className="auth-wrapper">
      {/* Left Hero Panel */}
      <div className="hero-panel">
        <div style={{ marginBottom: '24px', position: 'relative', zIndex: 1 }}>
          <BrandLogo />
        </div>

        <div className="hero-badge">Real-Time Excel Sync</div>
        <h1>Smart Workflow & Task Tracker</h1>
        <p>
          Assign tasks, add live progress notes, and sync every update directly
          into your master Excel workbook automatically.
        </p>

        <ul className="feature-list">
          <li>Instant progress notes & status updates</li>
          <li>Role-based privacy for team members</li>
          <li>Zero-effort Excel spreadsheet logging</li>
        </ul>

        <HeroEditorialIllustration />
      </div>

      {/* Right Auth Card */}
      <div className="auth-panel">
        <div className="auth-card">
          <div className="portal-selector">
            <button
              type="button"
              className={loginPortal === 'user' ? 'portal-btn active' : 'portal-btn'}
              onClick={() => switchPortal('user')}
            >
              User Login
            </button>
            <button
              type="button"
              className={loginPortal === 'admin' ? 'portal-btn active-admin' : 'portal-btn'}
              onClick={() => switchPortal('admin')}
            >
              Admin Login
            </button>
          </div>

          {loginPortal === 'user' && (
            <div className="auth-tabs">
              <button
                type="button"
                className={!isRegisterMode ? 'tab active' : 'tab'}
                onClick={() => {
                  setIsRegisterMode(false);
                  setError('');
                }}
              >
                Sign In
              </button>
              <button
                type="button"
                className={isRegisterMode ? 'tab active' : 'tab'}
                onClick={() => {
                  setIsRegisterMode(true);
                  setError('');
                }}
              >
                Create Account
              </button>
            </div>
          )}

          <h2>
            {loginPortal === 'admin'
              ? 'Admin Portal'
              : isRegisterMode
              ? 'Create Team Account'
              : 'Team Member Login'}
          </h2>
          <p className="subtitle">
            {loginPortal === 'admin'
              ? 'Sign in to assign tasks and monitor live team updates'
              : isRegisterMode
              ? 'Register to view and update your assigned tasks'
              : 'Enter your credentials to access your assigned tasks'}
          </p>

          {error && <div className="alert error">{error}</div>}
          {successMsg && <div className="alert success">{successMsg}</div>}

          <form onSubmit={handleSubmit} className="auth-form">
            {isRegisterMode && loginPortal === 'user' && (
              <div className="input-group">
                <label>Full Name</label>
                <input
                  type="text"
                  placeholder="Ravi Kumar"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="input-group">
              <label>{loginPortal === 'admin' ? 'Admin Email' : 'Work Email'}</label>
              <input
                type="email"
                placeholder={
                  loginPortal === 'admin' ? 'admin@company.com' : 'ravi@company.com'
                }
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="input-group">
              <label>Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className={
                loginPortal === 'admin' ? 'btn-admin full-width' : 'btn-primary full-width'
              }
            >
              {loginPortal === 'admin'
                ? 'Sign In as Admin'
                : isRegisterMode
                ? 'Create Account'
                : 'Sign In as User'}
            </button>
          </form>

          {loginPortal === 'admin' && (
            <div className="demo-hint">
              Default Admin: <strong>admin@company.com</strong> / <strong>admin123</strong>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
