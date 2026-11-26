
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import socket from '../socket';
import { API_BASE_URL, BACKEND_URL } from '../config';
import { getTaskDeadlineInfo } from '../utils/timerUtils';
import AttachmentManager from './AttachmentManager';

const API_URL = API_BASE_URL;

// Reusable SVG illustration
function HeroIllustration() {
  return (
    <svg
      className="user-hero-art"
      viewBox="0 0 340 240"
      role="img"
      aria-label="Task management and productivity illustration"
    >
      <circle className="art-orbit" cx="180" cy="115" r="95" />

      <circle cx="285" cy="35" r="9" fill="#F16F28" />
      <circle cx="45" cy="190" r="7" fill="#F16F28" />

      <rect x="35" y="25" width="125" height="165"
        rx="16" fill="#F16F28" />

      <rect x="48" y="40" width="99" height="135"
        rx="10" fill="#FFFFFF" />

      <rect x="62" y="55" width="70" height="8"
        rx="4" fill="#242158" />

      <rect x="62" y="80" width="13" height="13"
        rx="3" fill="#F16F28" />
      <path d="M65 86L69 90L75 82"
        stroke="#FFFFFF" strokeWidth="2" fill="none" />

      <rect x="82" y="83" width="48" height="6"
        rx="3" fill="#D8D7E5" />

      <rect x="62" y="108" width="13" height="13"
        rx="3" fill="#242158" />
      <path d="M65 114L69 118L75 110"
        stroke="#FFFFFF" strokeWidth="2" fill="none" />

      <rect x="82" y="111" width="48" height="6"
        rx="3" fill="#D8D7E5" />

      <rect x="62" y="136" width="13" height="13"
        rx="3" fill="#F16F28" />
      <rect x="82" y="139" width="48" height="6"
        rx="3" fill="#D8D7E5" />

      {/* Floating progress card */}
      <g className="art-float">
        <rect x="178" y="35" width="125" height="83"
          rx="14" fill="#FFFFFF" />

        <circle cx="207" cy="75" r="19"
          fill="none" stroke="#E9E8F0" strokeWidth="7" />

        <circle cx="207" cy="75" r="19"
          fill="none" stroke="#F16F28" strokeWidth="7"
          strokeDasharray="90 120"
          strokeLinecap="round"
          transform="rotate(-90 207 75)" />

        <text x="207" y="79" textAnchor="middle"
          fill="#242158" fontSize="11" fontWeight="bold">
          75%
        </text>

        <rect x="236" y="62" width="32" height="7"
          rx="3" fill="#242158" />
        <rect x="236" y="77" width="45" height="5"
          rx="3" fill="#D8D7E5" />
      </g>

      {/* Floating completed card */}
      <g className="art-float-delay">
        <rect x="174" y="143" width="130" height="65"
          rx="13" fill="#242158" />

        <circle cx="197" cy="175" r="14" fill="#F16F28" />

        <path d="M190 175L195 180L204 169"
          stroke="#FFFFFF" strokeWidth="2.5"
          fill="none" strokeLinecap="round"
          strokeLinejoin="round" />

        <rect x="220" y="166" width="65" height="7"
          rx="3" fill="#FFFFFF" />
        <rect x="220" y="180" width="43" height="5"
          rx="3" fill="#B7B4D5" />
      </g>

      <circle className="art-dot" cx="165" cy="18" r="5"
        fill="#F16F28" />
      <circle className="art-dot-delay" cx="320" cy="155" r="5"
        fill="#F16F28" />
    </svg>
  );
}

function EmptyIllustration() {
  return (
    <svg viewBox="0 0 180 135" width="180" height="135"
      role="img" aria-label="No tasks available illustration">
      <rect x="45" y="15" width="90" height="105"
        rx="12" fill="#F0EFF8" />
      <rect x="57" y="30" width="66" height="80"
        rx="7" fill="#FFFFFF" />
      <rect x="68" y="43" width="43" height="6"
        rx="3" fill="#242158" />
      <rect x="68" y="60" width="11" height="11"
        rx="3" fill="#F16F28" />
      <path d="M71 65L74 68L79 62"
        stroke="#FFFFFF" strokeWidth="1.8" fill="none" />
      <rect x="85" y="63" width="25" height="5"
        rx="2" fill="#D8D7E5" />
      <rect x="68" y="81" width="11" height="11"
        rx="3" fill="#D8D7E5" />
      <rect x="85" y="84" width="25" height="5"
        rx="2" fill="#D8D7E5" />
      <circle cx="137" cy="30" r="12" fill="#F16F28" />
      <path d="M132 30L136 34L143 26"
        stroke="#FFFFFF" strokeWidth="2" fill="none" />
      <circle cx="33" cy="90" r="6" fill="#F16F28" />
    </svg>
  );
}

function getTaskId(task) {
  return task.id ?? task._id;
}

function StatusBadge({ status }) {
  const value = status || 'Pending';

  return (
    <span className={`badge ${value.toLowerCase().replace(' ', '-')}`}>
      <span className="status-dot" />
      {value}
    </span>
  );
}

export default function UserDashboard({ userEmail, currentUser, onLogout }) {
  const [tasks, setTasks] = useState([]);
  const [notes, setNotes] = useState({});
  const [proofs, setProofs] = useState({});
  const [uploadingTask, setUploadingTask] = useState(null);
  const [taskFeedback, setTaskFeedback] = useState({});
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [currentView, setCurrentView] = useState('overview');
  const [filterStatus, setFilterStatus] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingTask, setSavingTask] = useState(null);

  const userName = currentUser?.name || (userEmail ? userEmail.split('@')[0] : 'User');

  // Live timer tick every second for real-time countdowns
  useEffect(() => {
    const timerInterval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timerInterval);
  }, []);

  // Fetch tasks and listen for live updates
  useEffect(() => {
    let active = true;

    if (!userEmail) {
      setError('User email is missing.');
      setLoading(false);
      return;
    }

    const fetchTasks = async () => {
      try {
        setLoading(true);
        setError('');

        const response = await axios.get(`${API_URL}/tasks`, {
          params: {
            role: 'user',
            email: userEmail
          }
        });

        if (active && Array.isArray(response.data)) {
          setTasks(response.data);
        }
      } catch (err) {
        console.error('Fetch error:', err);
        if (active) setError('Unable to load your tasks.');
      } finally {
        if (active) setLoading(false);
      }
    };

    const handleAssigned = (newTask) => {
      if (!newTask) return;

      setTasks((prev) => {
        const id = getTaskId(newTask);
        const exists = prev.some(
          (task) => String(getTaskId(task)) === String(id)
        );

        return exists
          ? prev.map((task) =>
              String(getTaskId(task)) === String(id)
                ? { ...task, ...newTask }
                : task
            )
          : [...prev, newTask];
      });
    };

    const handleUpdated = (updatedTask) => {
      if (!updatedTask) return;

      setTasks((prev) =>
        prev.map((task) =>
          String(getTaskId(task)) === String(getTaskId(updatedTask))
            ? { ...task, ...updatedTask }
            : task
        )
      );
    };

    socket.on('task_assigned', handleAssigned);
    socket.on('status_updated', handleUpdated);

    socket.connect();
    socket.emit('join_room', {
      role: 'user',
      email: userEmail
    });

    fetchTasks();

    return () => {
      active = false;
      socket.off('task_assigned', handleAssigned);
      socket.off('status_updated', handleUpdated);
      socket.disconnect();
    };
  }, [userEmail]);

  // Task statistics
  const completedCount = tasks.filter(
    (task) => task.status === 'Completed'
  ).length;

  const inProgressCount = tasks.filter(
    (task) => task.status === 'In Progress'
  ).length;

  const pendingCount = tasks.filter(
    (task) => (task.status || 'Pending') === 'Pending'
  ).length;

  const progressPercent = tasks.length
    ? Math.round((completedCount / tasks.length) * 100)
    : 0;

  const filteredTasks = filterStatus === 'All'
    ? tasks
    : tasks.filter(
        (task) => (task.status || 'Pending') === filterStatus
      );

  // Update status
  const handleStatusChange = async (taskId, newStatus) => {
    try {
      setSavingTask(taskId);

      await axios.patch(`${API_URL}/tasks/${taskId}`, {
        status: newStatus
      });

      setTasks((prev) =>
        prev.map((task) =>
          String(getTaskId(task)) === String(taskId)
            ? { ...task, status: newStatus }
            : task
        )
      );
    } catch (err) {
      console.error('Status update error:', err);
      alert('Failed to update status.');
    } finally {
      setSavingTask(null);
    }
  };

  // Save note & proof of work
  const handleFileUpload = async (taskId, file) => {
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setTaskFeedback((prev) => ({
        ...prev,
        [taskId]: { type: 'error', msg: 'File exceeds the 10 MB maximum limit.' },
      }));
      return;
    }

    setUploadingTask(taskId);
    setTaskFeedback((prev) => ({ ...prev, [taskId]: null }));

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('taskId', taskId);
      formData.append('uploadDirection', 'User_to_Admin');
      formData.append(
        'uploadedBy',
        currentUser?.name || currentUser?.username || userEmail || 'Team Member'
      );
      formData.append('uploadedRole', 'user');
      formData.append('description', 'Deliverable document');

      const res = await axios.post(`${API_BASE_URL}/attachments/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const downloadUrl = `${API_BASE_URL}/attachments/download/${res.data.attachmentId}?role=user&email=${encodeURIComponent(userEmail || '')}`;

      setProofs((prev) => ({
        ...prev,
        [taskId]: downloadUrl,
      }));

      // Update task proofAttachment in local state
      setTasks((prev) =>
        prev.map((t) =>
          String(getTaskId(t)) === String(taskId)
            ? { ...t, proofAttachment: downloadUrl }
            : t
        )
      );

      setTaskFeedback((prev) => ({
        ...prev,
        [taskId]: {
          type: 'success',
          msg: `Uploaded to Google Drive successfully: ${file.name}`,
        },
      }));

      setTimeout(() => {
        setTaskFeedback((prev) => ({ ...prev, [taskId]: null }));
      }, 4000);
    } catch (err) {
      console.error('File upload error:', err);
      setTaskFeedback((prev) => ({
        ...prev,
        [taskId]: {
          type: 'error',
          msg: err.response?.data?.error || 'Failed to upload document to Google Drive.',
        },
      }));
    } finally {
      setUploadingTask(null);
    }
  };

  const handleSaveWorkUpdate = async (taskId, currentNote, currentProof) => {
    const noteText = notes[taskId] !== undefined ? notes[taskId] : (currentNote || '');
    const proofText = proofs[taskId] !== undefined ? proofs[taskId] : (currentProof || '');

    try {
      setSavingTask(taskId);

      await axios.patch(`${API_URL}/tasks/${taskId}`, {
        userNote: noteText,
        proofAttachment: proofText,
      });

      setTasks((prev) =>
        prev.map((task) =>
          String(getTaskId(task)) === String(taskId)
            ? { ...task, userNote: noteText, proofAttachment: proofText }
            : task
        )
      );

      setTaskFeedback((prev) => ({
        ...prev,
        [taskId]: { type: 'success', msg: 'Work update and proof of work saved.' },
      }));

      setTimeout(() => {
        setTaskFeedback((prev) => ({ ...prev, [taskId]: null }));
      }, 3500);
    } catch (err) {
      console.error('Save error:', err);
      setTaskFeedback((prev) => ({
        ...prev,
        [taskId]: { type: 'error', msg: 'Failed to save work update.' },
      }));
    } finally {
      setSavingTask(null);
    }
  };

  // Legacy save note
  const handleSaveNote = async (taskId, currentNote) => {
    await handleSaveWorkUpdate(taskId, currentNote, undefined);
  };

  if (loading) {
    return (
      <div className="dashboard loading-screen">
        <div className="loader" />
        <p>Preparing your workspace...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard">
        <div className="card error-card">
          <EmptyIllustration />
          <h2>Oops! Something went wrong</h2>
          <p>{error}</p>
          <button
            className="btn-primary"
            onClick={() => window.location.reload()}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard user-dashboard">

      {/* NAVIGATION */}
      <header className="header user-header">
        <div className="brand">
          <div className="brand-icon">W</div>
          <div>
            <span className="brand-name">Workly</span>
            <small className="brand-subtitle">Member Workspace</small>
          </div>
        </div>

        <div className="header-actions">
          {currentView === 'overview' ? (
            <button
              className="btn-primary"
              onClick={() => setCurrentView('update')}
            >
              + Update Tasks
            </button>
          ) : (
            <button
              className="btn-back"
              onClick={() => setCurrentView('overview')}
            >
              ← Overview
            </button>
          )}

          <button className="btn-logout" onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="dashboard-content">

        {currentView === 'overview' ? (
          <>
            {/* HERO */}
            <section className="bento-banner animated-hero">
              <div className="banner-content">
                <span className="banner-tag">
                  YOUR PERSONAL WORKSPACE
                </span>

                <h1>
                  Hello, <span>{userName}!</span>
                </h1>

                <p>
                  Every task completed is a step forward.
                  Stay organized, track your progress and
                  make every day productive.
                </p>

                <div className="hero-progress">
                  <div className="hero-progress-label">
                    <span>Overall completion</span>
                    <strong>{progressPercent}%</strong>
                  </div>

                  <div className="hero-progress-track">
                    <div
                      className="hero-progress-fill"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                <button
                  className="btn-primary hero-button"
                  onClick={() => setCurrentView('update')}
                >
                  Manage My Tasks →
                </button>
              </div>

              <HeroIllustration />
            </section>

            {/* STATISTICS */}
            <section className="stats-row">

              <div className="stat-card animated-card">
                <div className="stat-top">
                  <span className="stat-trend">All tasks</span>
                </div>
                <span>Total Assigned</span>
                <strong>{tasks.length}</strong>
              </div>

              <div className="stat-card animated-card">
                <div className="stat-top">
                  <span className="stat-trend">To do</span>
                </div>
                <span>Pending</span>
                <strong>{pendingCount}</strong>
              </div>

              <div className="stat-card animated-card">
                <div className="stat-top">
                  <span className="stat-trend">Ongoing</span>
                </div>
                <span>In Progress</span>
                <strong>{inProgressCount}</strong>
              </div>

              <div className="stat-card animated-card">
                <div className="stat-top">
                  <span className="stat-trend">Achieved</span>
                </div>
                <span>Completed</span>
                <strong>{completedCount}</strong>
              </div>

            </section>

            {/* TASK TABLE */}
            <section className="card task-history-card">
              <div className="table-header">
                <div>
                  <h3>My Tasks & Progress</h3>
                  <p>Manage and review your assigned work.</p>
                </div>

                <div className="filter-pills">
                  {['All', 'Pending', 'In Progress', 'Completed'].map(
                    (status) => (
                      <button
                        key={status}
                        className={
                          filterStatus === status
                            ? 'pill active'
                            : 'pill'
                        }
                        onClick={() => setFilterStatus(status)}
                      >
                        {status}
                      </button>
                    )
                  )}
                </div>
              </div>

              {filteredTasks.length === 0 ? (
                <div className="empty-state">
                  <EmptyIllustration />
                  <h3>
                    {tasks.length === 0
                      ? 'Your workspace is ready!'
                      : 'No matching tasks'}
                  </h3>
                  <p>
                    {tasks.length === 0
                      ? 'New tasks assigned by your admin will appear here.'
                      : `There are no tasks with ${filterStatus} status.`}
                  </p>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Task Details</th>
                        <th>Deadline & Timer</th>
                        <th>Progress Note</th>
                        <th>Proof of Work</th>
                        <th>Admin Feedback</th>
                        <th>Status</th>
                        <th>Last Updated</th>
                        <th>Action</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredTasks.map((task) => {
                        const timerInfo = getTaskDeadlineInfo(task, currentTime);
                        return (
                          <tr key={getTaskId(task)}>
                            <td>
                              <strong className="task-title">
                                {task.title}
                              </strong>
                              <p className="task-description">
                                {task.description || 'No additional instructions.'}
                              </p>
                            </td>

                            <td className={`deadline-col-cell ${timerInfo.colClass}`}>
                              <div className={`deadline-timer-badge ${timerInfo.badgeClass}`}>
                                <span className="timer-main-badge">{timerInfo.primaryText}</span>
                                {timerInfo.secondaryText && (
                                  <span className="timer-sub-text">{timerInfo.secondaryText}</span>
                                )}
                              </div>
                            </td>

                          <td>
                            {task.userNote ? (
                              <span className="note-bubble">
                                {task.userNote}
                              </span>
                            ) : (
                              <span className="muted">
                                No notes added
                              </span>
                            )}
                          </td>

                          <td>
                            {task.proofAttachment ? (
                              <a
                                href={
                                  task.proofAttachment.startsWith('/')
                                    ? `${BACKEND_URL}${task.proofAttachment}`
                                    : task.proofAttachment
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="proof-badge-link"
                                title={task.proofAttachment}
                              >
                                {task.proofAttachment.startsWith('/uploads/')
                                  ? 'View Document ↗'
                                  : 'Open Link ↗'}
                              </a>
                            ) : (
                              <span className="muted">— No proof —</span>
                            )}
                            <div style={{ marginTop: '5px' }}>
                              <button
                                type="button"
                                className="btn-table-att-link"
                                onClick={() => setCurrentView('update')}
                                title="Manage Google Drive files in update view"
                              >
                                Drive Files →
                              </button>
                            </div>
                          </td>

                          <td>
                            {task.adminFeedback ? (
                              <div className="user-admin-feedback-pill">
                                <span className="feedback-pill-text" title={task.adminFeedback}>
                                  "{task.adminFeedback}"
                                </span>
                              </div>
                            ) : (
                              <span className="muted">— No feedback yet —</span>
                            )}
                          </td>

                          <td>
                            <StatusBadge status={task.status} />
                          </td>

                          <td>{task.updatedAt || '—'}</td>

                          <td>
                            <button
                              className="btn-table"
                              onClick={() => setCurrentView('update')}
                            >
                              Update →
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : (
          <>
            {/* UPDATE PAGE */}
            <section className="update-page-heading">
              <div>
                <span className="banner-tag">TASK MANAGEMENT</span>
                <h1>Let's get things done!</h1>
                <p>
                  Update your progress and keep your work moving forward.
                </p>
              </div>
            </section>

            {tasks.length === 0 ? (
              <div className="card empty-state">
                <EmptyIllustration />
                <h3>No tasks assigned yet</h3>
                <p>
                  Your assigned tasks will appear here once your admin
                  adds them.
                </p>
              </div>
            ) : (
              <section className="task-cards-grid">
                {tasks.map((task, index) => {
                  const taskId = getTaskId(task);
                  const status = task.status || 'Pending';
                  const timerInfo = getTaskDeadlineInfo(task, currentTime);

                  return (
                    <article
                      className="task-bento-card animated-task"
                      key={taskId}
                      style={{ '--card-index': index }}
                    >
                      <div className="task-card-top">
                        <StatusBadge status={status} />
                        <span className="task-number">
                          TASK {String(index + 1).padStart(2, '0')}
                        </span>
                      </div>

                      <h3>{task.title}</h3>

                      <p className="task-description">
                        {task.description ||
                          'No additional instructions provided.'}
                      </p>

                      {/* DEADLINE & LIVE COUNTDOWN TIMER BANNER */}
                      <div className={`user-task-timer-banner ${timerInfo.badgeClass}`}>
                        <div className="timer-banner-header">
                          <span className="timer-banner-title">
                            {timerInfo.isCompleted
                              ? (timerInfo.isOnTime ? 'Completed On Time' : 'Completed Late')
                              : (timerInfo.isOverdue ? 'Deadline Passed (Overdue)' : 'Task Deadline & Live Timer')}
                          </span>
                        </div>
                        <div className="timer-banner-body">
                          <span className="timer-banner-time">{timerInfo.primaryText}</span>
                          {timerInfo.secondaryText && (
                            <span className="timer-banner-sub">{timerInfo.secondaryText}</span>
                          )}
                        </div>
                      </div>

                      {/* ADMIN FEEDBACK BANNER */}
                      {task.adminFeedback ? (
                        <div className="task-admin-feedback-card active">
                          <div className="feedback-card-top">
                            <strong>Admin Feedback:</strong>
                          </div>
                          <p className="feedback-card-text">"{task.adminFeedback}"</p>
                        </div>
                      ) : (
                        <div className="task-admin-feedback-card awaiting">
                          <span className="feedback-card-awaiting-text">
                            No feedback from admin yet. Review files shared below and submit your deliverables.
                          </span>
                        </div>
                      )}

                      {/* ========================================================
                          SECTION A: FILES SHARED BY ADMIN (Incoming Deliverables)
                          ======================================================== */}
                      <section className="task-section-box section-admin-files">
                        <AttachmentManager
                          taskId={taskId}
                          currentUser={{
                            role: 'user',
                            email: currentUser?.email || userEmail || '',
                            name: currentUser?.name || currentUser?.username || 'Team Member',
                          }}
                          filterDirection="Admin_to_User"
                          title="Files Shared by Admin"
                          readOnly={true}
                          hideTabs={true}
                          emptyMessage="No reference files or documents shared by admin for this deliverable."
                        />

                        {/* Legacy assigned document link fallback */}
                        {task.adminAttachment && (
                          <div className="task-shared-admin-doc">
                            <span className="shared-doc-label">Project Brief Document:</span>
                            <a
                              href={
                                task.adminAttachment.startsWith('/')
                                  ? `${BACKEND_URL}${task.adminAttachment}`
                                  : task.adminAttachment
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn-view-admin-doc"
                            >
                              View Assigned Document ↗
                            </a>
                          </div>
                        )}
                      </section>

                      {/* ========================================================
                          SECTION B: SUBMIT YOUR WORK (Outgoing Deliverables)
                          ======================================================== */}
                      <section className="task-section-box section-submit-work">
                        <div className="submit-work-header">
                          <h4 className="submit-work-title">Submit Your Work</h4>
                          <span className="submit-work-subtitle">
                            Upload your completed deliverables to Google Drive, record progress notes, and share project links.
                          </span>
                        </div>

                        {/* 1. Progress Notes */}
                        <div className="submit-field-group">
                          <label htmlFor={`note-${taskId}`}>
                            Progress Notes & Milestone Summary
                          </label>
                          <textarea
                            id={`note-${taskId}`}
                            value={
                              notes[taskId] !== undefined
                                ? notes[taskId]
                                : task.userNote || ''
                            }
                            onChange={(e) =>
                              setNotes((prev) => ({
                                ...prev,
                                [taskId]: e.target.value,
                              }))
                            }
                            placeholder="Describe what you completed, milestones achieved, or deliverable summary..."
                            rows={3}
                            className="submit-notes-textarea"
                          />
                        </div>

                        {/* 2. Document Upload Button */}
                        <div className="submit-field-group">
                          <label>Upload Document Deliverable (Google Drive)</label>
                          <div className="deliverable-upload-controls">
                            <input
                              type="file"
                              id={`file-input-${taskId}`}
                              className="file-input-hidden"
                              accept=".pdf,.jpeg,.jpg,.png,.webp,.doc,.docx,.xls,.xlsx"
                              onChange={(e) => {
                                if (e.target.files?.[0]) {
                                  handleFileUpload(taskId, e.target.files[0]);
                                  e.target.value = '';
                                }
                              }}
                            />
                            <label
                              htmlFor={`file-input-${taskId}`}
                              className={`btn-deliverable-upload ${uploadingTask === taskId ? 'loading' : ''}`}
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="17 8 12 3 7 8" />
                                <line x1="12" y1="3" x2="12" y2="15" />
                              </svg>
                              <span>
                                {uploadingTask === taskId
                                  ? 'Uploading to Google Drive...'
                                  : 'Upload Document'}
                              </span>
                            </label>
                            <span className="upload-help-text">
                              Max 10 MB (PDF, DOCX, XLSX, PNG, JPG)
                            </span>
                          </div>
                        </div>

                        {/* 3. Submitted Deliverables Horizontal List */}
                        <div className="submitted-deliverables-wrap">
                          <AttachmentManager
                            taskId={taskId}
                            currentUser={{
                              role: 'user',
                              email: currentUser?.email || userEmail || '',
                              name: currentUser?.name || currentUser?.username || 'Team Member',
                            }}
                            filterDirection="User_to_Admin"
                            uploadDirection="User_to_Admin"
                            title="Your Uploaded Deliverables"
                            canUpload={false}
                            hideTabs={true}
                            emptyMessage="No deliverables submitted yet. Click 'Upload Document' above to submit your completed files."
                          />
                        </div>

                        {/* 4. External Link (GitHub, Figma, Google Docs) */}
                        <div className="submit-field-group">
                          <label htmlFor={`link-${taskId}`}>
                            External Work Link (Optional &mdash; GitHub, Figma, Docs)
                          </label>
                          <div className="proof-url-wrapper">
                            <input
                              id={`link-${taskId}`}
                              type="url"
                              className="proof-url-input"
                              placeholder="Paste external project link (https://...)"
                              value={
                                proofs[taskId] !== undefined
                                  ? proofs[taskId]
                                  : task.proofAttachment || ''
                              }
                              onChange={(e) =>
                                setProofs((prev) => ({
                                  ...prev,
                                  [taskId]: e.target.value,
                                }))
                              }
                            />
                          </div>
                        </div>

                        {/* Feedback message banner */}
                        {taskFeedback[taskId] && (
                          <div className={`task-feedback-banner ${taskFeedback[taskId].type}`}>
                            {taskFeedback[taskId].msg}
                          </div>
                        )}

                        {/* 5. Save Progress & Proof Button */}
                        <button
                          type="button"
                          className="btn-primary save-btn"
                          disabled={savingTask === taskId || uploadingTask === taskId}
                          onClick={() =>
                            handleSaveWorkUpdate(
                              taskId,
                              task.userNote,
                              task.proofAttachment
                            )
                          }
                        >
                          {savingTask === taskId
                            ? 'Saving Work & Notes...'
                            : 'Save Progress & Proof'}
                        </button>
                      </section>

                      <div className="status-section">
                        <label>Update Status</label>

                        <div className="status-options">
                          {['Pending', 'In Progress', 'Completed'].map(
                            (option) => (
                              <button
                                key={option}
                                disabled={savingTask === taskId}
                                className={
                                  status === option
                                    ? `status-choice active ${option
                                        .toLowerCase()
                                        .replace(' ', '-')}`
                                    : 'status-choice'
                                }
                                onClick={() =>
                                  handleStatusChange(taskId, option)
                                }
                              >
                                {option}
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </section>
            )}
          </>
        )}
      </main>

      <footer className="user-footer">
        <span>Workly Workspace</span>
        <span>Powered by AIMarkvent</span>
      </footer>
    </div>
  );
}
