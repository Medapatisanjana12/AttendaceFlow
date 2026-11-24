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

async function initExcel() {
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
    ];

    // Sheet 2: Users
    const userSheet = workbook.addWorksheet('Users');
    userSheet.columns = [
      { header: 'id', key: 'id', width: 20 },
      { header: 'name', key: 'name', width: 25 },
      { header: 'email', key: 'email', width: 30 },
      { header: 'passwordHash', key: 'passwordHash', width: 65 },
      { header: 'role', key: 'role', width: 15 },
    ];

    // Seed default Admin account
    const defaultAdminHash = await bcrypt.hash('admin123', 10);
    userSheet.addRow(['1', 'System Admin', 'admin@company.com', defaultAdminHash, 'admin']);

    await workbook.xlsx.writeFile(FILE_PATH);
    console.log('Created tasks.xlsx with Tasks and Users sheets');
  } else {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(FILE_PATH);
      const taskSheet = workbook.getWorksheet('Tasks');
      if (taskSheet && taskSheet.getCell(1, 7).value !== 'userNote') {
        taskSheet.getCell(1, 7).value = 'userNote';
        taskSheet.getColumn(7).width = 40;
        await workbook.xlsx.writeFile(FILE_PATH);
      }
    } catch (e) {
      console.error('Error verifying existing tasks.xlsx header:', e);
    }
  }
}

// --- USER AUTH FUNCTIONS ---

async function findUserByEmail(email) {
  await initExcel();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(FILE_PATH);
  const sheet = workbook.getWorksheet('Users');
  let foundUser = null;

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const rowEmail = row.getCell(3).value?.toString().toLowerCase();
    if (rowEmail === email.trim().toLowerCase()) {
      foundUser = {
        id: row.getCell(1).value?.toString(),
        name: row.getCell(2).value?.toString(),
        email: rowEmail,
        passwordHash: row.getCell(4).value?.toString(),
        role: row.getCell(5).value?.toString(),
      };
    }
  });
  return foundUser;
}

function registerUser({ name, email, password, role = 'user' }) {
  return enqueueWrite(async () => {
    const existing = await findUserByEmail(email);
    if (existing) {
      throw new Error('Email already registered');
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(FILE_PATH);
    const sheet = workbook.getWorksheet('Users');

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = {
      id: Date.now().toString(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role,
    };

    sheet.addRow([newUser.id, newUser.name, newUser.email, passwordHash, newUser.role]);
    await workbook.xlsx.writeFile(FILE_PATH);
    return newUser;
  });
}

// --- TASK FUNCTIONS ---

async function getAllTasks() {
  await initExcel();

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(FILE_PATH);

  const sheet = workbook.getWorksheet('Tasks');
  const tasks = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    tasks.push({
      id: row.getCell(1).value?.toString(),
      assignedTo: row.getCell(2).value?.toString(),
      title: row.getCell(3).value?.toString(),
      description: row.getCell(4).value?.toString() || '',
      status: row.getCell(5).value?.toString(),
      updatedAt: row.getCell(6).value?.toString(),
      userNote: row.getCell(7).value?.toString() || '',
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

    const newTask = {
  id: Date.now().toString(),
  assignedTo: taskData.assignedTo.trim().toLowerCase(),
  title: taskData.title,
  description: taskData.description || '',
  status: 'Pending',
  updatedAt: new Date().toLocaleString(),
  userNote: '',
};

    sheet.addRow([
  newTask.id,
  newTask.assignedTo,
  newTask.title,
  newTask.description,
  newTask.status,
  newTask.updatedAt,
  newTask.userNote,
]);

    await workbook.xlsx.writeFile(FILE_PATH);
    return newTask;
  });
}

function updateTask(taskId, { status, userNote }) {
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
        row.getCell(6).value = new Date().toLocaleString();

        updatedTask = {
          id: row.getCell(1).value?.toString(),
          assignedTo: row.getCell(2).value?.toString(),
          title: row.getCell(3).value?.toString(),
          description: row.getCell(4).value?.toString() || '',
          status: row.getCell(5).value?.toString(),
          updatedAt: row.getCell(6).value?.toString(),
          userNote: row.getCell(7).value?.toString() || '',
        };
      }
    });

    if (updatedTask) {
      await workbook.xlsx.writeFile(FILE_PATH);
    }
    return updatedTask;
  });
}


module.exports = {
  initExcel,
  findUserByEmail,
  registerUser,
  getAllTasks,
  addTask,
  updateTask,
};
