import React from 'react';

export default function LandingPage({ onOpenAuth }) {
  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="saas-landing-page">
      {/* =========================================================
          1. NAVIGATION BAR
      ========================================================== */}
      <header className="saas-navbar">
        <div className="saas-nav-container">
          <div className="saas-nav-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <svg width="38" height="38" viewBox="0 0 40 40" fill="none">
              <rect width="40" height="40" rx="10" fill="#F87524" />
              <rect x="9" y="10" width="10" height="8" rx="2" fill="#FFFFFF" />
              <rect x="9" y="22" width="10" height="8" rx="2" fill="#242052" />
              <rect x="22" y="10" width="9" height="20" rx="2" fill="#FFFFFF" />
              <path d="M24.5 19.5L26.2 21.2L29.5 17.5" stroke="#F87524" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="saas-brand-text">
              <span className="saas-brand-name">Workly</span>
              <span className="saas-brand-tag">SaaS Platform</span>
            </div>
          </div>

          <nav className="saas-nav-links">
            <button type="button" onClick={() => scrollToSection('features')} className="saas-nav-link">
              Features
            </button>
            <button type="button" onClick={() => scrollToSection('workflow')} className="saas-nav-link">
              How It Works
            </button>
            <button type="button" onClick={() => scrollToSection('sync-engine')} className="saas-nav-link">
              Excel Sync
            </button>
            <button type="button" onClick={() => scrollToSection('metrics')} className="saas-nav-link">
              Platform Metrics
            </button>
          </nav>

          <div className="saas-nav-actions">
            <button
              type="button"
              className="saas-btn-text"
              onClick={() => onOpenAuth('admin')}
            >
              Admin Portal
            </button>
            <button
              type="button"
              className="saas-btn-ghost"
              onClick={() => onOpenAuth('user')}
            >
              Sign In
            </button>
            <button
              type="button"
              className="saas-btn-primary"
              onClick={() => onOpenAuth('user')}
            >
              Get Started
            </button>
          </div>
        </div>
      </header>

      {/* =========================================================
          2. HERO SECTION
      ========================================================== */}
      <section className="saas-hero-section">
        {/* Subtle decorative glowing background shapes */}
        <div className="saas-glow-orb orb-primary" />
        <div className="saas-glow-orb orb-secondary" />

        <div className="saas-hero-content">
          {/* Hero Top Badge */}
          <div className="saas-hero-badge">
            <span className="saas-badge-dot" />
            <span className="saas-badge-text">SMART WORKFLOW MANAGEMENT</span>
          </div>

          {/* Main Headline */}
          <h1 className="saas-hero-headline">
            Manage Tasks. <br />
            Track Progress. <br />
            <span className="gradient-highlight">Work Smarter.</span>
          </h1>

          {/* Supporting Description */}
          <p className="saas-hero-description">
            The high-performance workspace where administrators assign deliverables, team members
            record live progress notes, and every milestone synchronizes seamlessly to master Excel
            workbooks in real time.
          </p>

          {/* Action Buttons */}
          <div className="saas-hero-ctas">
            <button
              type="button"
              className="saas-cta-primary"
              onClick={() => onOpenAuth('user')}
            >
              <span>Get Started</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </button>

            <button
              type="button"
              className="saas-cta-secondary"
              onClick={() => scrollToSection('features')}
            >
              <span>Explore Features</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>

          {/* =====================================================
              DASHBOARD PREVIEW & FLOATING UI MOCKUP
          ===================================================== */}
          <div className="saas-preview-wrapper">
            {/* Floating UI Card 1: Master Excel Sync */}
            <div className="saas-floating-card card-excel-sync">
              <div className="floating-card-icon excel-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="8" y1="13" x2="16" y2="13"></line>
                  <line x1="8" y1="17" x2="16" y2="17"></line>
                  <line x1="10" y1="9" x2="8" y2="9"></line>
                </svg>
              </div>
              <div className="floating-card-body">
                <div className="floating-card-header">
                  <strong>Master Excel Sync</strong>
                  <span className="live-pulse-dot" />
                </div>
                <p>Synced tasks.xlsx (Row 14) • Real-time</p>
              </div>
            </div>

            {/* Floating UI Card 2: Live Deadline Timer */}
            <div className="saas-floating-card card-timer">
              <div className="floating-card-icon timer-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
              </div>
              <div className="floating-card-body">
                <div className="floating-card-header">
                  <strong>Live Countdown</strong>
                  <span className="timer-pill-active">Active</span>
                </div>
                <p className="timer-countdown">01:45:20 remaining</p>
              </div>
            </div>

            {/* Floating UI Card 3: Admin Feedback Approval */}
            <div className="saas-floating-card card-feedback">
              <div className="floating-card-icon feedback-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
              </div>
              <div className="floating-card-body">
                <div className="floating-card-header">
                  <strong>Admin Feedback</strong>
                  <span className="verified-pill">Approved</span>
                </div>
                <p>"Milestone delivered with excellence."</p>
              </div>
            </div>

            {/* The Main High-Fidelity SaaS Dashboard Screen */}
            <div className="saas-dashboard-mockup">
              {/* Window Controls Chrome */}
              <div className="mockup-window-bar">
                <div className="window-dots">
                  <span className="dot dot-red" />
                  <span className="dot dot-yellow" />
                  <span className="dot dot-green" />
                </div>
                <div className="mockup-search-pill">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                  <span>workly.internal/app/dashboard</span>
                </div>
                <div className="mockup-sync-status">
                  <span className="sync-pulse" />
                  <span>Master Sync Online</span>
                </div>
              </div>

              {/* Mockup Dashboard Content */}
              <div className="mockup-content">
                {/* Mockup Topbar */}
                <div className="mockup-inner-header">
                  <div>
                    <h4 className="mockup-title">Task Orchestration & Live Progress</h4>
                    <span className="mockup-subtitle">Department View: IT • HRD • Marketing</span>
                  </div>
                  <div className="mockup-stats-chips">
                    <span className="mockup-chip chip-active">3 Active Deliverables</span>
                    <span className="mockup-chip chip-success">100% Synced</span>
                  </div>
                </div>

                {/* Mockup Table */}
                <div className="mockup-table-container">
                  <div className="mockup-table-head">
                    <span>Task Deliverable</span>
                    <span>Assignee</span>
                    <span>Department</span>
                    <span>Deadline Timer</span>
                    <span>Status</span>
                  </div>

                  {/* Row 1 */}
                  <div className="mockup-table-row">
                    <div className="mockup-cell-task">
                      <strong>API Architecture & Security Specs</strong>
                      <span className="mockup-brief-badge">Document Attached ↗</span>
                    </div>
                    <div className="mockup-cell-user">
                      <div className="mockup-avatar avatar-it">S</div>
                      <span>sanzz</span>
                    </div>
                    <div>
                      <span className="mockup-dept-badge it">IT</span>
                    </div>
                    <div>
                      <span className="mockup-timer-badge">01:45:20 remaining</span>
                    </div>
                    <div>
                      <span className="mockup-status-badge in-progress">In Progress</span>
                    </div>
                  </div>

                  {/* Row 2 */}
                  <div className="mockup-table-row">
                    <div className="mockup-cell-task">
                      <strong>Q4 Growth & Campaign Rollout</strong>
                      <span className="mockup-brief-badge">Media Deck ↗</span>
                    </div>
                    <div className="mockup-cell-user">
                      <div className="mockup-avatar avatar-mkt">J</div>
                      <span>jessica</span>
                    </div>
                    <div>
                      <span className="mockup-dept-badge mkt">Marketing</span>
                    </div>
                    <div>
                      <span className="mockup-timer-badge success">Completed On Time</span>
                    </div>
                    <div>
                      <span className="mockup-status-badge completed">Completed</span>
                    </div>
                  </div>

                  {/* Row 3 */}
                  <div className="mockup-table-row">
                    <div className="mockup-cell-task">
                      <strong>Enterprise Policy & Compliance Audit</strong>
                      <span className="mockup-brief-badge">Guidelines ↗</span>
                    </div>
                    <div className="mockup-cell-user">
                      <div className="mockup-avatar avatar-hrd">R</div>
                      <span>Rohan Sharma</span>
                    </div>
                    <div>
                      <span className="mockup-dept-badge hrd">HRD</span>
                    </div>
                    <div>
                      <span className="mockup-timer-badge success">Verified On Time</span>
                    </div>
                    <div>
                      <span className="mockup-status-badge completed">Completed</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================
          3. FEATURES SECTION
      ========================================================== */}
      <section id="features" className="saas-features-section">
        <div className="saas-section-container">
          <div className="saas-section-heading">
            <span className="saas-section-tag">CORE CAPABILITIES</span>
            <h2>Engineered for Agile Teams & Rigorous Tracking</h2>
            <p>
              Everything modern organizations need to allocate deliverables, foster accountability,
              and maintain continuous spreadsheet compliance without friction.
            </p>
          </div>

          <div className="saas-features-grid">
            {/* Feature 1 */}
            <div className="saas-feature-card">
              <div className="feature-icon-wrapper icon-orange">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                  <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                  <path d="M9 14l2 2 4-4"></path>
                </svg>
              </div>
              <h3>Smart Task Assignment</h3>
              <p>
                Admins allocate tasks to team members by department with detailed instructions, live
                countdown deadline timers, and attached project brief documents or URLs.
              </p>
              <div className="feature-card-footer">
                <span>Department-aware allocation</span>
                <span>→</span>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="saas-feature-card">
              <div className="feature-icon-wrapper icon-navy">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                </svg>
              </div>
              <h3>Real-Time Progress Tracking</h3>
              <p>
                Team members log granular progress notes, upload deliverables or proof links, update
                milestone statuses, and receive instant administrative feedback in real time.
              </p>
              <div className="feature-card-footer">
                <span>Live milestone updates</span>
                <span>→</span>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="saas-feature-card">
              <div className="feature-icon-wrapper icon-green">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="3" y1="9" x2="21" y2="9"></line>
                  <line x1="3" y1="15" x2="21" y2="15"></line>
                  <line x1="9" y1="3" x2="9" y2="21"></line>
                  <line x1="15" y1="3" x2="15" y2="21"></line>
                </svg>
              </div>
              <h3>Automated Excel Synchronization</h3>
              <p>
                Task creations, deadline extensions, progress notes, and completion timestamps
                automatically write directly into your master Excel workbook without manual data entry.
              </p>
              <div className="feature-card-footer">
                <span>Zero manual spreadsheet work</span>
                <span>→</span>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="saas-feature-card">
              <div className="feature-icon-wrapper icon-purple">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                </svg>
              </div>
              <h3>Role-Based Access</h3>
              <p>
                Dedicated, isolated workspaces for Administrators and Team Members ensure strict
                privacy, secure attendance tracking, and personalized employee directory management.
              </p>
              <div className="feature-card-footer">
                <span>Role-tailored environments</span>
                <span>→</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================
          4. WORKFLOW SECTION (HOW IT WORKS)
      ========================================================== */}
      <section id="workflow" className="saas-workflow-section">
        <div className="saas-section-container">
          <div className="saas-section-heading">
            <span className="saas-section-tag">STREAMLINED WORKFLOW</span>
            <h2>How Workly Powers Daily Collaboration</h2>
            <p>From initial brief to final verified delivery and spreadsheet synchronization.</p>
          </div>

          <div className="saas-steps-row">
            <div className="saas-step-card">
              <span className="step-number">01</span>
              <h4>Admin Allocates & Attaches</h4>
              <p>
                Select team members filtered by department (IT, HRD, Marketing), establish countdown
                deadlines, and attach project specifications.
              </p>
            </div>

            <div className="step-connector-arrow">→</div>

            <div className="saas-step-card">
              <span className="step-number">02</span>
              <h4>Member Updates & Delivers</h4>
              <p>
                Employees view assigned briefs, work against the live countdown timer, post progress
                notes, and attach deliverable proof files or links.
              </p>
            </div>

            <div className="step-connector-arrow">→</div>

            <div className="saas-step-card">
              <span className="step-number">03</span>
              <h4>Automated Excel Sync & Feedback</h4>
              <p>
                Every change is logged directly to the master Excel workbook. Admin reviews
                deliverables and provides instant feedback.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================
          5. METRICS & PLATFORM STATS SECTION
      ========================================================== */}
      <section id="metrics" className="saas-metrics-section">
        <div className="saas-section-container">
          <div className="saas-metrics-box">
            <div className="metrics-box-top">
              <span className="saas-section-tag light">PROVEN PERFORMANCE</span>
              <h2>Engineered for Enterprise Speed & Spreadsheet Reliability</h2>
            </div>

            <div className="metrics-grid">
              <div className="metric-item">
                <span className="metric-number">100%</span>
                <span className="metric-label">Automated Excel Sync</span>
                <p className="metric-subtext">Direct ExcelJS workbook updates</p>
              </div>

              <div className="metric-item">
                <span className="metric-number">&lt; 50ms</span>
                <span className="metric-label">Socket Event Latency</span>
                <p className="metric-subtext">Instant real-time team broadcasts</p>
              </div>

              <div className="metric-item">
                <span className="metric-number">3 Modules</span>
                <span className="metric-label">Department Alignment</span>
                <p className="metric-subtext">Integrated IT, HRD & Marketing</p>
              </div>

              <div className="metric-item">
                <span className="metric-number">Zero</span>
                <span className="metric-label">Manual Logging Friction</span>
                <p className="metric-subtext">Automated attendance & audit trail</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================
          6. BOTTOM CALL TO ACTION BANNER
      ========================================================== */}
      <section id="sync-engine" className="saas-cta-banner-section">
        <div className="saas-section-container">
          <div className="saas-cta-banner">
            <div className="cta-banner-content">
              <h2>Ready to Transform Your Team's Workflow?</h2>
              <p>
                Experience seamless task allocation, live countdown deadline management, and automatic
                master Excel synchronization in one unified platform.
              </p>
              <div className="cta-banner-actions">
                <button
                  type="button"
                  className="saas-cta-primary"
                  onClick={() => onOpenAuth('user')}
                >
                  <span>Get Started with Workly</span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                  </svg>
                </button>
                <button
                  type="button"
                  className="saas-cta-ghost-light"
                  onClick={() => onOpenAuth('admin')}
                >
                  <span>Access Admin Portal</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================
          7. CLEAN SAAS FOOTER
      ========================================================== */}
      <footer className="saas-footer">
        <div className="saas-footer-container">
          <div className="saas-footer-brand">
            <div className="footer-logo">
              <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
                <rect width="40" height="40" rx="10" fill="#F87524" />
                <rect x="9" y="10" width="10" height="8" rx="2" fill="#FFFFFF" />
                <rect x="9" y="22" width="10" height="8" rx="2" fill="#242052" />
                <rect x="22" y="10" width="9" height="20" rx="2" fill="#FFFFFF" />
                <path d="M24.5 19.5L26.2 21.2L29.5 17.5" stroke="#F87524" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="footer-brand-title">Workly</span>
            </div>
            <p className="footer-tagline">
              Modern SaaS task allocation, live milestone tracking, and automatic Excel synchronization.
            </p>
          </div>

          <div className="saas-footer-links">
            <div className="footer-links-col">
              <h5>Platform</h5>
              <button type="button" onClick={() => scrollToSection('features')}>Features</button>
              <button type="button" onClick={() => scrollToSection('workflow')}>Workflow</button>
              <button type="button" onClick={() => scrollToSection('sync-engine')}>Excel Sync</button>
              <button type="button" onClick={() => scrollToSection('metrics')}>Metrics</button>
            </div>

            <div className="footer-links-col">
              <h5>Access</h5>
              <button type="button" onClick={() => onOpenAuth('user')}>Team Member Login</button>
              <button type="button" onClick={() => onOpenAuth('admin')}>Administrator Portal</button>
              <button type="button" onClick={() => onOpenAuth('user')}>Create Account</button>
            </div>

            <div className="footer-links-col">
              <h5>Compliance</h5>
              <span>Node.js & ExcelJS</span>
              <span>WebSocket Realtime</span>
              <span>Role-Based Security</span>
              <span>Encrypted Sessions</span>
            </div>
          </div>
        </div>

        <div className="saas-footer-bottom">
          <span>&copy; {new Date().getFullYear()} Workly SaaS. All rights reserved.</span>
          <span>Powered by AIMarkvent</span>
        </div>
      </footer>
    </div>
  );
}
