import { useState, useEffect } from 'react';
import axios from 'axios';
import socket from '../socket';
import { API_BASE_URL, BACKEND_URL } from '../config';

export default function AdminDashboard({ adminUser, onUpdateAdmin, onLogout }) {
  const [tasks, setTasks] = useState([]);
  const [assignedTo, setAssignedTo] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Individual User Modules State
  const [userModules, setUserModules] = useState([]);
  const [selectedUserFilter, setSelectedUserFilter] = useState('All');
  const [memberSearchQuery, setMemberSearchQuery] = useState('');

  // Admin Credentials Modal State
  const [showSettings, setShowSettings] = useState(false);
  const [adminName, setAdminName] = useState(adminUser?.name || 'System Admin');
  const [adminEmail, setAdminEmail] = useState(adminUser?.email || 'admin@company.com');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [settingsMsg, setSettingsMsg] = useState({ type: '', text: '' });
  const [isUpdatingCredentials, setIsUpdatingCredentials] = useState(false);

  useEffect(() => {
    if (adminUser) {
      setAdminName(adminUser.name || 'System Admin');
      setAdminEmail(adminUser.email || 'admin@company.com');
    }
  }, [adminUser]);

  const fetchUserModules = () => {
    axios
      .get(`${API_BASE_URL}/admin/user-modules`)
      .then((res) => {
        if (Array.isArray(res.data)) {
          setUserModules(res.data);
        }
      })
      .catch((err) => console.error('Error fetching user modules:', err));
  };

  useEffect(() => {
    axios
      .get(`${API_BASE_URL}/tasks?role=admin`)
      .then((res) => {
        if (Array.isArray(res.data)) {
          setTasks(res.data);
        }
      })
      .catch((err) => console.error('Fetch error:', err));

    fetchUserModules();

    socket.connect();
    socket.emit('join_room', { role: 'admin' });

    socket.on('task_assigned', (newTask) => {
      if (!newTask) return;
      setTasks((prev) => (prev.some((t) => t.id === newTask.id) ? prev : [...prev, newTask]));
      fetchUserModules();
    });

    socket.on('status_updated', (updatedTask) => {
      if (!updatedTask) return;
      setTasks((prev) =>
        prev.map((t) => (t.id === updatedTask.id ? updatedTask : t))
      );
      fetchUserModules();
    });

    socket.on('user_modules_updated', () => {
      fetchUserModules();
    });

    return () => {
      socket.off('task_assigned');
      socket.off('status_updated');
      socket.off('user_modules_updated');
      socket.disconnect();
    };
  }, []);

  const handleAssignTask = async (e) => {
    e.preventDefault();
    if (!assignedTo || !title) return;

    try {
      await axios.post(`${API_BASE_URL}/tasks`, {
        assignedTo,
        title,
        description,
      });
      setAssignedTo('');
      setTitle('');
      setDescription('');
    } catch (err) {
      alert('Failed to assign task. Make sure tasks.xlsx is closed.');
    }
  };

  const handleUpdateCredentials = async (e) => {
    e.preventDefault();
    setSettingsMsg({ type: '', text: '' });

    if (!currentPassword) {
      setSettingsMsg({ type: 'error', text: 'Please enter your current password to authorize changes.' });
      return;
    }

    if (newPassword && newPassword.length < 6) {
      setSettingsMsg({ type: 'error', text: 'New password must be at least 6 characters long.' });
      return;
    }

    if (newPassword && newPassword !== confirmPassword) {
      setSettingsMsg({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }

    setIsUpdatingCredentials(true);
    try {
      const res = await axios.patch(`${API_BASE_URL}/admin/credentials`, {
        currentEmail: adminUser?.email || 'admin@company.com',
        name: adminName,
        newEmail: adminEmail,
        currentPassword,
        newPassword: newPassword || undefined,
      });

      setSettingsMsg({ type: 'success', text: 'Admin credentials updated successfully in tasks.xlsx!' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      if (onUpdateAdmin) {
        onUpdateAdmin(res.data);
      }
    } catch (err) {
      setSettingsMsg({
        type: 'error',
        text: err.response?.data?.error || 'Failed to update admin credentials',
      });
    } finally {
      setIsUpdatingCredentials(false);
    }
  };

  const completedCount = tasks.filter((t) => t?.status === 'Completed').length;
  const inProgressCount = tasks.filter((t) => t?.status === 'In Progress').length;
  const pendingCount = tasks.filter((t) => (t?.status || 'Pending') === 'Pending').length;
  const completionRate = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  const visibleTasks = tasks.filter((t) => {
    if (!t) return false;
    const status = t.status || 'Pending';
    const user = (t.assignedTo || '').toLowerCase();
    const taskTitle = (t.title || '').toLowerCase();
    const query = searchQuery.toLowerCase();

    const matchesStatus = filterStatus === 'All' || status === filterStatus;
    const filterLower = selectedUserFilter.toLowerCase();
    const assignedLower = user;
    const assignedEmailLower = (t.assignedToEmail || '').toLowerCase();
    const matchesUser =
      selectedUserFilter === 'All' ||
      assignedLower === filterLower ||
      assignedEmailLower === filterLower;

    const matchesSearch =
      user.includes(query) ||
      taskTitle.includes(query) ||
      assignedEmailLower.includes(query);
    return matchesStatus && matchesUser && matchesSearch;
  });

  return (
    <div className="dashboard">
      {/* Top Navbar */}
      <header className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <svg width="38" height="38" viewBox="0 0 40 40" fill="none">
            <rect width="40" height="40" rx="10" fill="#F16F28" />
            <rect x="9" y="10" width="10" height="8" rx="2" fill="#FFFFFF" />
            <rect x="9" y="22" width="10" height="8" rx="2" fill="#242158" />
            <rect x="22" y="10" width="9" height="20" rx="2" fill="#FFFFFF" />
            <path d="M24.5 19.5L26.2 21.2L29.5 17.5" stroke="#F16F28" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontWeight: 800, fontSize: '21px', color: '#242158' }}>
            Workly
          </span>
        </div>

        <div className="header-actions">
          <span className="live-indicator">● Live Sync Active</span>
          <button
            onClick={() => {
              setShowSettings(true);
              setSettingsMsg({ type: '', text: '' });
              setCurrentPassword('');
              setNewPassword('');
              setConfirmPassword('');
            }}
            className="btn-settings"
            title="Update Admin Credentials"
          >
            ⚙️ Admin Credentials
          </button>
          <button onClick={onLogout} className="btn-logout">Logout</button>
        </div>
      </header>

      {/* Navy Bento Hero Banner */}
      <div className="bento-banner">
        <div>
          <span className="banner-tag">Admin Command Center</span>
          <h2>Team Operations & Live Tracker</h2>
          <p>
            Assign tasks to team members and watch their progress notes and status
            updates appear in real time.
          </p>
          <div className="admin-profile-pill">
            👤 Logged in as: <strong>{adminUser?.name || 'System Admin'}</strong> ({adminUser?.email || 'admin@company.com'})
          </div>
        </div>

        <svg width="180" height="110" viewBox="0 0 180 110" fill="none">
          <rect x="10" y="10" width="160" height="90" rx="14" fill="#FFFFFF" />
          <rect x="24" y="24" width="60" height="10" rx="5" fill="#242158" />
          <rect x="24" y="42" width="132" height="12" rx="6" fill="#FFF2EB" />
          <rect x="24" y="42" width="95" height="12" rx="6" fill="#F16F28" />
          <rect x="24" y="64" width="132" height="12" rx="6" fill="#FFF2EB" />
          <rect x="24" y="64" width="118" height="12" rx="6" fill="#242158" />
          <circle cx="144" cy="28" r="10" fill="#F16F28" />
          <path d="M140 28L143 31L149 25" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>

      {/* Bento KPI Stats + Completion Progress */}
      <div className="stats-row">
        <div className="stat-card">
          <span>Total Tasks</span>
          <strong>{tasks.length}</strong>
        </div>
        <div className="stat-card">
          <span>Pending</span>
          <strong>{pendingCount}</strong>
        </div>
        <div className="stat-card">
          <span>In Progress</span>
          <strong>{inProgressCount}</strong>
        </div>
        <div className="stat-card">
          <span>Completion Rate</span>
          <strong>{completionRate}%</strong>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${completionRate}%` }} />
          </div>
        </div>
      </div>

      {/* =====================================================
          INDIVIDUAL USER PROGRESS MODULES
      ===================================================== */}
      <section className="user-modules-container">
        <div className="modules-header-flex">
          <div>
            <span className="banner-tag">Team Progress Analytics</span>
            <h2 className="modules-title">Individual Team Member Modules</h2>
            <p className="modules-subtitle">
              Live tracking for each member: total assigned, completed, in progress, and incomplete tasks saved in Excel.
            </p>
          </div>

          <div className="modules-search-box">
            <input
              type="text"
              placeholder="🔍 Search member name or email..."
              value={memberSearchQuery}
              onChange={(e) => setMemberSearchQuery(e.target.value)}
              className="modules-search-input"
            />
            {selectedUserFilter !== 'All' && (
              <button
                className="btn-clear-user-filter"
                onClick={() => setSelectedUserFilter('All')}
                title="Clear member filter"
              >
                Clear Filter ✕
              </button>
            )}
          </div>
        </div>

        {userModules.length === 0 ? (
          <div className="empty-modules-card">
            <div className="empty-icon">👥</div>
            <h4>No Team Members Found Yet</h4>
            <p>Team members and their working modules will automatically appear here when registered or assigned tasks.</p>
          </div>
        ) : (
          <div className="user-modules-grid">
            {userModules
              .filter((m) => {
                if (!memberSearchQuery) return true;
                const q = memberSearchQuery.toLowerCase();
                return (m.name || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q);
              })
              .map((m) => {
                const isSelected = selectedUserFilter === m.name || selectedUserFilter === m.email;
                const initials = (m.name || m.email)
                  .split(' ')
                  .map((w) => w[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2) || 'TM';

                const progressTier =
                  m.progressPercent >= 75 ? 'high' : m.progressPercent >= 35 ? 'med' : 'low';

                return (
                  <div
                    key={m.userId || m.email}
                    className={`user-module-card ${isSelected ? 'selected' : ''}`}
                  >
                    <div className="module-top">
                      <div className="member-avatar">{initials}</div>
                      <div className="member-meta">
                        <h4>{m.name}</h4>
                        <span className="member-email">{m.email}</span>
                      </div>
                      <span className={`progress-pill ${progressTier}`}>
                        {m.progressPercent}% Done
                      </span>
                    </div>

                    <div className="module-progress-bar-bg">
                      <div
                        className="module-progress-bar-fill"
                        style={{ width: `${m.progressPercent}%` }}
                      />
                    </div>

                    <div className="module-stats-grid">
                      <div className="module-stat-tile assigned">
                        <span className="stat-label">📋 Assigned</span>
                        <span className="stat-val">{m.totalAssigned}</span>
                      </div>
                      <div className="module-stat-tile completed">
                        <span className="stat-label">✅ Completed</span>
                        <span className="stat-val">{m.completedCount}</span>
                      </div>
                      <div className="module-stat-tile in-progress">
                        <span className="stat-label">⚡ In Progress</span>
                        <span className="stat-val">{m.inProgressCount}</span>
                      </div>
                      <div className="module-stat-tile incomplete">
                        <span className="stat-label">⏳ Incomplete</span>
                        <span className="stat-val">{m.incompleteCount}</span>
                      </div>
                    </div>

                    {m.latestNote ? (
                      <div className="module-latest-note">
                        <span className="note-tag">💬 Latest Note:</span>
                        <p className="note-text">"{m.latestNote}"</p>
                        <small className="note-task-ref">On: {m.latestNoteTaskTitle}</small>
                      </div>
                    ) : (
                      <div className="module-latest-note empty">
                        <small>No progress notes recorded yet</small>
                      </div>
                    )}

                    {m.proofsCount > 0 && (
                      <div className="module-proofs-tag">
                        <span className="proof-icon">📎</span>
                        <span>{m.proofsCount} Proof{m.proofsCount > 1 ? 's' : ''} Attached</span>
                        {m.latestProof && (
                          <a
                            href={m.latestProof.startsWith('/') ? `${BACKEND_URL}${m.latestProof}` : m.latestProof}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="module-proof-link"
                            title="Open latest proof of work"
                          >
                            View Latest ↗
                          </a>
                        )}
                      </div>
                    )}

                    <div className="module-actions">
                      <button
                        type="button"
                        className={`btn-module-filter ${isSelected ? 'active' : ''}`}
                        onClick={() => {
                          setSelectedUserFilter(isSelected ? 'All' : (m.name || m.email));
                          const el = document.getElementById('tasks-master-table');
                          if (el) el.scrollIntoView({ behavior: 'smooth' });
                        }}
                      >
                        {isSelected ? '✓ Showing Tasks' : '🔍 Filter Tasks'}
                      </button>
                      <button
                        type="button"
                        className="btn-module-assign"
                        onClick={() => {
                          setAssignedTo(m.name || m.email);
                          const el = document.getElementById('assign-task-form');
                          if (el) el.scrollIntoView({ behavior: 'smooth' });
                        }}
                        title={`Assign new task to ${m.name}`}
                      >
                        + Assign Task
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </section>

      {/* Assign Task Bento Card */}
      <form onSubmit={handleAssignTask} className="card form-grid" id="assign-task-form">
        <h3>+ Assign New Task</h3>
        <input
          type="text"
          list="team-names"
          placeholder="Team Member Name (e.g. Jessica Taylor)"
          value={assignedTo}
          onChange={(e) => setAssignedTo(e.target.value)}
          required
        />
        <datalist id="team-names">
          {userModules.map((m) => (
            <option key={m.userId || m.email} value={m.name}>
              {m.name} {m.username ? `(@${m.username})` : ''} — {m.email}
            </option>
          ))}
        </datalist>
        <input
          type="text"
          placeholder="Task Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <input
          type="text"
          placeholder="Instructions (Optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button type="submit" className="btn-primary">Assign Task</button>
      </form>

      {/* Filter & Search Bar + Master Table */}
      <div className="card" id="tasks-master-table">
        {selectedUserFilter !== 'All' && (
          <div className="active-user-filter-bar">
            <span>
              🔍 Showing tasks for team member: <strong>{selectedUserFilter}</strong> ({visibleTasks.length} task{visibleTasks.length !== 1 ? 's' : ''})
            </span>
            <button
              type="button"
              className="btn-clear-filter"
              onClick={() => setSelectedUserFilter('All')}
            >
              Show All Members ✕
            </button>
          </div>
        )}
        <div className="table-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
          <div className="filter-pills">
            {['All', 'Pending', 'In Progress', 'Completed'].map((status) => (
              <button
                key={status}
                type="button"
                className={filterStatus === status ? 'pill active' : 'pill'}
                onClick={() => setFilterStatus(status)}
              >
                {status}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Search user or task..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ minWidth: '220px' }}
          />
        </div>

        <table>
          <thead>
            <tr>
              <th>Assigned To</th>
              <th>Task & Instructions</th>
              <th>User Progress Note</th>
              <th>Proof of Work</th>
              <th>Status</th>
              <th>Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {visibleTasks.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: '#555282' }}>
                  No tasks match your current filter.
                </td>
              </tr>
            ) : (
              visibleTasks.map((task) => {
                const statusText = task.status || 'Pending';
                const statusKey = statusText.toLowerCase().replace(/\s+/g, '-');
                return (
                  <tr key={task.id} className={`admin-task-row row-${statusKey}`}>
                    <td><strong>{task.assignedTo}</strong></td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{task.title}</div>
                      {task.description && (
                        <div style={{ fontSize: '13px', color: '#555282', marginTop: '3px' }}>
                          {task.description}
                        </div>
                      )}
                    </td>
                    <td>
                      {task.userNote ? (
                        <span className="note-bubble">{task.userNote}</span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>No notes yet</span>
                      )}
                    </td>
                    <td>
                      {task.proofAttachment ? (
                        <a
                          href={task.proofAttachment.startsWith('/') ? `${BACKEND_URL}${task.proofAttachment}` : task.proofAttachment}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="admin-proof-badge"
                          title={`Open proof: ${task.proofAttachment}`}
                        >
                          {task.proofAttachment.startsWith('/uploads/') ? '📄 View Document ↗' : '🔗 Open Link ↗'}
                        </a>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: '13px' }}>— No proof —</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${statusText.toLowerCase().replace(' ', '-')}`}>
                        {statusText}
                      </span>
                    </td>
                    <td>{task.updatedAt || '—'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Admin Credentials Modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="admin-settings-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Company Admin Credentials</h3>
                <p>Update administrator login details saved in the master Excel store</p>
              </div>
              <button className="btn-close" onClick={() => setShowSettings(false)}>✕</button>
            </div>

            {settingsMsg.text && (
              <div className={`settings-alert ${settingsMsg.type}`}>
                {settingsMsg.type === 'success' ? '✓ ' : '⚠️ '}
                {settingsMsg.text}
              </div>
            )}

            <form onSubmit={handleUpdateCredentials} className="settings-form">
              <div className="form-group">
                <label>Admin Display Name</label>
                <input
                  type="text"
                  required
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="e.g. System Admin"
                />
              </div>

              <div className="form-group">
                <label>Admin Email (Login ID)</label>
                <input
                  type="email"
                  required
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="e.g. admin@company.com"
                />
              </div>

              <div className="form-divider">
                <span>Security Authorization</span>
              </div>

              <div className="form-group">
                <label>Current Password <span className="required-star">*</span></label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password to authorize"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>New Password (Optional)</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 6 characters"
                  />
                </div>
                <div className="form-group">
                  <label>Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setShowSettings(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-save"
                  disabled={isUpdatingCredentials}
                >
                  {isUpdatingCredentials ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
