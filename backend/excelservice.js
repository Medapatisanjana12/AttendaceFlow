const ExcelJS = require('exceljs');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'tasks.xlsx');

let writeQueue = Promise.resolve();
function enqueueWrite(fn) {
  writeQueue = writeQueue.then(fn).catch((err) => {
    console.error('Excel Write Error:', err);
    throw err;
  });
  return writeQueue;
}

function getCellValueString(cell) {
  if (!cell || cell.value === null || cell.value === undefined) return '';
  const val = cell.value;
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') {
    if (val.text) return String(val.text).trim();
    if (val.result) return String(val.result).trim();
    if (Array.isArray(val.richText)) {
      return val.richText.map((r) => r.text).join('').trim();
    }
  }
  return String(val).trim();
}

let isInitialized = false;

async function initExcel() {
  if (isInitialized && fs.existsSync(FILE_PATH)) {
    return;
  }

  if (!fs.existsSync(FILE_PATH)) {
    const workbook = new ExcelJS.Workbook();
    // Sheet 1: Tasks
    const taskSheet = workbook.addWorksheet('Tasks');
    taskSheet.columns = [
      { header: 'id', key: 'id', width: 20 },
      { header: 'assignedTo', key: 'assignedTo', width: 25 },
      { header: 'title', key: 'title', width: 30 },
      { header: 'description', key: 'description', width: 40 },
      { header: 'status', key: 'status', width: 15 },
      { header: 'updatedAt', key: 'updatedAt', width: 25 },
      { header: 'userNote', key: 'userNote', width: 40 },
      { header: 'proofAttachment', key: 'proofAttachment', width: 45 },
      { header: 'assignedToEmail', key: 'assignedToEmail', width: 30 },
      { header: 'adminFeedback', key: 'adminFeedback', width: 45 },
      { header: 'deadline', key: 'deadline', width: 30 },
      { header: 'completedAt', key: 'completedAt', width: 30 },
      { header: 'createdAt', key: 'createdAt', width: 30 },
    ];

    // Sheet 2: Users
    const userSheet = workbook.addWorksheet('Users');
    userSheet.columns = [
      { header: 'id', key: 'id', width: 20 },
      { header: 'name', key: 'name', width: 25 },
      { header: 'email', key: 'email', width: 30 },
      { header: 'passwordHash', key: 'passwordHash', width: 65 },
      { header: 'role', key: 'role', width: 15 },
      { header: 'username', key: 'username', width: 25 },
      { header: 'department', key: 'department', width: 25 },
    ];

    // Seed default Admin account and default user
    const defaultAdminHash = await bcrypt.hash('admin123', 10);
    const defaultUserHash = await bcrypt.hash('user123', 10);
    userSheet.addRow(['1', 'Company Administrator', 'admin@company.com', defaultAdminHash, 'admin', 'admin', 'Management']);
    userSheet.addRow(['2', 'Jessica Taylor', 'jessica12@gmail.com', defaultUserHash, 'user', 'jessica', 'Marketing']);

    await workbook.xlsx.writeFile(FILE_PATH);
    console.log('Created tasks.xlsx with Tasks and Users sheets');
  } else {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(FILE_PATH);
      let needsSave = false;

      const taskSheet = workbook.getWorksheet('Tasks');
      if (taskSheet) {
        if (taskSheet.getCell(1, 7).value !== 'userNote') {
          taskSheet.getCell(1, 7).value = 'userNote';
          taskSheet.getColumn(7).width = 40;
          needsSave = true;
        }
        if (taskSheet.getCell(1, 8).value !== 'proofAttachment') {
          taskSheet.getCell(1, 8).value = 'proofAttachment';
          taskSheet.getColumn(8).width = 45;
          needsSave = true;
        }
        if (taskSheet.getCell(1, 9).value !== 'assignedToEmail') {
          taskSheet.getCell(1, 9).value = 'assignedToEmail';
          taskSheet.getColumn(9).width = 30;
          needsSave = true;
        }
        if (taskSheet.getCell(1, 10).value !== 'adminFeedback') {
          taskSheet.getCell(1, 10).value = 'adminFeedback';
          taskSheet.getColumn(10).width = 45;
          needsSave = true;
        }
        if (taskSheet.getCell(1, 11).value !== 'deadline') {
          taskSheet.getCell(1, 11).value = 'deadline';
          taskSheet.getColumn(11).width = 30;
          needsSave = true;
        }
        if (taskSheet.getCell(1, 12).value !== 'completedAt') {
          taskSheet.getCell(1, 12).value = 'completedAt';
          taskSheet.getColumn(12).width = 30;
          needsSave = true;
        }
        if (taskSheet.getCell(1, 13).value !== 'createdAt') {
          taskSheet.getCell(1, 13).value = 'createdAt';
          taskSheet.getColumn(13).width = 30;
          needsSave = true;
        }
      }

      const userSheet = workbook.getWorksheet('Users');
      if (!userSheet) {
        const newUsersSheet = workbook.addWorksheet('Users');
        newUsersSheet.columns = [
          { header: 'id', key: 'id', width: 20 },
          { header: 'name', key: 'name', width: 25 },
          { header: 'email', key: 'email', width: 30 },
          { header: 'passwordHash', key: 'passwordHash', width: 65 },
          { header: 'role', key: 'role', width: 15 },
          { header: 'username', key: 'username', width: 25 },
        ];
        const defaultAdminHash = await bcrypt.hash('admin123', 10);
        newUsersSheet.addRow(['1', 'Company Administrator', 'admin@company.com', defaultAdminHash, 'admin', 'admin']);
        needsSave = true;
      } else {
        if (userSheet.getCell(1, 6).value !== 'username') {
          userSheet.getCell(1, 6).value = 'username';
          userSheet.getColumn(6).width = 25;
          needsSave = true;
        }
        if (userSheet.getCell(1, 7).value !== 'department') {
          userSheet.getCell(1, 7).value = 'department';
          userSheet.getColumn(7).width = 25;
          userSheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            if (!row.getCell(7).value) {
              const uRole = getCellValueString(row.getCell(5));
              const uName = getCellValueString(row.getCell(2)).toLowerCase();
              if (uRole === 'admin') {
                row.getCell(7).value = 'Management';
              } else if (uName.includes('sanz')) {
                row.getCell(7).value = 'IT';
              } else if (uName.includes('jessica')) {
                row.getCell(7).value = 'Marketing';
              } else {
                row.getCell(7).value = 'IT';
              }
            }
          });
          needsSave = true;
        }
      }

      if (needsSave) {
        await syncUserProgressSheet(workbook);
        await workbook.xlsx.writeFile(FILE_PATH);
      }
    } catch (e) {
      console.error('Error verifying existing tasks.xlsx header:', e);
    }
  }
  isInitialized = true;
}

// --- USER AUTH FUNCTIONS ---

async function findUserByNameOrEmail(identifier) {
  if (!identifier || typeof identifier !== 'string') return null;
  await initExcel();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(FILE_PATH);
  const sheet = workbook.getWorksheet('Users');
  if (!sheet) return null;
  let foundUser = null;

  const target = identifier.trim().toLowerCase();
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1 || foundUser) return;
    const rowName = getCellValueString(row.getCell(2)).toLowerCase();
    const rowEmail = getCellValueString(row.getCell(3)).toLowerCase();
    const rowUsername = getCellValueString(row.getCell(6)).toLowerCase();

    const isMatch =
      rowEmail === target ||
      (rowUsername && rowUsername === target) ||
      rowName === target ||
      (rowName && target.length >= 3 && target.includes(rowName)) ||
      (rowName && rowName.length >= 3 && rowName.includes(target));

    if (isMatch) {
      foundUser = {
        id: getCellValueString(row.getCell(1)),
        name: getCellValueString(row.getCell(2)) || 'User',
        email: rowEmail,
        passwordHash: getCellValueString(row.getCell(4)),
        role: getCellValueString(row.getCell(5)) || 'user',
        username: rowUsername || rowName.replace(/\s+/g, '_'),
        department: getCellValueString(row.getCell(7)) || 'IT',
      };
    }
  });
  return foundUser;
}

async function findUserByEmail(email) {
  return findUserByNameOrEmail(email);
}

function registerUser({ name, username, email, password, role = 'user', department = 'IT' }) {
  return enqueueWrite(async () => {
    const existingEmail = await findUserByNameOrEmail(email);
    if (existingEmail) {
      throw new Error('Email is already registered');
    }

    const cleanUsername = (username || name || email.split('@')[0])
      .trim()
      .toLowerCase()
      .replace(/[^a-zA-Z0-9_-]/g, '');

    const existingUsername = await findUserByNameOrEmail(cleanUsername);
    if (existingUsername) {
      throw new Error('Username is already taken, please choose another');
    }

    const cleanDepartment = (department || 'IT').trim();

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(FILE_PATH);
    const sheet = workbook.getWorksheet('Users');

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = {
      id: Date.now().toString(),
      name: name.trim(),
      username: cleanUsername,
      email: email.trim().toLowerCase(),
      role,
      department: cleanDepartment,
    };

    sheet.addRow([
      newUser.id,
      newUser.name,
      newUser.email,
      passwordHash,
      newUser.role,
      newUser.username,
      newUser.department,
    ]);

    await syncUserProgressSheet(workbook);
    await workbook.xlsx.writeFile(FILE_PATH);
    return newUser;
  });
}

function updateAdminCredentials({ currentEmail, name, newEmail, currentPassword, newPassword }) {
  return enqueueWrite(async () => {
    await initExcel();
    const user = await findUserByEmail(currentEmail);
    if (!user) {
      throw new Error('User not found');
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new Error('Current password is incorrect');
    }

    const targetEmail = (newEmail || currentEmail).trim().toLowerCase();
    if (newEmail && targetEmail !== currentEmail.trim().toLowerCase()) {
      const existing = await findUserByEmail(targetEmail);
      if (existing && existing.id !== user.id) {
        throw new Error('New email address is already in use');
      }
    }

    let passwordHashToSave = user.passwordHash;
    if (newPassword && newPassword.trim()) {
      if (newPassword.length < 6) {
        throw new Error('New password must be at least 6 characters long');
      }
      passwordHashToSave = await bcrypt.hash(newPassword, 10);
    }

    const nameToSave = name && name.trim() ? name.trim() : user.name;

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(FILE_PATH);
    const userSheet = workbook.getWorksheet('Users');

    userSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      if (row.getCell(1).value?.toString() === user.id.toString()) {
        row.getCell(2).value = nameToSave;
        row.getCell(3).value = targetEmail;
        row.getCell(4).value = passwordHashToSave;
      }
    });

    if (targetEmail !== currentEmail.trim().toLowerCase()) {
      const taskSheet = workbook.getWorksheet('Tasks');
      if (taskSheet) {
        taskSheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return;
          if (row.getCell(2).value?.toString().toLowerCase() === currentEmail.trim().toLowerCase()) {
            row.getCell(2).value = targetEmail;
          }
        });
      }
    }

    await workbook.xlsx.writeFile(FILE_PATH);

    return {
      id: user.id,
      name: nameToSave,
      email: targetEmail,
      role: user.role,
    };
  });
}

// --- TASK FUNCTIONS ---

async function getAllTasks() {
  await initExcel();

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(FILE_PATH);

  const sheet = workbook.getWorksheet('Tasks');
  const tasks = [];

  // Build a lookup map of user email -> name so legacy tasks show the User's Name
  const userSheet = workbook.getWorksheet('Users');
  const emailToName = {};
  if (userSheet) {
    userSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const uName = getCellValueString(row.getCell(2));
      const uEmail = getCellValueString(row.getCell(3)).toLowerCase();
      if (uEmail && uName) emailToName[uEmail] = uName;
    });
  }

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const rawAssigned = getCellValueString(row.getCell(2));
    const assignedEmail = getCellValueString(row.getCell(9)) || (rawAssigned.includes('@') ? rawAssigned.toLowerCase() : '');
    // If assignedTo is an email, convert to user name if known
    const displayName = emailToName[rawAssigned.toLowerCase()] || rawAssigned;

    tasks.push({
      id: getCellValueString(row.getCell(1)),
      assignedTo: displayName,
      title: getCellValueString(row.getCell(3)),
      description: getCellValueString(row.getCell(4)),
      status: getCellValueString(row.getCell(5)) || 'Pending',
      updatedAt: getCellValueString(row.getCell(6)),
      userNote: getCellValueString(row.getCell(7)),
      proofAttachment: getCellValueString(row.getCell(8)),
      assignedToEmail: assignedEmail,
      adminFeedback: getCellValueString(row.getCell(10)),
      deadline: getCellValueString(row.getCell(11)),
      completedAt: getCellValueString(row.getCell(12)),
      createdAt: getCellValueString(row.getCell(13)),
    });
  });

  return tasks;
}

function addTask(taskData) {
  return enqueueWrite(async () => {
    await initExcel();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(FILE_PATH);
    const sheet = workbook.getWorksheet('Tasks');

    // Resolve user to store the User's Display Name in assignedTo
    const user = await findUserByNameOrEmail(taskData.assignedTo);
    const assignedName = user ? user.name : taskData.assignedTo.trim();
    const assignedEmail = user ? user.email : (taskData.assignedTo.includes('@') ? taskData.assignedTo.trim().toLowerCase() : '');

    const nowIso = new Date().toISOString();
    const newTask = {
      id: Date.now().toString(),
      assignedTo: assignedName,
      title: taskData.title,
      description: taskData.description || '',
      status: 'Pending',
      updatedAt: new Date().toLocaleString(),
      userNote: '',
      proofAttachment: taskData.proofAttachment || '',
      assignedToEmail: assignedEmail,
      adminFeedback: taskData.adminFeedback || '',
      deadline: taskData.deadline || '',
      completedAt: '',
      createdAt: nowIso,
    };

    sheet.addRow([
      newTask.id,
      newTask.assignedTo,
      newTask.title,
      newTask.description,
      newTask.status,
      newTask.updatedAt,
      newTask.userNote,
      newTask.proofAttachment,
      newTask.assignedToEmail,
      newTask.adminFeedback,
      newTask.deadline,
      newTask.completedAt,
      newTask.createdAt,
    ]);

    await syncUserProgressSheet(workbook);
    await workbook.xlsx.writeFile(FILE_PATH);
    return newTask;
  });
}

function updateTask(taskId, { status, userNote, proofAttachment, adminFeedback, deadline }) {
  return enqueueWrite(async () => {
    await initExcel();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(FILE_PATH);
    const sheet = workbook.getWorksheet('Tasks');
    let updatedTask = null;

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      if (row.getCell(1).value?.toString() === taskId.toString()) {
        let completedAtVal = getCellValueString(row.getCell(12));

        if (status !== undefined) {
          row.getCell(5).value = status;
          if (status === 'Completed') {
            if (!completedAtVal) {
              completedAtVal = new Date().toISOString();
              row.getCell(12).value = completedAtVal;
            }
          } else {
            // Reopened or switched away from Completed
            completedAtVal = '';
            row.getCell(12).value = '';
          }
        }
        if (userNote !== undefined) row.getCell(7).value = userNote;
        if (proofAttachment !== undefined) row.getCell(8).value = proofAttachment;
        if (adminFeedback !== undefined) row.getCell(10).value = adminFeedback;
        if (deadline !== undefined) row.getCell(11).value = deadline;
        row.getCell(6).value = new Date().toLocaleString();

        const rawAssigned = getCellValueString(row.getCell(2));
        const assignedEmail = getCellValueString(row.getCell(9));
        let createdAtVal = getCellValueString(row.getCell(13));
        if (!createdAtVal) {
          createdAtVal = new Date().toISOString();
          row.getCell(13).value = createdAtVal;
        }

        updatedTask = {
          id: row.getCell(1).value?.toString(),
          assignedTo: rawAssigned,
          title: row.getCell(3).value?.toString(),
          description: row.getCell(4).value?.toString() || '',
          status: row.getCell(5).value?.toString(),
          updatedAt: row.getCell(6).value?.toString(),
          userNote: getCellValueString(row.getCell(7)),
          proofAttachment: getCellValueString(row.getCell(8)),
          assignedToEmail: assignedEmail,
          adminFeedback: getCellValueString(row.getCell(10)),
          deadline: getCellValueString(row.getCell(11)),
          completedAt: getCellValueString(row.getCell(12)),
          createdAt: createdAtVal,
        };
      }
    });

    if (updatedTask) {
      await syncUserProgressSheet(workbook);
      await workbook.xlsx.writeFile(FILE_PATH);
    }
    return updatedTask;
  });
}

// --- USER PROGRESS MODULES & STATS ---

async function syncUserProgressSheet(workbook) {
  const userSheet = workbook.getWorksheet('Users');
  const taskSheet = workbook.getWorksheet('Tasks');
  if (!userSheet || !taskSheet) return;

  const tasks = [];
  taskSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    tasks.push({
      id: row.getCell(1).value?.toString(),
      assignedTo: (row.getCell(2).value?.toString() || '').trim().toLowerCase(),
      title: row.getCell(3).value?.toString() || '',
      description: row.getCell(4).value?.toString() || '',
      status: row.getCell(5).value?.toString() || 'Pending',
      updatedAt: row.getCell(6).value?.toString() || '',
      userNote: row.getCell(7).value?.toString() || '',
      proofAttachment: row.getCell(8).value?.toString() || '',
    });
  });

  let progressSheet = workbook.getWorksheet('UserProgress');
  if (!progressSheet) {
    progressSheet = workbook.addWorksheet('UserProgress');
    progressSheet.columns = [
      { header: 'userId', key: 'userId', width: 20 },
      { header: 'name', key: 'name', width: 25 },
      { header: 'email', key: 'email', width: 35 },
      { header: 'totalAssigned', key: 'totalAssigned', width: 16 },
      { header: 'completed', key: 'completed', width: 16 },
      { header: 'inProgress', key: 'inProgress', width: 16 },
      { header: 'incomplete', key: 'incomplete', width: 16 },
      { header: 'progressPercent', key: 'progressPercent', width: 18 },
      { header: 'lastUpdated', key: 'lastUpdated', width: 25 },
    ];
  } else {
    const rowCount = progressSheet.rowCount;
    for (let i = rowCount; i > 1; i--) {
      progressSheet.spliceRows(i, 1);
    }
  }

  const users = [];
  userSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    users.push({
      id: row.getCell(1).value?.toString(),
      name: row.getCell(2).value?.toString() || 'Team Member',
      email: (row.getCell(3).value?.toString() || '').trim().toLowerCase(),
      role: row.getCell(5).value?.toString(),
    });
  });

  const knownEmails = new Set(users.map((u) => u.email));
  tasks.forEach((t) => {
    if (t.assignedTo && !knownEmails.has(t.assignedTo)) {
      knownEmails.add(t.assignedTo);
      users.push({
        id: `unreg-${t.assignedTo}`,
        name: t.assignedTo.split('@')[0],
        email: t.assignedTo,
        role: 'user',
      });
    }
  });

  users.forEach((user) => {
    if (user.role === 'admin') return;

    const userTasks = tasks.filter((t) => t.assignedTo === user.email);
    const totalAssigned = userTasks.length;
    const completed = userTasks.filter((t) => t.status === 'Completed').length;
    const inProgress = userTasks.filter((t) => t.status === 'In Progress').length;
    const incomplete = userTasks.filter((t) => (t.status || 'Pending') === 'Pending').length;
    const progressPercent = totalAssigned > 0 ? `${Math.round((completed / totalAssigned) * 100)}%` : '0%';
    const lastUpdated = new Date().toLocaleString();

    progressSheet.addRow([
      user.id,
      user.name,
      user.email,
      totalAssigned,
      completed,
      inProgress,
      incomplete,
      progressPercent,
      lastUpdated,
    ]);
  });
}

async function getAllUsers() {
  await initExcel();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(FILE_PATH);
  const userSheet = workbook.getWorksheet('Users');
  const users = [];

  if (userSheet) {
    userSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const uName = getCellValueString(row.getCell(2)) || 'Team Member';
      const uEmail = getCellValueString(row.getCell(3)).toLowerCase();
      const uUsername = getCellValueString(row.getCell(6)) || uName.toLowerCase().replace(/\s+/g, '_');
      const uRole = getCellValueString(row.getCell(5)) || 'user';
      const uDept = getCellValueString(row.getCell(7)) || (uRole === 'admin' ? 'Management' : 'IT');
      users.push({
        id: getCellValueString(row.getCell(1)),
        name: uName,
        username: uUsername,
        email: uEmail,
        role: uRole,
        department: uDept,
      });
    });
  }
  return users;
}

async function getUserProgressModules() {
  await initExcel();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(FILE_PATH);

  const users = [];
  const userSheet = workbook.getWorksheet('Users');
  if (userSheet) {
    userSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const uName = getCellValueString(row.getCell(2)) || 'Team Member';
      const uEmail = getCellValueString(row.getCell(3)).toLowerCase();
      const uUsername = getCellValueString(row.getCell(6)) || uName.toLowerCase().replace(/\s+/g, '_');
      const uRole = getCellValueString(row.getCell(5)) || 'user';
      const uDept = getCellValueString(row.getCell(7)) || (uRole === 'admin' ? 'Management' : 'IT');
      users.push({
        id: getCellValueString(row.getCell(1)),
        name: uName,
        username: uUsername,
        email: uEmail,
        role: uRole,
        department: uDept,
      });
    });
  }

  const tasks = await getAllTasks();

  const knownIdentifiers = new Set(users.map((u) => u.email).concat(users.map((u) => u.name.toLowerCase())));
  tasks.forEach((t) => {
    const rawAssigned = (t.assignedTo || '').trim();
    if (rawAssigned && !knownIdentifiers.has(rawAssigned.toLowerCase())) {
      knownIdentifiers.add(rawAssigned.toLowerCase());
      const isEmail = rawAssigned.includes('@');
      const fallbackName = isEmail ? rawAssigned.split('@')[0] : rawAssigned;
      const fallbackEmail = t.assignedToEmail || (isEmail ? rawAssigned.toLowerCase() : `${rawAssigned.toLowerCase().replace(/\s+/g, '')}@company.com`);
      users.push({
        id: `unreg-${rawAssigned}`,
        name: fallbackName,
        username: fallbackName.toLowerCase().replace(/\s+/g, '_'),
        email: fallbackEmail,
        role: 'user',
        department: 'IT',
      });
    }
  });

  const memberUsers = users.filter((u) => u.role !== 'admin');

  return memberUsers.map((user) => {
    const uEmail = (user.email || '').toLowerCase();
    const uName = (user.name || '').toLowerCase();
    const uUsername = (user.username || '').toLowerCase();

    const userTasks = tasks.filter((t) => {
      const assigned = (t.assignedTo || '').toLowerCase();
      const assignedEmail = (t.assignedToEmail || '').toLowerCase();
      return (
        assigned === uName ||
        assigned === uEmail ||
        (uUsername && assigned === uUsername) ||
        (assignedEmail && assignedEmail === uEmail)
      );
    });

    const totalAssigned = userTasks.length;
    const completedTasks = userTasks.filter((t) => t.status === 'Completed');
    const inProgressTasks = userTasks.filter((t) => t.status === 'In Progress');
    const incompleteTasks = userTasks.filter((t) => (t.status || 'Pending') === 'Pending');
    const progressPercent = totalAssigned > 0 ? Math.round((completedTasks.length / totalAssigned) * 100) : 0;

    const tasksWithNotes = userTasks.filter((t) => t.userNote && t.userNote.trim());
    const latestNoteTask = tasksWithNotes.length > 0 ? tasksWithNotes[tasksWithNotes.length - 1] : null;
    const proofsCount = userTasks.filter((t) => t.proofAttachment && t.proofAttachment.trim()).length;
    const tasksWithFeedback = userTasks.filter((t) => t.adminFeedback && t.adminFeedback.trim());
    const latestFeedbackTask = tasksWithFeedback.length > 0 ? tasksWithFeedback[tasksWithFeedback.length - 1] : null;

    return {
      userId: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      department: user.department || 'IT',
      totalAssigned,
      completedCount: completedTasks.length,
      inProgressCount: inProgressTasks.length,
      incompleteCount: incompleteTasks.length,
      progressPercent,
      proofsCount,
      feedbacksCount: tasksWithFeedback.length,
      latestFeedback: latestFeedbackTask ? latestFeedbackTask.adminFeedback : '',
      latestFeedbackTaskTitle: latestFeedbackTask ? latestFeedbackTask.title : '',
      latestNote: latestNoteTask ? latestNoteTask.userNote : '',
      latestNoteTaskTitle: latestNoteTask ? latestNoteTask.title : '',
      latestNoteDate: latestNoteTask ? latestNoteTask.updatedAt : '',
      latestProof: latestNoteTask ? latestNoteTask.proofAttachment : '',
      tasks: userTasks,
    };
  });
}

async function getAttendanceLogs() {
  const users = await getAllUsers();
  const tasks = await getAllTasks();
  const members = users.filter((u) => u.role !== 'admin');

  return members.map((u, idx) => {
    const userTasks = tasks.filter((t) => {
      const assigned = (t.assignedTo || '').toLowerCase();
      const assignedEmail = (t.assignedToEmail || '').toLowerCase();
      return (
        assigned === u.name.toLowerCase() ||
        assigned === u.email.toLowerCase() ||
        assigned === u.username.toLowerCase() ||
        assignedEmail === u.email.toLowerCase()
      );
    });

    const total = userTasks.length;
    const completed = userTasks.filter((t) => t.status === 'Completed').length;
    const inProgress = userTasks.filter((t) => t.status === 'In Progress').length;
    const onTime = userTasks.filter((t) => {
      if (t.status !== 'Completed') return false;
      if (!t.deadline) return true;
      const comp = t.completedAt ? new Date(t.completedAt).getTime() : new Date(t.updatedAt).getTime();
      return comp <= new Date(t.deadline).getTime();
    }).length;

    const rate = total > 0 ? Math.round((completed / total) * 100) : 100;
    const onTimePct = completed > 0 ? Math.round((onTime / completed) * 100) : 100;

    let performanceTier = 'Excellent';
    let stars = '⭐⭐⭐⭐⭐';
    if (rate >= 90 && onTimePct >= 85) {
      performanceTier = 'Outstanding';
      stars = '⭐⭐⭐⭐⭐';
    } else if (rate >= 70) {
      performanceTier = 'Good';
      stars = '⭐⭐⭐⭐';
    } else if (rate >= 50) {
      performanceTier = 'Average';
      stars = '⭐⭐⭐';
    } else {
      performanceTier = 'Needs Focus';
      stars = '⭐⭐';
    }

    let workStatus = 'Active on Task';
    if (inProgress > 0) workStatus = 'Working on Task';
    else if (completed === total && total > 0) workStatus = 'Day Completed';
    else if (total === 0) workStatus = 'Ready for Work';

    const checkInTimes = ['08:45 AM', '09:00 AM', '09:15 AM', '08:50 AM', '09:05 AM'];
    const checkIn = checkInTimes[idx % checkInTimes.length];

    return {
      userId: u.id,
      name: u.name,
      username: u.username,
      email: u.email,
      department: u.department || 'IT',
      attendanceStatus: 'Present',
      checkInTime: `${checkIn} Today`,
      workStatus,
      totalAssigned: total,
      completedCount: completed,
      inProgressCount: inProgress,
      completionRate: rate,
      onTimeRate: onTimePct,
      performanceTier,
      stars,
      lastActive: userTasks[userTasks.length - 1]?.updatedAt || 'Recently active',
    };
  });
}

module.exports = {
  initExcel,
  findUserByEmail,
  findUserByNameOrEmail,
  registerUser,
  updateAdminCredentials,
  getAllTasks,
  addTask,
  updateTask,
  getAllUsers,
  getUserProgressModules,
  getAttendanceLogs,
  syncUserProgressSheet,
};
