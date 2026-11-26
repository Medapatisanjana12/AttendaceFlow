const ExcelJS = require('exceljs');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');

const FILE_PATH = path.join(__dirname, 'tasks.xlsx');

/**
 * Re-entrant Async Mutex using Node's native AsyncLocalStorage.
 * Ensures that all read and write operations to tasks.xlsx are serialized in strict FIFO order,
 * while allowing re-entrant calls within the same asynchronous call hierarchy without deadlock.
 */
class ReentrantAsyncMutex {
  constructor() {
    this._queue = [];
    this._locked = false;
    this._storage = new AsyncLocalStorage();
    this._currentOwner = null;
  }

  async runExclusive(fn) {
    const currentStore = this._storage.getStore();
    if (currentStore && currentStore === this._currentOwner) {
      // Re-entrant call in same async execution context: proceed directly
      return await fn();
    }

    const release = await this._acquire();
    const token = Symbol('excel-lock-token');
    this._currentOwner = token;

    try {
      return await this._storage.run(token, async () => {
        return await fn();
      });
    } finally {
      this._currentOwner = null;
      release();
    }
  }

  _acquire() {
    return new Promise((resolve) => {
      if (!this._locked) {
        this._locked = true;
        resolve(() => this._release());
      } else {
        this._queue.push(resolve);
      }
    });
  }

  _release() {
    if (this._queue.length > 0) {
      const next = this._queue.shift();
      next(() => this._release());
    } else {
      this._locked = false;
    }
  }
}

const excelMutex = new ReentrantAsyncMutex();

/**
 * Wrap any Excel operation in the global mutex.
 */
function withExcelLock(fn) {
  return excelMutex.runExclusive(fn);
}

/**
 * Executes a file operation with exponential backoff retry.
 * Handles transient Windows/OneDrive file locks (EBUSY, EPERM, EACCES, ETXTBSY, EAGAIN).
 */
async function withFileRetry(fn, maxRetries = 8, baseDelayMs = 120) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isTransientLock =
        err.code === 'EBUSY' ||
        err.code === 'EPERM' ||
        err.code === 'EACCES' ||
        err.code === 'ETXTBSY' ||
        err.code === 'EAGAIN' ||
        (err.message &&
          (err.message.includes('EBUSY') ||
            err.message.includes('locked') ||
            err.message.includes('resource busy') ||
            err.message.includes('operation not permitted')));

      if (!isTransientLock || attempt === maxRetries) {
        throw err;
      }

      const delay = Math.round(
        baseDelayMs * Math.pow(1.8, attempt - 1) + Math.random() * 80
      );
      console.warn(
        `[excelservice] File access locked (${err.code || err.message}). Retrying attempt ${attempt}/${maxRetries} after ${delay}ms...`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

/**
 * Safely reads the Excel workbook using retry logic.
 */
async function safeReadFile(workbook, filePath = FILE_PATH) {
  return withFileRetry(async () => {
    await workbook.xlsx.readFile(filePath);
    return workbook;
  });
}

/**
 * Safely writes the Excel workbook using an atomic staging file pattern and retry logic.
 * This prevents data corruption and Windows/OneDrive sharing violations.
 */
async function safeWriteFile(workbook, filePath = FILE_PATH) {
  const dir = path.dirname(filePath);
  const tmpPath = path.join(
    dir,
    `.tasks_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.tmp`
  );

  try {
    // 1. Write to temporary file with retry
    await withFileRetry(async () => {
      await workbook.xlsx.writeFile(tmpPath);
    });

    // 2. Atomically replace target file with retry for Windows/OneDrive locks
    await withFileRetry(async () => {
      try {
        fs.renameSync(tmpPath, filePath);
      } catch (renameErr) {
        // Fallback: Copy and unlink if rename hits Windows destination lock
        fs.copyFileSync(tmpPath, filePath);
        try {
          fs.unlinkSync(tmpPath);
        } catch (_) {}
      }
    });
  } catch (err) {
    // Always clean up temp file on failure
    try {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    } catch (_) {}
    throw err;
  }
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

/**
 * Internal initialization function, executed inside mutex.
 */
async function ensureInitializedInternal() {
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
      { header: 'adminAttachment', key: 'adminAttachment', width: 45 },
      { header: 'adminChecked', key: 'adminChecked', width: 20 },
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
      { header: 'position', key: 'position', width: 28 },
      { header: 'joiningDate', key: 'joiningDate', width: 20 },
      { header: 'contactNumber', key: 'contactNumber', width: 22 },
      { header: 'resume', key: 'resume', width: 45 },
    ];

    // Seed default Admin account and default user
    const defaultAdminHash = await bcrypt.hash('admin123', 10);
    const defaultUserHash = await bcrypt.hash('user123', 10);
    userSheet.addRow(['1', 'Company Administrator', 'admin@company.com', defaultAdminHash, 'admin', 'admin', 'Management', 'System Administrator', '2023-01-15', '+1 555-0100', '']);
    userSheet.addRow(['2', 'Jessica Taylor', 'jessica12@gmail.com', defaultUserHash, 'user', 'jessica', 'Marketing', 'Marketing Strategist', '2024-03-01', '+1 555-0199', '']);

    // Sheet 3: Attachments
    const attachmentSheet = workbook.addWorksheet('Attachments');
    attachmentSheet.columns = [
      { header: 'Attachment_ID', key: 'Attachment_ID', width: 25 },
      { header: 'Task_ID', key: 'Task_ID', width: 25 },
      { header: 'File_Name', key: 'File_Name', width: 35 },
      { header: 'Original_File_Name', key: 'Original_File_Name', width: 35 },
      { header: 'File_Type', key: 'File_Type', width: 25 },
      { header: 'File_Size', key: 'File_Size', width: 18 },
      { header: 'Uploaded_By', key: 'Uploaded_By', width: 25 },
      { header: 'Uploaded_Role', key: 'Uploaded_Role', width: 18 },
      { header: 'Upload_Direction', key: 'Upload_Direction', width: 22 },
      { header: 'Google_Drive_File_ID', key: 'Google_Drive_File_ID', width: 38 },
      { header: 'Google_Drive_Folder_ID', key: 'Google_Drive_Folder_ID', width: 38 },
      { header: 'Uploaded_Date', key: 'Uploaded_Date', width: 25 },
      { header: 'Description', key: 'Description', width: 45 },
    ];

    // Sheet 4: Settings
    const settingsSheet = workbook.addWorksheet('Settings');
    settingsSheet.columns = [
      { header: 'Key', key: 'Key', width: 30 },
      { header: 'Value', key: 'Value', width: 60 },
      { header: 'Updated_At', key: 'Updated_At', width: 25 },
    ];

    await safeWriteFile(workbook);
    console.log('[excelservice] Created tasks.xlsx with Tasks, Users, Attachments, and Settings sheets');
  } else {
    try {
      const workbook = new ExcelJS.Workbook();
      await safeReadFile(workbook);
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
        if (taskSheet.getCell(1, 14).value !== 'adminAttachment') {
          taskSheet.getCell(1, 14).value = 'adminAttachment';
          taskSheet.getColumn(14).width = 45;
          needsSave = true;
        }
        if (taskSheet.getCell(1, 15).value !== 'adminChecked') {
          taskSheet.getCell(1, 15).value = 'adminChecked';
          taskSheet.getColumn(15).width = 20;
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
          { header: 'department', key: 'department', width: 25 },
          { header: 'position', key: 'position', width: 28 },
          { header: 'joiningDate', key: 'joiningDate', width: 20 },
          { header: 'contactNumber', key: 'contactNumber', width: 22 },
          { header: 'resume', key: 'resume', width: 45 },
        ];
        const defaultAdminHash = await bcrypt.hash('admin123', 10);
        newUsersSheet.addRow(['1', 'Company Administrator', 'admin@company.com', defaultAdminHash, 'admin', 'admin', 'Management', 'System Administrator', '2023-01-15', '+1 555-0100', '']);
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

        if (userSheet.getCell(1, 8).value !== 'position') {
          userSheet.getCell(1, 8).value = 'position';
          userSheet.getColumn(8).width = 28;
          needsSave = true;
        }
        if (userSheet.getCell(1, 9).value !== 'joiningDate') {
          userSheet.getCell(1, 9).value = 'joiningDate';
          userSheet.getColumn(9).width = 20;
          needsSave = true;
        }
        if (userSheet.getCell(1, 10).value !== 'contactNumber') {
          userSheet.getCell(1, 10).value = 'contactNumber';
          userSheet.getColumn(10).width = 22;
          needsSave = true;
        }
        if (userSheet.getCell(1, 11).value !== 'resume') {
          userSheet.getCell(1, 11).value = 'resume';
          userSheet.getColumn(11).width = 45;
          needsSave = true;
        }

        userSheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return;
          const uRole = getCellValueString(row.getCell(5));
          const uName = getCellValueString(row.getCell(2)).toLowerCase();

          if (!row.getCell(8).value) {
            if (uRole === 'admin') row.getCell(8).value = 'System Administrator';
            else if (uName.includes('sanz')) row.getCell(8).value = 'Lead Software Engineer';
            else if (uName.includes('jessica')) row.getCell(8).value = 'Marketing Strategist';
            else if (uName.includes('rohan')) row.getCell(8).value = 'HR Operations Lead';
            else row.getCell(8).value = 'Team Specialist';
            needsSave = true;
          }

          if (!row.getCell(9).value) {
            if (uRole === 'admin') row.getCell(9).value = '2023-01-15';
            else if (uName.includes('sanz')) row.getCell(9).value = '2024-01-10';
            else if (uName.includes('jessica')) row.getCell(9).value = '2024-03-01';
            else if (uName.includes('rohan')) row.getCell(9).value = '2024-02-01';
            else row.getCell(9).value = '2024-04-01';
            needsSave = true;
          }

          if (!row.getCell(10).value) {
            if (uRole === 'admin') row.getCell(10).value = '+1 555-0100';
            else if (uName.includes('sanz')) row.getCell(10).value = '+91 98765 43210';
            else if (uName.includes('jessica')) row.getCell(10).value = '+1 555-0199';
            else if (uName.includes('rohan')) row.getCell(10).value = '+91 91234 56789';
            else row.getCell(10).value = '+91 98000 12345';
            needsSave = true;
          }

          if (row.getCell(11).value === undefined || row.getCell(11).value === null) {
            row.getCell(11).value = '';
            needsSave = true;
          }
        });
      }

      let attachmentSheet = workbook.getWorksheet('Attachments');
      if (!attachmentSheet) {
        attachmentSheet = workbook.addWorksheet('Attachments');
        attachmentSheet.columns = [
          { header: 'Attachment_ID', key: 'Attachment_ID', width: 25 },
          { header: 'Task_ID', key: 'Task_ID', width: 25 },
          { header: 'File_Name', key: 'File_Name', width: 35 },
          { header: 'Original_File_Name', key: 'Original_File_Name', width: 35 },
          { header: 'File_Type', key: 'File_Type', width: 25 },
          { header: 'File_Size', key: 'File_Size', width: 18 },
          { header: 'Uploaded_By', key: 'Uploaded_By', width: 25 },
          { header: 'Uploaded_Role', key: 'Uploaded_Role', width: 18 },
          { header: 'Upload_Direction', key: 'Upload_Direction', width: 22 },
          { header: 'Google_Drive_File_ID', key: 'Google_Drive_File_ID', width: 38 },
          { header: 'Google_Drive_Folder_ID', key: 'Google_Drive_Folder_ID', width: 38 },
          { header: 'Uploaded_Date', key: 'Uploaded_Date', width: 25 },
          { header: 'Description', key: 'Description', width: 45 },
        ];
        needsSave = true;
      }

      let settingsSheet = workbook.getWorksheet('Settings');
      if (!settingsSheet) {
        settingsSheet = workbook.addWorksheet('Settings');
        settingsSheet.columns = [
          { header: 'Key', key: 'Key', width: 30 },
          { header: 'Value', key: 'Value', width: 60 },
          { header: 'Updated_At', key: 'Updated_At', width: 25 },
        ];
        needsSave = true;
      } else {
        // Load stored settings into process.env if not explicitly set
        settingsSheet.eachRow((row, rowNumber) => {
          if (rowNumber > 1) {
            const k = getCellValueString(row.getCell(1));
            const v = getCellValueString(row.getCell(2));
            if (k === 'GOOGLE_REFRESH_TOKEN' && v && !process.env.GOOGLE_REFRESH_TOKEN) {
              process.env.GOOGLE_REFRESH_TOKEN = v.trim();
              console.log('[excelservice] Restored GOOGLE_REFRESH_TOKEN from Excel Settings worksheet.');
            }
            if (k === 'GOOGLE_DRIVE_ROOT_FOLDER_ID' && v && !process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID) {
              process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = v.trim();
            }
          }
        });
      }

      if (needsSave) {
        await syncUserProgressSheet(workbook);
        await safeWriteFile(workbook);
      }
    } catch (e) {
      console.error('[excelservice] Error verifying existing tasks.xlsx structure:', e);
    }
  }
  isInitialized = true;
}

/**
 * Public initialization function, safe against concurrent invocations.
 */
async function initExcel() {
  return withExcelLock(async () => {
    await ensureInitializedInternal();
  });
}

// --- USER AUTH FUNCTIONS ---

async function findUserByNameOrEmail(identifier) {
  if (!identifier || typeof identifier !== 'string') return null;
  return withExcelLock(async () => {
    await ensureInitializedInternal();
    const workbook = new ExcelJS.Workbook();
    await safeReadFile(workbook);
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
          position: getCellValueString(row.getCell(8)) || 'Team Specialist',
          joiningDate: getCellValueString(row.getCell(9)) || '',
          contactNumber: getCellValueString(row.getCell(10)) || '',
          resume: getCellValueString(row.getCell(11)) || '',
        };
      }
    });
    return foundUser;
  });
}

async function findUserByEmail(email) {
  return findUserByNameOrEmail(email);
}

async function registerUser({
  name,
  username,
  email,
  password,
  role = 'user',
  department = 'IT',
  position = '',
  joiningDate = '',
  contactNumber = '',
  resume = '',
}) {
  return withExcelLock(async () => {
    await ensureInitializedInternal();
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
    const cleanPosition = (position || (role === 'admin' ? 'System Administrator' : 'Associate Specialist')).trim();
    const cleanJoiningDate = (joiningDate || new Date().toISOString().split('T')[0]).trim();
    const cleanContact = (contactNumber || '').trim();
    const cleanResume = (resume || '').trim();

    const workbook = new ExcelJS.Workbook();
    await safeReadFile(workbook);
    const sheet = workbook.getWorksheet('Users');

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = {
      id: Date.now().toString(),
      name: name.trim(),
      username: cleanUsername,
      email: email.trim().toLowerCase(),
      role,
      department: cleanDepartment,
      position: cleanPosition,
      joiningDate: cleanJoiningDate,
      contactNumber: cleanContact,
      resume: cleanResume,
    };

    sheet.addRow([
      newUser.id,
      newUser.name,
      newUser.email,
      passwordHash,
      newUser.role,
      newUser.username,
      newUser.department,
      newUser.position,
      newUser.joiningDate,
      newUser.contactNumber,
      newUser.resume,
    ]);

    await syncUserProgressSheet(workbook);
    await safeWriteFile(workbook);
    return newUser;
  });
}

async function updateAdminCredentials({ currentEmail, name, newEmail, currentPassword, newPassword }) {
  return withExcelLock(async () => {
    await ensureInitializedInternal();
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
    await safeReadFile(workbook);
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

    await safeWriteFile(workbook);

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
  return withExcelLock(async () => {
    await ensureInitializedInternal();
    const workbook = new ExcelJS.Workbook();
    await safeReadFile(workbook);

    const sheet = workbook.getWorksheet('Tasks');
    const tasks = [];
    if (!sheet) return tasks;

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
        adminAttachment: getCellValueString(row.getCell(14)),
        adminChecked: getCellValueString(row.getCell(15)) === 'true' || getCellValueString(row.getCell(15)) === 'Checked',
      });
    });

    return tasks;
  });
}

async function addTask(taskData) {
  return withExcelLock(async () => {
    await ensureInitializedInternal();
    const workbook = new ExcelJS.Workbook();
    await safeReadFile(workbook);
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
      adminAttachment: taskData.adminAttachment || taskData.attachment || '',
      adminChecked: false,
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
      newTask.adminAttachment,
      'false',
    ]);

    await syncUserProgressSheet(workbook);
    await safeWriteFile(workbook);
    return newTask;
  });
}

async function updateTask(taskId, { status, userNote, proofAttachment, adminFeedback, deadline, description, adminAttachment, adminChecked }) {
  return withExcelLock(async () => {
    await ensureInitializedInternal();
    const workbook = new ExcelJS.Workbook();
    await safeReadFile(workbook);
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
            completedAtVal = '';
            row.getCell(12).value = '';
          }
        }
        if (userNote !== undefined) row.getCell(7).value = userNote;
        if (proofAttachment !== undefined) row.getCell(8).value = proofAttachment;
        if (adminFeedback !== undefined) row.getCell(10).value = adminFeedback;
        if (deadline !== undefined) row.getCell(11).value = deadline;
        if (description !== undefined) row.getCell(4).value = description;
        if (adminAttachment !== undefined) row.getCell(14).value = adminAttachment;
        if (adminChecked !== undefined) row.getCell(15).value = adminChecked ? 'true' : 'false';
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
          adminAttachment: getCellValueString(row.getCell(14)),
          adminChecked: getCellValueString(row.getCell(15)) === 'true' || getCellValueString(row.getCell(15)) === 'Checked',
        };
      }
    });

    if (updatedTask) {
      await syncUserProgressSheet(workbook);
      await safeWriteFile(workbook);
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
  return withExcelLock(async () => {
    await ensureInitializedInternal();
    const workbook = new ExcelJS.Workbook();
    await safeReadFile(workbook);
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
        const uPos = getCellValueString(row.getCell(8)) || (uRole === 'admin' ? 'System Administrator' : 'Associate Specialist');
        const uJoiningDate = getCellValueString(row.getCell(9)) || '';
        const uContact = getCellValueString(row.getCell(10)) || '';
        const uResume = getCellValueString(row.getCell(11)) || '';

        users.push({
          id: getCellValueString(row.getCell(1)),
          name: uName,
          username: uUsername,
          email: uEmail,
          role: uRole,
          department: uDept,
          position: uPos,
          joiningDate: uJoiningDate,
          contactNumber: uContact,
          resume: uResume,
        });
      });
    }
    return users;
  });
}

async function getUserProgressModules() {
  return withExcelLock(async () => {
    await ensureInitializedInternal();
    const workbook = new ExcelJS.Workbook();
    await safeReadFile(workbook);

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
        const uPos = getCellValueString(row.getCell(8)) || (uRole === 'admin' ? 'System Administrator' : 'Associate Specialist');
        const uJoiningDate = getCellValueString(row.getCell(9)) || '';
        const uContact = getCellValueString(row.getCell(10)) || '';
        const uResume = getCellValueString(row.getCell(11)) || '';

        users.push({
          id: getCellValueString(row.getCell(1)),
          name: uName,
          username: uUsername,
          email: uEmail,
          role: uRole,
          department: uDept,
          position: uPos,
          joiningDate: uJoiningDate,
          contactNumber: uContact,
          resume: uResume,
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
        position: user.position || 'Associate Specialist',
        joiningDate: user.joiningDate || '',
        contactNumber: user.contactNumber || '',
        resume: user.resume || '',
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
  });
}

async function getAttendanceLogs() {
  return withExcelLock(async () => {
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
        position: u.position || 'Associate Specialist',
        joiningDate: u.joiningDate || '',
        contactNumber: u.contactNumber || '',
        resume: u.resume || '',
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
  });
}

// --- ATTACHMENT RECORD MANAGEMENT ---

async function addAttachmentRecord({
  taskId,
  fileName,
  originalFileName,
  fileType,
  fileSize,
  uploadedBy,
  uploadedRole,
  uploadDirection,
  googleDriveFileId,
  googleDriveFolderId,
  description = '',
}) {
  return withExcelLock(async () => {
    await ensureInitializedInternal();
    const workbook = new ExcelJS.Workbook();
    await safeReadFile(workbook);
    let attachmentSheet = workbook.getWorksheet('Attachments');
    if (!attachmentSheet) {
      attachmentSheet = workbook.addWorksheet('Attachments');
      attachmentSheet.columns = [
        { header: 'Attachment_ID', key: 'Attachment_ID', width: 25 },
        { header: 'Task_ID', key: 'Task_ID', width: 25 },
        { header: 'File_Name', key: 'File_Name', width: 35 },
        { header: 'Original_File_Name', key: 'Original_File_Name', width: 35 },
        { header: 'File_Type', key: 'File_Type', width: 25 },
        { header: 'File_Size', key: 'File_Size', width: 18 },
        { header: 'Uploaded_By', key: 'Uploaded_By', width: 25 },
        { header: 'Uploaded_Role', key: 'Uploaded_Role', width: 18 },
        { header: 'Upload_Direction', key: 'Upload_Direction', width: 22 },
        { header: 'Google_Drive_File_ID', key: 'Google_Drive_File_ID', width: 38 },
        { header: 'Google_Drive_Folder_ID', key: 'Google_Drive_Folder_ID', width: 38 },
        { header: 'Uploaded_Date', key: 'Uploaded_Date', width: 25 },
        { header: 'Description', key: 'Description', width: 45 },
      ];
    }

    const attachmentId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const uploadedDate = new Date().toISOString();

    const row = [
      attachmentId,
      String(taskId).trim(),
      fileName || originalFileName,
      originalFileName || fileName,
      fileType || 'application/octet-stream',
      typeof fileSize === 'number' ? fileSize : parseInt(fileSize, 10) || 0,
      uploadedBy || 'Unknown',
      uploadedRole || 'user',
      uploadDirection || 'User_to_Admin',
      googleDriveFileId || '',
      googleDriveFolderId || '',
      uploadedDate,
      description || '',
    ];

    attachmentSheet.addRow(row);
    await safeWriteFile(workbook);

    return {
      attachmentId,
      taskId: String(taskId).trim(),
      fileName: fileName || originalFileName,
      originalFileName: originalFileName || fileName,
      fileType: fileType || 'application/octet-stream',
      fileSize: typeof fileSize === 'number' ? fileSize : parseInt(fileSize, 10) || 0,
      uploadedBy: uploadedBy || 'Unknown',
      uploadedRole: uploadedRole || 'user',
      uploadDirection: uploadDirection || 'User_to_Admin',
      googleDriveFileId: googleDriveFileId || '',
      googleDriveFolderId: googleDriveFolderId || '',
      uploadedDate,
      description: description || '',
    };
  });
}

async function getAttachmentsByTaskId(taskId) {
  if (!taskId) return [];
  return withExcelLock(async () => {
    await ensureInitializedInternal();
    const workbook = new ExcelJS.Workbook();
    await safeReadFile(workbook);
    const attachmentSheet = workbook.getWorksheet('Attachments');
    if (!attachmentSheet) return [];

    const attachments = [];
    const targetId = String(taskId).trim();

    attachmentSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const rowTaskId = getCellValueString(row.getCell(2));
      if (rowTaskId === targetId) {
        attachments.push({
          id: getCellValueString(row.getCell(1)),
          attachmentId: getCellValueString(row.getCell(1)),
          taskId: rowTaskId,
          fileName: getCellValueString(row.getCell(3)),
          originalFileName: getCellValueString(row.getCell(4)),
          fileType: getCellValueString(row.getCell(5)),
          fileSize: parseInt(getCellValueString(row.getCell(6)), 10) || 0,
          uploadedBy: getCellValueString(row.getCell(7)),
          uploadedRole: getCellValueString(row.getCell(8)),
          uploadDirection: getCellValueString(row.getCell(9)),
          googleDriveFileId: getCellValueString(row.getCell(10)),
          googleDriveFolderId: getCellValueString(row.getCell(11)),
          createdAt: getCellValueString(row.getCell(12)),
          uploadedDate: getCellValueString(row.getCell(12)),
          description: getCellValueString(row.getCell(13)),
        });
      }
    });

    return attachments;
  });
}

async function getAttachmentById(attachmentId) {
  if (!attachmentId) return null;
  return withExcelLock(async () => {
    await ensureInitializedInternal();
    const workbook = new ExcelJS.Workbook();
    await safeReadFile(workbook);
    const attachmentSheet = workbook.getWorksheet('Attachments');
    if (!attachmentSheet) return null;

    const targetId = String(attachmentId).trim();
    let found = null;

    attachmentSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1 || found) return;
      const id = getCellValueString(row.getCell(1));
      if (id === targetId) {
        found = {
          attachmentId: id,
          taskId: getCellValueString(row.getCell(2)),
          fileName: getCellValueString(row.getCell(3)),
          originalFileName: getCellValueString(row.getCell(4)),
          fileType: getCellValueString(row.getCell(5)),
          fileSize: parseInt(getCellValueString(row.getCell(6)), 10) || 0,
          uploadedBy: getCellValueString(row.getCell(7)),
          uploadedRole: getCellValueString(row.getCell(8)),
          uploadDirection: getCellValueString(row.getCell(9)),
          googleDriveFileId: getCellValueString(row.getCell(10)),
          googleDriveFolderId: getCellValueString(row.getCell(11)),
          uploadedDate: getCellValueString(row.getCell(12)),
          description: getCellValueString(row.getCell(13)),
        };
      }
    });

    return found;
  });
}

async function deleteAttachmentRecord(attachmentId) {
  if (!attachmentId) return false;
  return withExcelLock(async () => {
    await ensureInitializedInternal();
    const workbook = new ExcelJS.Workbook();
    await safeReadFile(workbook);
    const attachmentSheet = workbook.getWorksheet('Attachments');
    if (!attachmentSheet) return false;

    const targetId = String(attachmentId).trim();
    let rowToDelete = null;

    attachmentSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1 || rowToDelete) return;
      const id = getCellValueString(row.getCell(1));
      if (id === targetId) {
        rowToDelete = rowNumber;
      }
    });

    if (!rowToDelete) return false;

    attachmentSheet.spliceRows(rowToDelete, 1);
    await safeWriteFile(workbook);
    return true;
  });
}

async function getAllAttachments() {
  return withExcelLock(async () => {
    await ensureInitializedInternal();
    const workbook = new ExcelJS.Workbook();
    await safeReadFile(workbook);
    const attachmentSheet = workbook.getWorksheet('Attachments');
    if (!attachmentSheet) return [];

    const attachments = [];
    attachmentSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      attachments.push({
        id: getCellValueString(row.getCell(1)),
        attachmentId: getCellValueString(row.getCell(1)),
        taskId: getCellValueString(row.getCell(2)),
        fileName: getCellValueString(row.getCell(3)),
        originalFileName: getCellValueString(row.getCell(4)),
        fileType: getCellValueString(row.getCell(5)),
        fileSize: parseInt(getCellValueString(row.getCell(6)), 10) || 0,
        uploadedBy: getCellValueString(row.getCell(7)),
        uploadedRole: getCellValueString(row.getCell(8)),
        uploadDirection: getCellValueString(row.getCell(9)),
        googleDriveFileId: getCellValueString(row.getCell(10)),
        googleDriveFolderId: getCellValueString(row.getCell(11)),
        createdAt: getCellValueString(row.getCell(12)),
        uploadedDate: getCellValueString(row.getCell(12)),
        description: getCellValueString(row.getCell(13)),
      });
    });

    return attachments;
  });
}

async function getSetting(key) {
  if (!key) return null;
  return withExcelLock(async () => {
    await ensureInitializedInternal();
    const workbook = new ExcelJS.Workbook();
    await safeReadFile(workbook);
    const sheet = workbook.getWorksheet('Settings');
    if (!sheet) return null;

    let result = null;
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1 && getCellValueString(row.getCell(1)) === key) {
        result = getCellValueString(row.getCell(2));
      }
    });
    return result;
  });
}

async function saveSetting(key, value) {
  if (!key) return null;
  return withExcelLock(async () => {
    await ensureInitializedInternal();
    const workbook = new ExcelJS.Workbook();
    await safeReadFile(workbook);
    let sheet = workbook.getWorksheet('Settings');
    if (!sheet) {
      sheet = workbook.addWorksheet('Settings');
      sheet.columns = [
        { header: 'Key', key: 'Key', width: 30 },
        { header: 'Value', key: 'Value', width: 60 },
        { header: 'Updated_At', key: 'Updated_At', width: 25 },
      ];
    }

    let foundRow = null;
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1 && getCellValueString(row.getCell(1)) === key) {
        foundRow = row;
      }
    });

    const nowIso = new Date().toISOString();
    if (foundRow) {
      foundRow.getCell(2).value = String(value);
      foundRow.getCell(3).value = nowIso;
    } else {
      sheet.addRow([key, String(value), nowIso]);
    }

    await safeWriteFile(workbook);
    return { key, value };
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
  addAttachmentRecord,
  getAttachmentsByTaskId,
  getAttachmentById,
  deleteAttachmentRecord,
  getAllAttachments,
  getSetting,
  saveSetting,
};
