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
    ];

    // Seed default Admin account and default user
    const defaultAdminHash = await bcrypt.hash('admin123', 10);
    const defaultUserHash = await bcrypt.hash('user123', 10);
    userSheet.addRow(['1', 'Company Administrator', 'admin@company.com', defaultAdminHash, 'admin', 'admin']);
    userSheet.addRow(['2', 'Jessica Taylor', 'jessica12@gmail.com', defaultUserHash, 'user', 'jessica']);

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
      };
    }
  });
  return foundUser;
}

async function findUserByEmail(email) {
  return findUserByNameOrEmail(email);
}

function registerUser({ name, username, email, password, role = 'user' }) {
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
    };

    sheet.addRow([
      newUser.id,
      newUser.name,
      newUser.email,
      passwordHash,
      newUser.role,
      newUser.username,
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
    ]);

    await syncUserProgressSheet(workbook);
    await workbook.xlsx.writeFile(FILE_PATH);
    return newTask;
  });
}

function updateTask(taskId, { status, userNote, proofAttachment }) {
  return enqueueWrite(async () => {
    await initExcel();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(FILE_PATH);
    const sheet = workbook.getWorksheet('Tasks');
    let updatedTask = null;

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      if (row.getCell(1).value?.toString() === taskId.toString()) {
        if (status !== undefined) row.getCell(5).value = status;
        if (userNote !== undefined) row.getCell(7).value = userNote;
        if (proofAttachment !== undefined) row.getCell(8).value = proofAttachment;
        row.getCell(6).value = new Date().toLocaleString();

        updatedTask = {
          id: row.getCell(1).value?.toString(),
          assignedTo: row.getCell(2).value?.toString(),
          title: row.getCell(3).value?.toString(),
          description: row.getCell(4).value?.toString() || '',
          status: row.getCell(5).value?.toString(),
          updatedAt: row.getCell(6).value?.toString(),
          userNote: row.getCell(7).value?.toString() || '',
          proofAttachment: row.getCell(8).value?.toString() || '',
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
      users.push({
        id: getCellValueString(row.getCell(1)),
        name: uName,
        username: uUsername,
        email: uEmail,
        role: getCellValueString(row.getCell(5)) || 'user',
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
      users.push({
        id: getCellValueString(row.getCell(1)),
        name: uName,
        username: uUsername,
        email: uEmail,
        role: getCellValueString(row.getCell(5)) || 'user',
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

    return {
      userId: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      totalAssigned,
      completedCount: completedTasks.length,
      inProgressCount: inProgressTasks.length,
      incompleteCount: incompleteTasks.length,
      progressPercent,
      proofsCount,
      latestNote: latestNoteTask ? latestNoteTask.userNote : '',
      latestNoteTaskTitle: latestNoteTask ? latestNoteTask.title : '',
      latestNoteDate: latestNoteTask ? latestNoteTask.updatedAt : '',
      latestProof: latestNoteTask ? latestNoteTask.proofAttachment : '',
      tasks: userTasks,
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
  syncUserProgressSheet,
};
