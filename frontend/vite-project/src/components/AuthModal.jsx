import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config';

export default function AuthModal({
  isOpen,
  onClose,
  initialPortal = 'user',
  adminOnly = false,
  onLoginSuccess,
}) {
  const [loginPortal, setLoginPortal] = useState(adminOnly ? 'admin' : initialPortal);
  const [isRegisterMode, setIsRegisterMode] = useState(false);

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync portal when initialPortal or adminOnly changes
  useEffect(() => {
    if (isOpen) {
      setLoginPortal(adminOnly ? 'admin' : initialPortal);
      setIsRegisterMode(false);
      setError('');
      setSuccessMsg('');
      setName('');
      setUsername('');
      setEmail('');
      setPassword('');
    }
  }, [isOpen, initialPortal, adminOnly]);

  // Keyboard escape listener to close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent background scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setIsSubmitting(true);

    try {
      if (!adminOnly && isRegisterMode && loginPortal === 'user') {
        await axios.post(`${API_BASE_URL}/register`, {
          name,
          username,
          email,
          password,
        });
        setSuccessMsg('Account created successfully! Please sign in with your email or username.');
        setIsRegisterMode(false);
        setPassword('');
        setUsername('');
      } else {
        const targetPortal = adminOnly ? 'admin' : loginPortal;
        const res = await axios.post(`${API_BASE_URL}/login`, {
          email: email.trim(),
          password,
        });

        if (res.data.role !== targetPortal) {
          setError(
            targetPortal === 'admin'
              ? 'Access denied: This account is registered as a Team Member. Please use the Get Started portal.'
              : 'Access denied: This is an Admin account. Please use the Admin Portal.'
          );
          setIsSubmitting(false);
          return;
        }

        onLoginSuccess(res.data);
      }
    } catch (err) {
      console.error('Sign in error:', err);
      if (err.response?.data?.error) {
        setError(err.response.data.error);
      } else if (err.message === 'Network Error' || !err.response) {
        setError('Cannot connect to backend server. Please verify the backend service is running.');
      } else {
        setError(err.message || 'Something went wrong during sign in');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="auth-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Close Button */}
        <button
          type="button"
          className="auth-modal-close"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        {/* Modal Brand Header */}
        <div className="auth-modal-header">
          <div className="auth-modal-logo">
            <svg width="34" height="34" viewBox="0 0 40 40" fill="none">
              <rect width="40" height="40" rx="10" fill="#F87524" />
              <rect x="9" y="10" width="10" height="8" rx="2" fill="#FFFFFF" />
              <rect x="9" y="22" width="10" height="8" rx="2" fill="#242052" />
              <rect x="22" y="10" width="9" height="20" rx="2" fill="#FFFFFF" />
              <path d="M24.5 19.5L26.2 21.2L29.5 17.5" stroke="#F87524" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="auth-modal-brand-name">Workly</span>
          </div>
          <span className="auth-modal-badge">
            {adminOnly ? 'Administrator Portal' : 'Member Workspace'}
          </span>
        </div>

        {/* User Sign In / Create Account Sub-tabs (Only in Member Mode) */}
        {!adminOnly && (
          <div className="auth-tabs auth-modal-subtabs">
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

        <div className="auth-modal-title-group">
          <h2>
            {adminOnly
              ? 'Administrator Sign In'
              : isRegisterMode
              ? 'Create Member Account'
              : 'Team Member Sign In'}
          </h2>
          <p className="subtitle">
            {adminOnly
              ? 'Sign in with administrative credentials to manage department operations'
              : isRegisterMode
              ? 'Register with your team handle to view and update assignments'
              : 'Enter your credentials to access your assigned tasks'}
          </p>
        </div>

        {error && <div className="alert error">{error}</div>}
        {successMsg && <div className="alert success">{successMsg}</div>}

        <form onSubmit={handleSubmit} className="auth-form auth-modal-form">
          {!adminOnly && isRegisterMode && (
            <>
              <div className="input-group">
                <label>Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Jessica Taylor"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="input-group">
                <label>Username</label>
                <input
                  type="text"
                  placeholder="e.g. jessica (unique handle)"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
            </>
          )}

          <div className="input-group">
            <label>{adminOnly ? 'Admin Email' : 'Work Email or Username'}</label>
            <input
              type={adminOnly ? 'email' : 'text'}
              placeholder={
                adminOnly ? 'admin@company.com' : 'jessica or jessica12@gmail.com'
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
            disabled={isSubmitting}
            className={
              adminOnly
                ? 'btn-admin full-width auth-modal-submit'
                : 'btn-primary full-width auth-modal-submit'
            }
          >
            {isSubmitting
              ? 'Authenticating...'
              : adminOnly
              ? 'Sign In as Admin'
              : isRegisterMode
              ? 'Create Account'
              : 'Sign In as User'}
          </button>
        </form>

        {adminOnly ? (
          <div className="demo-hint auth-modal-hint">
            <span>Demo Admin:</span> <strong>admin@company.com</strong> / <strong>admin123</strong>
          </div>
        ) : !isRegisterMode ? (
          <div className="demo-hint auth-modal-hint">
            <span>Demo Member:</span> <strong>jessica</strong> (or <strong>jessica12@gmail.com</strong>) / <strong>user123</strong>
          </div>
        ) : null}
      </div>
    </div>
  );
}
