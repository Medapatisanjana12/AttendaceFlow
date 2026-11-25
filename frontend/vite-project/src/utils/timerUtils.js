/**
 * Timer & Deadline calculation utilities for Workly
 */

export function formatTimeRemaining(diffMs) {
  if (diffMs <= 0) return '00:00:00';
  const totalSecs = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = totalSecs % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatDurationHuman(ms) {
  const totalSecs = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSecs / 86400);
  const hours = Math.floor((totalSecs % 86400) / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = totalSecs % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function getTaskDeadlineInfo(task, now = Date.now()) {
  const status = task.status || 'Pending';
  const isCompleted = status === 'Completed';

  if (!task.deadline) {
    if (isCompleted) {
      return {
        type: 'completed-ontime',
        statusKey: 'completed-ontime',
        badgeClass: 'timer-badge-green',
        rowClass: 'row-completed-ontime',
        colClass: 'col-deadline-ontime',
        primaryText: '✓ Completed',
        secondaryText: 'Finished (No deadline set)',
        badgeText: '✓ Completed On Time',
        isOverdue: false,
        isCompleted: true,
        isOnTime: true,
      };
    }
    return {
      type: 'no-deadline',
      statusKey: status.toLowerCase().replace(/\s+/g, '-'),
      badgeClass: 'timer-badge-neutral',
      rowClass: status === 'In Progress' ? 'row-in-progress' : 'row-pending',
      colClass: 'col-deadline-neutral',
      primaryText: 'No deadline set',
      secondaryText: status,
      badgeText: status,
      isOverdue: false,
      isCompleted: false,
      isOnTime: false,
    };
  }

  const deadlineMs = new Date(task.deadline).getTime();
  if (isNaN(deadlineMs)) {
    return {
      type: 'invalid',
      statusKey: 'invalid',
      badgeClass: 'timer-badge-neutral',
      rowClass: '',
      colClass: '',
      primaryText: '—',
      secondaryText: '',
      badgeText: '—',
      isOverdue: false,
      isCompleted: false,
      isOnTime: false,
    };
  }

  const deadlineDateStr = new Date(task.deadline).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isCompleted) {
    // Determine when task was finished
    let compMs = null;
    if (task.completedAt) {
      const parsed = new Date(task.completedAt).getTime();
      if (!isNaN(parsed)) compMs = parsed;
    }
    if (!compMs && task.updatedAt) {
      const parsed = new Date(task.updatedAt).getTime();
      if (!isNaN(parsed)) compMs = parsed;
    }
    if (!compMs) compMs = now;

    const isOnTime = compMs <= deadlineMs;

    if (isOnTime) {
      return {
        type: 'completed-ontime',
        statusKey: 'completed-ontime',
        badgeClass: 'timer-badge-green',
        rowClass: 'row-completed-ontime',
        colClass: 'col-deadline-ontime',
        primaryText: '✓ Completed On Time',
        secondaryText: `Within deadline (${deadlineDateStr})`,
        badgeText: '✓ Done in time',
        isOverdue: false,
        isCompleted: true,
        isOnTime: true,
      };
    } else {
      const lateMs = compMs - deadlineMs;
      const lateDuration = formatDurationHuman(lateMs);
      return {
        type: 'completed-late',
        statusKey: 'completed-late',
        badgeClass: 'timer-badge-red',
        rowClass: 'row-completed-late',
        colClass: 'col-deadline-overdue',
        primaryText: '✕ Completed Late',
        secondaryText: `Exceeded deadline by ${lateDuration}`,
        badgeText: '✕ Missed deadline',
        isOverdue: true,
        isCompleted: true,
        isOnTime: false,
      };
    }
  }

  // Task is pending or in progress
  const diffMs = deadlineMs - now;
  if (diffMs > 0) {
    // Active Countdown within deadline
    const timeRemainingStr = formatTimeRemaining(diffMs);
    const humanStr = formatDurationHuman(diffMs);
    return {
      type: 'active',
      statusKey: status === 'In Progress' ? 'in-progress' : 'active-pending',
      badgeClass: 'timer-badge-orange',
      rowClass: status === 'In Progress' ? 'row-in-progress' : 'row-active-pending',
      colClass: 'col-deadline-active',
      primaryText: `⏳ ${timeRemainingStr}`,
      secondaryText: `${humanStr} left • Due ${deadlineDateStr}`,
      badgeText: `⏳ ${timeRemainingStr} left`,
      isOverdue: false,
      isCompleted: false,
      isOnTime: false,
    };
  } else {
    // Deadline passed and task is NOT completed -> OVERDUE
    const overdueMs = Math.abs(diffMs);
    const overdueDuration = formatDurationHuman(overdueMs);
    return {
      type: 'overdue',
      statusKey: 'overdue',
      badgeClass: 'timer-badge-red pulse-red',
      rowClass: 'row-overdue',
      colClass: 'col-deadline-overdue',
      primaryText: `⚠️ Overdue by ${overdueDuration}`,
      secondaryText: `Deadline was ${deadlineDateStr}`,
      badgeText: `⚠️ Overdue ${overdueDuration}`,
      isOverdue: true,
      isCompleted: false,
      isOnTime: false,
    };
  }
}
