import { useState, useEffect } from 'react';
import axios from 'axios';
import socket from '../socket';
import { API_BASE_URL, BACKEND_URL } from '../config';
import { getTaskDeadlineInfo } from '../utils/timerUtils';
import AttachmentManager from './AttachmentManager';

export default function AdminDashboard({ adminUser, onUpdateAdmin, onLogout }) {
  // Navigation State
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'attendance' | 'directory' | 'allocation' | 'submissions'

  // Task & Dashboard State
  const [tasks, setTasks] = useState([]);
  const [assignedTo, setAssignedTo] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [adminDocAttachment, setAdminDocAttachment] = useState('');
  const [adminDocFileName, setAdminDocFileName] = useState('');
  const [adminDocFile, setAdminDocFile] = useState(null);
  const [attachmentModalTask, setAttachmentModalTask] = useState(null);
  const [isUploadingAdminDoc, setIsUploadingAdminDoc] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [filterStatus, setFilterStatus] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // User Modules & Employee Directory State
  const [userModules, setUserModules] = useState([]);
  const [selectedUserFilter, setSelectedUserFilter] = useState('All');
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('All'); // 'All' | 'IT' | 'HRD' | 'Marketing'
  const [allocationDept, setAllocationDept] = useState('All');

  // Add Employee Modal State
  const [showAddEmpModal, setShowAddEmpModal] = useState(false);
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpPosition, setNewEmpPosition] = useState('');
  const [newEmpJoiningDate, setNewEmpJoiningDate] = useState(new Date().toISOString().split('T')[0]);
  const [newEmpContact, setNewEmpContact] = useState('');
  const [newEmpResume, setNewEmpResume] = useState('');
  const [resumeFileName, setResumeFileName] = useState('');
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  const [newEmpUsername, setNewEmpUsername] = useState('');
  const [newEmpEmail, setNewEmpEmail] = useState('');
  const [newEmpPassword, setNewEmpPassword] = useState('');
  const [newEmpDept, setNewEmpDept] = useState('IT');
  const [isAddingEmp, setIsAddingEmp] = useState(false);
  const [empModalMsg, setEmpModalMsg] = useState({ type: '', text: '' });

  // Attendance Logs State
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [attendanceSearch, setAttendanceSearch] = useState('');
  const [attendanceDeptFilter, setAttendanceDeptFilter] = useState('All');

  // Work Submissions State
  const [submissionFilter, setSubmissionFilter] = useState('All');
  const [submissionSearch, setSubmissionSearch] = useState('');

  // Admin Credentials Modal State
  const [showSettings, setShowSettings] = useState(false);
  const [adminName, setAdminName] = useState(adminUser?.name || 'System Admin');
  const [adminEmail, setAdminEmail] = useState(adminUser?.email || 'admin@company.com');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [settingsMsg, setSettingsMsg] = useState({ type: '', text: '' });
  const [isUpdatingCredentials, setIsUpdatingCredentials] = useState(false);

  // Feedback State
  const [feedbackEditingTaskId, setFeedbackEditingTaskId] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  const handleOpenFeedback = (task) => {
    setFeedbackEditingTaskId(task.id);
    setFeedbackText(task.adminFeedback || '');
  };

  const handleSaveFeedback = async (taskId) => {
    try {
      setSubmittingFeedback(true);
      await axios.patch(`${API_BASE_URL}/tasks/${taskId}`, {
        adminFeedback: feedbackText,
      });

      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, adminFeedback: feedbackText } : t))
      );
      setFeedbackEditingTaskId(null);
      setFeedbackText('');
      fetchUserModules();
      fetchAttendanceLogs();
    } catch (err) {
      console.error('Failed to save feedback:', err);
      alert('Failed to save feedback.');
    } finally {
      setSubmittingFeedback(false);
    }
  };

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

  const fetchAttendanceLogs = () => {
    axios
      .get(`${API_BASE_URL}/admin/attendance`)
      .then((res) => {
        if (Array.isArray(res.data)) {
          setAttendanceLogs(res.data);
        }
      })
      .catch((err) => console.error('Error fetching attendance logs:', err));
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
    fetchAttendanceLogs();

    socket.connect();
    socket.emit('join_room', { role: 'admin' });

    socket.on('task_assigned', (newTask) => {
      if (!newTask) return;
      setTasks((prev) => (prev.some((t) => t.id === newTask.id) ? prev : [...prev, newTask]));
      fetchUserModules();
      fetchAttendanceLogs();
    });

    socket.on('status_updated', (updatedTask) => {
      if (!updatedTask) return;
      setTasks((prev) =>
        prev.map((t) => (t.id === updatedTask.id ? updatedTask : t))
      );
      fetchUserModules();
      fetchAttendanceLogs();
    });

    socket.on('user_modules_updated', () => {
      fetchUserModules();
      fetchAttendanceLogs();
    });

    return () => {
      socket.off('task_assigned');
      socket.off('status_updated');
      socket.off('user_modules_updated');
      socket.disconnect();
    };
  }, []);

  // Live timer tick every second for real-time countdowns
  useEffect(() => {
    const timerInterval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timerInterval);
  }, []);

  const setQuickDeadline = (minutes) => {
    const target = new Date(Date.now() + minutes * 60 * 1000);
    const offset = target.getTimezoneOffset() * 60000;
    const localIso = new Date(target.getTime() - offset).toISOString().slice(0, 16);
    setDeadline(localIso);
  };

  const handleAdminDocUpload = (file) => {
    if (!file) return;
    setAdminDocFile(file);
    setAdminDocFileName(file.name);
    setAdminDocAttachment(file.name);
  };

  const handleAssignTask = async (e) => {
    e.preventDefault();
    if (!assignedTo || !title) return;

    try {
      const res = await axios.post(`${API_BASE_URL}/tasks`, {
        assignedTo,
        title,
        description,
        deadline: deadline ? new Date(deadline).toISOString() : '',
        adminAttachment: adminDocAttachment.trim(),
      });

      // If a document was attached by admin, upload directly to Google Drive
      if (adminDocFile && res.data?.id) {
        try {
          const formData = new FormData();
          formData.append('file', adminDocFile);
          formData.append('taskId', res.data.id);
          formData.append('uploadDirection', 'Admin_to_User');
          formData.append('uploadedBy', adminUser?.name || 'Administrator');
          formData.append('uploadedRole', 'admin');
          formData.append('description', 'Initial project brief and reference document');

          await axios.post(`${API_BASE_URL}/attachments/upload`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch (uploadErr) {
          console.error('Failed to upload task attachment to Google Drive:', uploadErr);
        }
      }

      setAssignedTo('');
      setTitle('');
      setDescription('');
      setDeadline('');
      setAdminDocAttachment('');
      setAdminDocFileName('');
      setAdminDocFile(null);
      alert('Task successfully allocated to team member with attached brief.');
    } catch (err) {
      alert('Failed to assign task. Make sure tasks.xlsx is closed.');
    }
  };

  const handleResumeUpload = (file) => {
    if (!file) return;
    setIsUploadingResume(true);
    setEmpModalMsg({ type: '', text: '' });
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const fileData = reader.result;
        const res = await axios.post(`${API_BASE_URL}/upload`, {
          fileName: file.name,
          fileData,
        });
        setNewEmpResume(res.data.url);
        setResumeFileName(file.name);
        setEmpModalMsg({ type: 'success', text: `Resume document uploaded: ${file.name}` });
      } catch (err) {
        console.error('Resume upload error:', err);
        setEmpModalMsg({ type: 'error', text: 'Failed to upload resume document.' });
      } finally {
        setIsUploadingResume(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddEmployee = async (e) => {
    e.preventDefault();
    setEmpModalMsg({ type: '', text: '' });
    if (!newEmpName || !newEmpEmail || !newEmpPassword) {
      setEmpModalMsg({ type: 'error', text: 'Please fill out employee name, email, and password.' });
      return;
    }

    try {
      setIsAddingEmp(true);
      await axios.post(`${API_BASE_URL}/admin/employees`, {
        name: newEmpName.trim(),
        username: newEmpUsername.trim() || newEmpName.trim().toLowerCase().replace(/\s+/g, '_'),
        email: newEmpEmail.trim().toLowerCase(),
        password: newEmpPassword,
        department: newEmpDept,
        position: newEmpPosition.trim() || (newEmpDept === 'IT' ? 'Software Engineer' : newEmpDept === 'HRD' ? 'HR Specialist' : 'Marketing Associate'),
        joiningDate: newEmpJoiningDate || new Date().toISOString().split('T')[0],
        contactNumber: newEmpContact.trim(),
        resume: newEmpResume.trim(),
      });

      setEmpModalMsg({ type: 'success', text: `Successfully added ${newEmpName} (${newEmpPosition.trim() || 'Specialist'}) to ${newEmpDept} Department.` });
      setTimeout(() => {
        setShowAddEmpModal(false);
        setNewEmpName('');
        setNewEmpPosition('');
        setNewEmpJoiningDate(new Date().toISOString().split('T')[0]);
        setNewEmpContact('');
        setNewEmpResume('');
        setResumeFileName('');
        setNewEmpUsername('');
        setNewEmpEmail('');
        setNewEmpPassword('');
        setEmpModalMsg({ type: '', text: '' });
        fetchUserModules();
        fetchAttendanceLogs();
      }, 1200);
    } catch (err) {
      setEmpModalMsg({ type: 'error', text: err.response?.data?.error || 'Failed to add employee.' });
    } finally {
      setIsAddingEmp(false);
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

  // Status Metrics
  const completedCount = tasks.filter((t) => t?.status === 'Completed').length;
  const inProgressCount = tasks.filter((t) => t?.status === 'In Progress').length;
  const pendingCount = tasks.filter((t) => (t?.status || 'Pending') === 'Pending').length;
  const completionRate = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  // Submissions count (tasks with proofs or notes)
  const submissionsList = tasks.filter((t) => (t.proofAttachment && t.proofAttachment.trim()) || (t.userNote && t.userNote.trim()));

  // Visible Tasks filter for Dashboard table
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
    <div className="admin-formal-layout">
      {/* =====================================================
          1. LEFT NAVIGATION SIDEBAR
      ===================================================== */}
      <aside className="admin-sidebar">
        <div className="admin-sidebar-top">
          {/* Brand Logo Header */}
          <div className="admin-sidebar-brand">
            <svg width="36" height="36" viewBox="0 0 40 40" fill="none">
              <rect width="40" height="40" rx="10" fill="#F16F28" />
              <rect x="9" y="10" width="10" height="8" rx="2" fill="#FFFFFF" />
              <rect x="9" y="22" width="10" height="8" rx="2" fill="#242158" />
              <rect x="22" y="10" width="9" height="20" rx="2" fill="#FFFFFF" />
              <path d="M24.5 19.5L26.2 21.2L29.5 17.5" stroke="#F16F28" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="brand-text-block">
              <span className="brand-title">Workly</span>
              <span className="brand-badge">Enterprise Admin</span>
            </div>
          </div>

          {/* Navigation Menu */}
          <nav className="admin-sidebar-nav">
            <button
              type="button"
              className={`sidebar-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <span className="nav-label">Dashboard</span>
              <span className="nav-badge">{tasks.length}</span>
            </button>

            <button
              type="button"
              className={`sidebar-nav-item ${activeTab === 'attendance' ? 'active' : ''}`}
              onClick={() => setActiveTab('attendance')}
            >
              <span className="nav-label">Attendance Logs</span>
              <span className="nav-badge live">Live</span>
            </button>

            <button
              type="button"
              className={`sidebar-nav-item ${activeTab === 'directory' ? 'active' : ''}`}
              onClick={() => setActiveTab('directory')}
            >
              <span className="nav-label">Employee Directory</span>
              <span className="nav-badge">{userModules.length}</span>
            </button>

            <button
              type="button"
              className={`sidebar-nav-item ${activeTab === 'allocation' ? 'active' : ''}`}
              onClick={() => setActiveTab('allocation')}
            >
              <span className="nav-label">Task Allocation</span>
            </button>

            <button
              type="button"
              className={`sidebar-nav-item ${activeTab === 'submissions' ? 'active' : ''}`}
              onClick={() => setActiveTab('submissions')}
            >
              <span className="nav-label">Work Submissions</span>
              {submissionsList.length > 0 && (
                <span className="nav-badge orange">{submissionsList.length}</span>
              )}
            </button>
          </nav>
        </div>

        {/* Sidebar Footer User & Controls */}
        <div className="admin-sidebar-footer">
          <div className="sidebar-admin-user">
            <div className="admin-avatar-chip">
              {adminName.slice(0, 2).toUpperCase() || 'AD'}
            </div>
            <div className="admin-user-details">
              <span className="admin-user-name">{adminName}</span>
              <span className="admin-user-email">{adminEmail}</span>
            </div>
          </div>

          <div className="sidebar-footer-buttons">
            <button
              type="button"
              className="btn-sidebar-gear"
              onClick={() => setShowSettings(true)}
              title="Change Password & Admin Settings"
            >
              Settings
            </button>
            <button
              type="button"
              className="btn-sidebar-signout"
              onClick={onLogout}
              title="Logout from Workspace"
            >
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* =====================================================
          2. MAIN CONTENT VIEWPORT
      ===================================================== */}
      <main className="admin-main-viewport">
        {/* Top Navbar */}
        <header className="formal-topbar">
          <div className="topbar-left">
            <h1 className="topbar-page-title">
              {activeTab === 'dashboard' && 'Operations Dashboard'}
              {activeTab === 'attendance' && 'Employee Attendance & Activity Logs'}
              {activeTab === 'directory' && 'Enterprise Employee Directory'}
              {activeTab === 'allocation' && 'Task Allocation & Assignment'}
              {activeTab === 'submissions' && 'Employee Work Submissions & Proofs'}
            </h1>
            <span className="topbar-breadcrumb">
              Workly Enterprise / {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
            </span>
          </div>

          <div className="topbar-right">
            <span className="live-pill-tag">Live Sync Active</span>
            <button
              type="button"
              className="btn-topbar-action"
              onClick={() => {
                if (activeTab === 'directory') setShowAddEmpModal(true);
                else setActiveTab('allocation');
              }}
            >
              {activeTab === 'directory' ? '+ Add Employee' : '+ Allocate Task'}
            </button>
          </div>
        </header>

        {/* ---------------------------------------------------
            VIEW A: DASHBOARD VIEW
        ---------------------------------------------------- */}
        {activeTab === 'dashboard' && (
          <div className="formal-view-container">
            {/* Bento Banner */}
            <div className="bento-banner">
              <div>
                <span className="banner-tag">Operations Overview</span>
                <h2>Executive Command Center</h2>
                <p>
                  Real-time status tracking, employee task allocations, countdown timer monitoring, and instant deliverable evaluations.
                </p>
                <div className="admin-profile-pill">
                  Logged in as: <strong>{adminName}</strong> ({adminEmail})
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

            {/* Bento KPI Overall Status Cards */}
            <div className="admin-overall-stats-grid">
              <div className="admin-stat-card card-total">
                <div className="stat-card-header">
                  <span className="stat-card-label">Total Assigned</span>
                </div>
                <strong className="stat-card-value">{tasks.length}</strong>
                <span className="stat-card-hint">All tasks created</span>
              </div>

              <div className="admin-stat-card card-pending">
                <div className="stat-card-header">
                  <span className="stat-card-label">Pending</span>
                </div>
                <strong className="stat-card-value">{pendingCount}</strong>
                <span className="stat-card-hint">Awaiting start</span>
              </div>

              <div className="admin-stat-card card-in-progress">
                <div className="stat-card-header">
                  <span className="stat-card-label">In Progress</span>
                </div>
                <strong className="stat-card-value">{inProgressCount}</strong>
                <span className="stat-card-hint">Actively working</span>
              </div>

              <div className="admin-stat-card card-completed">
                <div className="stat-card-header">
                  <span className="stat-card-label">Completed</span>
                </div>
                <strong className="stat-card-value">{completedCount}</strong>
                <span className="stat-card-hint">Finished tasks</span>
              </div>
            </div>

            {/* Overall Tasks Master Table */}
            <div className="card" id="tasks-master-table">
              <div className="table-header-flex">
                <div>
                  <h3 className="section-card-title">Overall Task Details & Deadlines</h3>
                  <p className="section-card-subtitle">
                    Live tracking of deliverables, timer limits, submitted proofs, and supervisor feedback.
                  </p>
                </div>

                <div className="filter-controls-row">
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
                    className="formal-search-input"
                  />
                </div>
              </div>

              <div className="table-wrapper">
                <table className="admin-master-table">
                  <thead>
                    <tr>
                      <th className="th-assigned">Assigned To</th>
                      <th className="th-task">Task & Instructions</th>
                      <th className="th-deadline">Deadline & Timer</th>
                      <th className="th-note">User Progress Note</th>
                      <th className="th-proof">Proof of Work</th>
                      <th className="th-feedback">Admin Feedback</th>
                      <th className="th-status">Status</th>
                      <th className="th-updated">Last Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTasks.length === 0 ? (
                      <tr>
                        <td colSpan="8" style={{ textAlign: 'center', padding: '36px', color: '#555282' }}>
                          No tasks match your current filter or no tasks assigned yet.
                        </td>
                      </tr>
                    ) : (
                      visibleTasks.map((task) => {
                        const statusText = task.status || 'Pending';
                        const statusKey = statusText.toLowerCase().replace(/\s+/g, '-');
                        const timerInfo = getTaskDeadlineInfo(task, currentTime);

                        return (
                          <tr key={task.id} className={`admin-task-row row-${statusKey} ${timerInfo.rowClass}`}>
                            <td className="td-assigned"><strong>{task.assignedTo}</strong></td>
                            <td className="td-task">
                              <div style={{ fontWeight: 700 }}>{task.title}</div>
                              {task.description && !task.description.toLowerCase().includes('review formal guidelines') && (
                                <div style={{ fontSize: '13px', color: '#555282', marginTop: '3px' }}>
                                  {task.description}
                                </div>
                              )}
                              {task.adminAttachment && (
                                <div style={{ marginTop: '6px' }}>
                                  <a
                                    href={task.adminAttachment.startsWith('/') ? `${BACKEND_URL}${task.adminAttachment}` : task.adminAttachment}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="admin-shared-doc-link"
                                    title="View document shared with employee"
                                  >
                                    View Shared Document ↗
                                  </a>
                                </div>
                              )}
                            </td>
                            <td className={`deadline-col-cell ${timerInfo.colClass}`}>
                              <div className={`deadline-timer-badge ${timerInfo.badgeClass}`}>
                                <div className="timer-main-badge">{timerInfo.primaryText}</div>
                                {timerInfo.secondaryText && (
                                  <div className="timer-sub-text">{timerInfo.secondaryText}</div>
                                )}
                              </div>
                            </td>
                            <td className="td-note">
                              {task.userNote ? (
                                <span className="note-bubble">{task.userNote}</span>
                              ) : (
                                <span style={{ color: '#94a3b8' }}>No notes yet</span>
                              )}
                            </td>
                            <td className="td-proof">
                              {task.proofAttachment ? (
                                <a
                                  href={task.proofAttachment.startsWith('/') ? `${BACKEND_URL}${task.proofAttachment}` : task.proofAttachment}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="admin-proof-badge"
                                  title={`Open proof: ${task.proofAttachment}`}
                                >
                                  {task.proofAttachment.startsWith('/uploads/') ? 'View Document ↗' : 'Open Link ↗'}
                                </a>
                              ) : (
                                <span style={{ color: '#94a3b8', fontSize: '13px' }}>— No proof —</span>
                              )}
                              <div style={{ marginTop: '6px' }}>
                                <button
                                  type="button"
                                  className="btn-admin-manage-att"
                                  onClick={() => setAttachmentModalTask(task)}
                                  title="View or upload Drive files & deliverables for this task"
                                >
                                  Drive Files
                                </button>
                              </div>
                            </td>
                            <td className="td-feedback">
                              {feedbackEditingTaskId === task.id ? (
                                <div className="feedback-edit-cell">
                                  <textarea
                                    className="feedback-inline-textarea"
                                    placeholder="Write guidance or review notes for user..."
                                    value={feedbackText}
                                    onChange={(e) => setFeedbackText(e.target.value)}
                                    rows={2}
                                    autoFocus
                                  />
                                  <div className="feedback-edit-actions">
                                    <button
                                      type="button"
                                      className="btn-feedback-save"
                                      disabled={submittingFeedback}
                                      onClick={() => handleSaveFeedback(task.id)}
                                    >
                                      {submittingFeedback ? 'Saving...' : 'Save Feedback'}
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-feedback-cancel"
                                      onClick={() => setFeedbackEditingTaskId(null)}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : task.adminFeedback ? (
                                <div className="admin-feedback-display">
                                  <span className="feedback-quote-text" title={task.adminFeedback}>
                                    "{task.adminFeedback}"
                                  </span>
                                  <button
                                    type="button"
                                    className="btn-feedback-edit"
                                    title="Edit feedback"
                                    onClick={() => handleOpenFeedback(task)}
                                  >
                                    Edit
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  className="btn-give-feedback"
                                  onClick={() => handleOpenFeedback(task)}
                                >
                                  + Give Feedback
                                </button>
                              )}
                            </td>
                            <td className="td-status status-cell">
                              <span className={`badge ${statusText.toLowerCase().replace(' ', '-')}`}>
                                {statusText}
                              </span>
                            </td>
                            <td className="td-updated">{task.updatedAt || '—'}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ---------------------------------------------------
            VIEW B: ATTENDANCE LOGS VIEW
        ---------------------------------------------------- */}
        {activeTab === 'attendance' && (
          <div className="formal-view-container">
            {/* Attendance KPI Summary */}
            <div className="attendance-kpi-row">
              <div className="att-kpi-card">
                <span className="att-kpi-label">Active Staff Monitored</span>
                <strong className="att-kpi-value">{attendanceLogs.length}</strong>
                <span className="att-kpi-sub">100% Present Today</span>
              </div>
              <div className="att-kpi-card green">
                <span className="att-kpi-label">Attendance Rate</span>
                <strong className="att-kpi-value">100%</strong>
                <span className="att-kpi-sub">All checked in</span>
              </div>
              <div className="att-kpi-card orange">
                <span className="att-kpi-label">Active Work Engagement</span>
                <strong className="att-kpi-value">
                  {attendanceLogs.filter((a) => a.inProgressCount > 0 || a.totalAssigned > 0).length} Members
                </strong>
                <span className="att-kpi-sub">On current deliverables</span>
              </div>
            </div>

            {/* Attendance Table Card */}
            <div className="card">
              <div className="table-header-flex">
                <div>
                  <h3 className="section-card-title">Employee Attendance & Activity Log</h3>
                  <p className="section-card-subtitle">
                    Real-time operational status, daily check-in time, and delivery pace.
                  </p>
                </div>

                <div className="filter-controls-row">
                  <div className="filter-pills">
                    {['All', 'IT', 'HRD', 'Marketing'].map((dept) => (
                      <button
                        key={dept}
                        type="button"
                        className={attendanceDeptFilter === dept ? 'pill active' : 'pill'}
                        onClick={() => setAttendanceDeptFilter(dept)}
                      >
                        {dept === 'All' ? 'All Depts' : dept}
                      </button>
                    ))}
                  </div>

                  <input
                    type="text"
                    placeholder="Search employee name..."
                    value={attendanceSearch}
                    onChange={(e) => setAttendanceSearch(e.target.value)}
                    className="formal-search-input"
                  />
                </div>
              </div>

              <div className="table-wrapper">
                <table className="admin-master-table">
                  <thead>
                    <tr>
                      <th>Employee Profile</th>
                      <th>Department</th>
                      <th>Attendance Status</th>
                      <th>Check-in Time</th>
                      <th>Current Work Status</th>
                      <th>Tasks Velocity</th>
                      <th>Last Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceLogs
                      .filter((emp) => {
                        const matchesDept = attendanceDeptFilter === 'All' || emp.department === attendanceDeptFilter;
                        const matchesSearch = !attendanceSearch || emp.name.toLowerCase().includes(attendanceSearch.toLowerCase());
                        return matchesDept && matchesSearch;
                      })
                      .map((emp) => (
                        <tr key={emp.userId}>
                          <td>
                            <div className="att-profile-cell">
                              <div className="att-avatar">
                                {emp.name.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <strong className="att-emp-name">{emp.name}</strong>
                                <span className="att-emp-email">@{emp.username} • {emp.email}</span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`dept-badge ${emp.department.toLowerCase()}`}>
                              {emp.department}
                            </span>
                          </td>
                          <td>
                            <span className="attendance-pill present">
                              <span className="dot" /> Present
                            </span>
                          </td>
                          <td>
                            <span className="checkin-time-text">{emp.checkInTime}</span>
                          </td>
                          <td>
                            <span className={`work-status-badge ${emp.inProgressCount > 0 ? 'working' : 'ready'}`}>
                              {emp.workStatus}
                            </span>
                          </td>
                          <td>
                            <div className="velocity-cell">
                              <span>{emp.completedCount} / {emp.totalAssigned} done</span>
                              <div className="mini-progress-bar">
                                <div
                                  className="mini-progress-fill"
                                  style={{ width: `${emp.completionRate}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="last-active-text">{emp.lastActive}</span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ---------------------------------------------------
            VIEW C: EMPLOYEE DIRECTORY VIEW
        ---------------------------------------------------- */}
        {activeTab === 'directory' && (
          <div className="formal-view-container">
            {/* Department Metric Cards */}
            <div className="dept-summary-row">
              <div
                className={`dept-summary-card it ${selectedDept === 'IT' ? 'active' : ''}`}
                onClick={() => setSelectedDept(selectedDept === 'IT' ? 'All' : 'IT')}
              >
                <div className="dept-card-top">
                  <span className="dept-tag">IT Department</span>
                </div>
                <h3>Information Technology</h3>
                <p>Software development, bug fixes, architecture & infrastructure</p>
                <div className="dept-card-stats">
                  <span>{userModules.filter((m) => (m.department || 'IT') === 'IT').length} Members</span>
                  <span>•</span>
                  <span>{userModules.filter((m) => (m.department || 'IT') === 'IT').reduce((acc, m) => acc + m.totalAssigned, 0)} Tasks</span>
                </div>
              </div>

              <div
                className={`dept-summary-card hrd ${selectedDept === 'HRD' ? 'active' : ''}`}
                onClick={() => setSelectedDept(selectedDept === 'HRD' ? 'All' : 'HRD')}
              >
                <div className="dept-card-top">
                  <span className="dept-tag">HRD Department</span>
                </div>
                <h3>Human Resource Dev</h3>
                <p>Talent management, compliance, onboarding & team performance</p>
                <div className="dept-card-stats">
                  <span>{userModules.filter((m) => m.department === 'HRD').length} Members</span>
                  <span>•</span>
                  <span>{userModules.filter((m) => m.department === 'HRD').reduce((acc, m) => acc + m.totalAssigned, 0)} Tasks</span>
                </div>
              </div>

              <div
                className={`dept-summary-card mkt ${selectedDept === 'Marketing' ? 'active' : ''}`}
                onClick={() => setSelectedDept(selectedDept === 'Marketing' ? 'All' : 'Marketing')}
              >
                <div className="dept-card-top">
                  <span className="dept-tag">Marketing Department</span>
                </div>
                <h3>Marketing & Growth</h3>
                <p>Brand visibility, campaigns, digital outreach & client proposals</p>
                <div className="dept-card-stats">
                  <span>{userModules.filter((m) => m.department === 'Marketing').length} Members</span>
                  <span>•</span>
                  <span>{userModules.filter((m) => m.department === 'Marketing').reduce((acc, m) => acc + m.totalAssigned, 0)} Tasks</span>
                </div>
              </div>
            </div>

            {/* Department Filter & Action Bar */}
            <div className="directory-action-bar">
              <div className="filter-pills">
                {['All', 'IT', 'HRD', 'Marketing'].map((dept) => (
                  <button
                    key={dept}
                    type="button"
                    className={selectedDept === dept ? 'pill active' : 'pill'}
                    onClick={() => setSelectedDept(dept)}
                  >
                    {dept === 'All' ? 'All Departments' : `${dept} Dept`}
                  </button>
                ))}
              </div>

              <div className="dir-search-wrap">
                <input
                  type="text"
                  placeholder="Search directory by name or email..."
                  value={memberSearchQuery}
                  onChange={(e) => setMemberSearchQuery(e.target.value)}
                  className="formal-search-input"
                />
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setShowAddEmpModal(true)}
                >
                  + Add New Employee
                </button>
              </div>
            </div>

            {/* Employee Directory Cards Grid */}
            <div className="user-modules-grid">
              {userModules
                .filter((m) => {
                  const mDept = m.department || 'IT';
                  const matchesDept = selectedDept === 'All' || mDept === selectedDept;
                  const q = memberSearchQuery.toLowerCase();
                  const matchesQuery = !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
                  return matchesDept && matchesQuery;
                })
                .map((m) => {
                  const dept = m.department || 'IT';
                  const initials = m.name.slice(0, 2).toUpperCase();

                  return (
                    <div key={m.userId || m.email} className="user-module-card employee-directory-card">
                      <div className="module-top">
                        <div className="member-avatar">{initials}</div>
                        <div className="member-meta">
                          <h4>{m.name}</h4>
                          <span className="member-email">@{m.username}</span>
                          <span className={`dept-badge ${dept.toLowerCase()}`}>{dept}</span>
                        </div>
                      </div>

                      {/* Employee Profile Details */}
                      <div className="emp-card-details">
                        <div className="emp-detail-row">
                          <span className="emp-detail-label">Position:</span>
                          <span className="emp-detail-value emp-position-badge">
                            {m.position || (dept === 'IT' ? 'Software Engineer' : dept === 'HRD' ? 'HR Specialist' : 'Marketing Associate')}
                          </span>
                        </div>

                        <div className="emp-detail-row">
                          <span className="emp-detail-label">Joining Date:</span>
                          <span className="emp-detail-value">{m.joiningDate || '—'}</span>
                        </div>

                        <div className="emp-detail-row">
                          <span className="emp-detail-label">Email:</span>
                          <span className="emp-detail-value emp-email-text" title={m.email}>{m.email}</span>
                        </div>

                        <div className="emp-detail-row">
                          <span className="emp-detail-label">Contact:</span>
                          <span className="emp-detail-value">{m.contactNumber || '—'}</span>
                        </div>

                        <div className="emp-detail-row resume-row">
                          <span className="emp-detail-label">Resume:</span>
                          {m.resume ? (
                            <a
                              href={m.resume.startsWith('/') ? `${BACKEND_URL}${m.resume}` : m.resume}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="emp-resume-link"
                              title="Click to view full employee resume"
                            >
                              View Resume ↗
                            </a>
                          ) : (
                            <span className="emp-no-resume">— No resume —</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* ---------------------------------------------------
            VIEW D: TASK ALLOCATION VIEW
        ---------------------------------------------------- */}
        {activeTab === 'allocation' && (
          <div className="formal-view-container">
            <div className="card allocation-card">
              <div className="form-title-row">
                <div>
                  <h3 className="section-card-title">Task Allocation Center</h3>
                  <p className="section-card-subtitle">
                    Assign deliverables with precision, choose team members by department, share briefs, and enforce live countdown deadline timers.
                  </p>
                </div>
                <span className="assign-timer-hint">Timer activates on assignment</span>
              </div>

              <form onSubmit={handleAssignTask} className="allocation-form-grid">
                <div className="form-row-duo">
                  <div className="input-group">
                    <label>Filter By Department (Optional)</label>
                    <select
                      value={allocationDept}
                      onChange={(e) => setAllocationDept(e.target.value)}
                      className="formal-select"
                    >
                      <option value="All">All Departments</option>
                      <option value="IT">IT Department</option>
                      <option value="HRD">HRD Department</option>
                      <option value="Marketing">Marketing Department</option>
                    </select>
                  </div>

                  <div className="input-group">
                    <label>Team Member Name <span style={{ color: '#EF4444' }}>*</span></label>
                    <input
                      type="text"
                      list="allocation-team-names"
                      placeholder="Type or select member (e.g. Jessica Taylor)"
                      value={assignedTo}
                      onChange={(e) => setAssignedTo(e.target.value)}
                      required
                      className="formal-input"
                    />
                    <datalist id="allocation-team-names">
                      {userModules
                        .filter((m) => allocationDept === 'All' || (m.department || 'IT') === allocationDept)
                        .map((m) => (
                          <option key={m.userId || m.email} value={m.name}>
                            {m.name} (@{m.username}) — {m.department || 'IT'}
                          </option>
                        ))}
                    </datalist>
                  </div>
                </div>

                <div className="input-group">
                  <label>Deliverable Title <span style={{ color: '#EF4444' }}>*</span></label>
                  <input
                    type="text"
                    placeholder="e.g. Build Payment Gateway Integration"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    className="formal-input"
                  />
                </div>

                <div className="input-group">
                  <label>Work Instructions & Acceptance Criteria (Optional)</label>
                  <textarea
                    placeholder="Provide detailed instructions, requirements, deliverables, and expectations..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="formal-textarea"
                  />
                </div>

                {/* Share Document / Attachment */}
                <div className="input-group">
                  <label>Share Project Brief / Attachment Document (Optional)</label>
                  <div className="resume-inputs-flex">
                    <label className="btn-resume-file-picker">
                      {isUploadingAdminDoc ? 'Uploading...' : adminDocFileName ? 'Change Document' : 'Upload Document'}
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.png,.jpg,.jpeg,application/pdf"
                        onChange={(e) => handleAdminDocUpload(e.target.files[0])}
                        style={{ display: 'none' }}
                        disabled={isUploadingAdminDoc}
                      />
                    </label>
                    <span className="resume-or-divider">or URL:</span>
                    <input
                      type="text"
                      value={adminDocAttachment}
                      onChange={(e) => {
                        setAdminDocAttachment(e.target.value);
                        setAdminDocFileName('');
                      }}
                      placeholder="https://... or uploaded file path"
                      className="resume-url-input"
                    />
                  </div>
                  {adminDocAttachment && (
                    <div className="resume-attached-preview">
                      <span>Attached Document: <strong>{adminDocFileName || adminDocAttachment}</strong></span>
                      <button
                        type="button"
                        className="btn-clear-resume"
                        onClick={() => {
                          setAdminDocAttachment('');
                          setAdminDocFileName('');
                          setAdminDocFile(null);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>

                {/* Deadline & Timer */}
                <div className="deadline-form-group">
                  <div className="deadline-input-header">
                    <label className="deadline-input-label">
                      Deadline & Time Limit:
                    </label>
                    <div className="deadline-preset-buttons">
                      <span className="deadline-presets-label">Quick Set:</span>
                      <button type="button" className="btn-preset-chip" onClick={() => setQuickDeadline(30)}>+30m</button>
                      <button type="button" className="btn-preset-chip" onClick={() => setQuickDeadline(60)}>+1h</button>
                      <button type="button" className="btn-preset-chip" onClick={() => setQuickDeadline(240)}>+4h</button>
                      <button type="button" className="btn-preset-chip" onClick={() => setQuickDeadline(1440)}>+1d</button>
                      <button type="button" className="btn-preset-chip" onClick={() => setQuickDeadline(2880)}>+2d</button>
                      {deadline && (
                        <button type="button" className="btn-preset-clear" onClick={() => setDeadline('')}>Clear</button>
                      )}
                    </div>
                  </div>
                  <input
                    type="datetime-local"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="deadline-datetime-input"
                  />
                  {deadline && (
                    <small className="deadline-target-note">
                      Time limit set: <strong>{new Date(deadline).toLocaleString()}</strong>. Real-time timer starts upon allocation.
                    </small>
                  )}
                </div>

                <div className="allocation-submit-row">
                  <button type="submit" className="btn-primary allocate-submit-btn">
                    + Allocate Deliverable Now
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ---------------------------------------------------
            VIEW E: WORK SUBMISSIONS REVIEW VIEW
        ---------------------------------------------------- */}
        {activeTab === 'submissions' && (
          <div className="formal-view-container">
            <div className="card">
              <div className="table-header-flex">
                <div>
                  <h3 className="section-card-title">Employee Work Submissions & Proof of Work</h3>
                  <p className="section-card-subtitle">
                    Review submitted deliverables, inspect uploaded documents or project links, and send feedback.
                  </p>
                </div>

                <div className="filter-controls-row">
                  <div className="filter-pills">
                    {['All', 'With Documents', 'With Links', 'Feedback Given'].map((type) => (
                      <button
                        key={type}
                        type="button"
                        className={submissionFilter === type ? 'pill active' : 'pill'}
                        onClick={() => setSubmissionFilter(type)}
                      >
                        {type}
                      </button>
                    ))}
                  </div>

                  <input
                    type="text"
                    placeholder="Search submissions..."
                    value={submissionSearch}
                    onChange={(e) => setSubmissionSearch(e.target.value)}
                    className="formal-search-input"
                  />
                </div>
              </div>

              <div className="table-wrapper">
                <table className="admin-master-table">
                  <thead>
                    <tr>
                      <th>Deliverable & Member</th>
                      <th>Proof of Work (Attachment / Link)</th>
                      <th>Progress Notes</th>
                      <th>Submission Status</th>
                      <th>Deadline Compliance</th>
                      <th>Admin Feedback</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissionsList
                      .filter((t) => {
                        if (submissionFilter === 'With Documents') {
                          return t.proofAttachment && t.proofAttachment.startsWith('/uploads/');
                        }
                        if (submissionFilter === 'With Links') {
                          return t.proofAttachment && !t.proofAttachment.startsWith('/uploads/');
                        }
                        if (submissionFilter === 'Feedback Given') {
                          return t.adminFeedback && t.adminFeedback.trim().length > 0;
                        }
                        return true;
                      })
                      .filter((t) => {
                        if (!submissionSearch) return true;
                        const q = submissionSearch.toLowerCase();
                        return (
                          t.title.toLowerCase().includes(q) ||
                          t.assignedTo.toLowerCase().includes(q) ||
                          (t.userNote && t.userNote.toLowerCase().includes(q))
                        );
                      })
                      .map((task) => {
                        const timerInfo = getTaskDeadlineInfo(task, currentTime);
                        return (
                          <tr key={task.id} className={`admin-task-row ${timerInfo.rowClass}`}>
                            <td>
                              <strong className="sub-task-title">{task.title}</strong>
                              <span className="sub-task-assignee">Assigned to: <strong>{task.assignedTo}</strong></span>
                              {task.description && (
                                <p className="sub-task-desc">{task.description}</p>
                              )}
                              {task.adminAttachment && (
                                <div style={{ marginTop: '5px' }}>
                                  <a
                                    href={task.adminAttachment.startsWith('/') ? `${BACKEND_URL}${task.adminAttachment}` : task.adminAttachment}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="admin-shared-doc-link"
                                  >
                                    View Assigned Document ↗
                                  </a>
                                </div>
                              )}
                            </td>
                            <td>
                              {task.proofAttachment ? (
                                <a
                                  href={task.proofAttachment.startsWith('/') ? `${BACKEND_URL}${task.proofAttachment}` : task.proofAttachment}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="admin-proof-badge"
                                >
                                  {task.proofAttachment.startsWith('/uploads/') ? 'View Document ↗' : 'Open Link ↗'}
                                </a>
                              ) : (
                                <span style={{ color: '#94a3b8' }}>— No attachment —</span>
                              )}
                              <div style={{ marginTop: '6px' }}>
                                <button
                                  type="button"
                                  className="btn-admin-manage-att"
                                  onClick={() => setAttachmentModalTask(task)}
                                  title="Inspect deliverables in Google Drive"
                                >
                                  Drive Files
                                </button>
                              </div>
                            </td>
                            <td>
                              {task.userNote ? (
                                <span className="note-bubble">{task.userNote}</span>
                              ) : (
                                <span style={{ color: '#94a3b8' }}>— No note provided —</span>
                              )}
                            </td>
                            <td>
                              <span className={`badge ${(task.status || 'Pending').toLowerCase().replace(' ', '-')}`}>
                                {task.status || 'Pending'}
                              </span>
                            </td>
                            <td>
                              <div className={`deadline-timer-badge ${timerInfo.badgeClass}`}>
                                <div className="timer-main-badge">{timerInfo.primaryText}</div>
                                {timerInfo.secondaryText && (
                                  <div className="timer-sub-text">{timerInfo.secondaryText}</div>
                                )}
                              </div>
                            </td>
                            <td>
                              {feedbackEditingTaskId === task.id ? (
                                <div className="feedback-edit-cell">
                                  <textarea
                                    className="feedback-inline-textarea"
                                    placeholder="Write guidance or review notes for user..."
                                    value={feedbackText}
                                    onChange={(e) => setFeedbackText(e.target.value)}
                                    rows={2}
                                    autoFocus
                                  />
                                  <div className="feedback-edit-actions">
                                    <button
                                      type="button"
                                      className="btn-feedback-save"
                                      disabled={submittingFeedback}
                                      onClick={() => handleSaveFeedback(task.id)}
                                    >
                                      {submittingFeedback ? 'Saving...' : 'Save Feedback'}
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-feedback-cancel"
                                      onClick={() => setFeedbackEditingTaskId(null)}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : task.adminFeedback ? (
                                <div className="admin-feedback-display">
                                  <span className="feedback-quote-text" title={task.adminFeedback}>
                                    "{task.adminFeedback}"
                                  </span>
                                  <button
                                    type="button"
                                    className="btn-feedback-edit"
                                    title="Edit feedback"
                                    onClick={() => handleOpenFeedback(task)}
                                  >
                                    Edit
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  className="btn-give-feedback"
                                  onClick={() => handleOpenFeedback(task)}
                                >
                                  + Give Feedback
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* =====================================================
          3. ADD NEW EMPLOYEE MODAL (DEPARTMENT WISE)
      ===================================================== */}
      {showAddEmpModal && (
        <div className="modal-overlay" onClick={() => setShowAddEmpModal(false)}>
          <div className="admin-settings-card admin-add-emp-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Add New Employee</h3>
                <p>Register new staff member into enterprise department modules</p>
              </div>
              <button className="btn-close" onClick={() => setShowAddEmpModal(false)}>Cancel</button>
            </div>

            {empModalMsg.text && (
              <div className={`settings-alert ${empModalMsg.type}`}>
                {empModalMsg.text}
              </div>
            )}

            <form onSubmit={handleAddEmployee} className="settings-form">
              <div className="form-group">
                <label>Department Selection <span className="required-star">*</span></label>
                <select
                  value={newEmpDept}
                  onChange={(e) => setNewEmpDept(e.target.value)}
                  className="formal-select"
                  required
                >
                  <option value="IT">IT Department (Engineering & Tech)</option>
                  <option value="HRD">HRD Department (Human Resources)</option>
                  <option value="Marketing">Marketing Department (Sales & Growth)</option>
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Employee Full Name <span className="required-star">*</span></label>
                  <input
                    type="text"
                    required
                    value={newEmpName}
                    onChange={(e) => setNewEmpName(e.target.value)}
                    placeholder="e.g. Sanjana Medapati"
                  />
                </div>

                <div className="form-group">
                  <label>Position / Designation <span className="required-star">*</span></label>
                  <input
                    type="text"
                    required
                    value={newEmpPosition}
                    onChange={(e) => setNewEmpPosition(e.target.value)}
                    placeholder="e.g. Senior Software Engineer"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Joining Date <span className="required-star">*</span></label>
                  <input
                    type="date"
                    required
                    value={newEmpJoiningDate}
                    onChange={(e) => setNewEmpJoiningDate(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Contact Number <span className="required-star">*</span></label>
                  <input
                    type="tel"
                    required
                    value={newEmpContact}
                    onChange={(e) => setNewEmpContact(e.target.value)}
                    placeholder="e.g. +91 98765 43210"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Official Email <span className="required-star">*</span></label>
                  <input
                    type="email"
                    required
                    value={newEmpEmail}
                    onChange={(e) => setNewEmpEmail(e.target.value)}
                    placeholder="e.g. sanz@company.com"
                  />
                </div>

                <div className="form-group">
                  <label>Username (Login ID)</label>
                  <input
                    type="text"
                    value={newEmpUsername}
                    onChange={(e) => setNewEmpUsername(e.target.value)}
                    placeholder="e.g. sanzz"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Default Password <span className="required-star">*</span></label>
                <input
                  type="password"
                  required
                  value={newEmpPassword}
                  onChange={(e) => setNewEmpPassword(e.target.value)}
                  placeholder="Set initial password (min 6 chars)"
                />
              </div>

              {/* Resume Document Upload & URL */}
              <div className="form-group resume-upload-group">
                <label>Resume (PDF / DOC / Document Link)</label>
                <div className="resume-inputs-flex">
                  <label className="btn-resume-file-picker">
                    {isUploadingResume ? 'Uploading...' : resumeFileName ? 'Change Resume' : 'Upload Resume File'}
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={(e) => handleResumeUpload(e.target.files[0])}
                      style={{ display: 'none' }}
                      disabled={isUploadingResume}
                    />
                  </label>
                  <span className="resume-or-divider">or URL:</span>
                  <input
                    type="text"
                    value={newEmpResume}
                    onChange={(e) => {
                      setNewEmpResume(e.target.value);
                      setResumeFileName('');
                    }}
                    placeholder="https://... or uploaded file path"
                    className="resume-url-input"
                  />
                </div>
                {newEmpResume && (
                  <div className="resume-attached-preview">
                    <span>Attached Resume: <strong>{resumeFileName || newEmpResume}</strong></span>
                    <button
                      type="button"
                      className="btn-clear-resume"
                      onClick={() => {
                        setNewEmpResume('');
                        setResumeFileName('');
                      }}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setShowAddEmpModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-save"
                  disabled={isAddingEmp || isUploadingResume}
                >
                  {isAddingEmp ? 'Adding Employee...' : '+ Create Employee Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================
          4. ADMIN CREDENTIALS & SETTINGS MODAL
      ===================================================== */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="admin-settings-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Admin Settings & Password</h3>
                <p>Update administrator login credentials saved in tasks.xlsx</p>
              </div>
              <button className="btn-close" onClick={() => setShowSettings(false)}>Cancel</button>
            </div>

            {settingsMsg.text && (
              <div className={`settings-alert ${settingsMsg.type}`}>
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
                  {isUpdatingCredentials ? 'Saving Changes...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GOOGLE DRIVE ATTACHMENTS MODAL */}
      {attachmentModalTask && (
        <div className="modal-overlay" onClick={() => setAttachmentModalTask(null)}>
          <div className="admin-attachment-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Task Deliverables & Files</h3>
                <p>
                  Deliverable: <strong>{attachmentModalTask.title}</strong> — Assigned to: <strong>{attachmentModalTask.assignedTo}</strong> (Task #{attachmentModalTask.id})
                </p>
              </div>
              <button
                type="button"
                className="btn-modal-close"
                onClick={() => setAttachmentModalTask(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="modal-body-attachments">
              <AttachmentManager
                taskId={attachmentModalTask.id}
                currentUser={{
                  role: 'admin',
                  email: adminUser?.email || 'admin@workly.com',
                  name: adminUser?.name || 'Administrator',
                }}
                uploadDirection="Admin_to_User"
                title="Task Files & Deliverables (Google Drive)"
                canUpload={true}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
