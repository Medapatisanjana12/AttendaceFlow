const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const googleDriveService = require('./googleDriveService');
const {
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
  addAttachmentRecord,
  getAttachmentsByTaskId,
  getAttachmentById,
  deleteAttachmentRecord,
  getAllAttachments,
  getSetting,
  saveSetting,
} = require('./excelservice');

// Automatically load local .env if it exists
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const idx = trimmed.indexOf('=');
        if (idx !== -1) {
          const key = trimmed.slice(0, idx).trim();
          const val = trimmed.slice(idx + 1).trim().replace(/(^['"]|['"]$)/g, '');
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    });
  } catch (e) {
    console.warn('[server] Error reading .env file:', e.message);
  }
}

// Secure credential storage (isolated from tasks.xlsx to prevent workbook locking)
const CREDENTIALS_FILE = path.join(__dirname, '.credentials.json');

function loadStoredCredentials() {
  if (fs.existsSync(CREDENTIALS_FILE)) {
    try {
      const raw = fs.readFileSync(CREDENTIALS_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (data.GOOGLE_CLIENT_ID && !process.env.GOOGLE_CLIENT_ID) {
        process.env.GOOGLE_CLIENT_ID = data.GOOGLE_CLIENT_ID;
      }
      if (data.GOOGLE_CLIENT_SECRET && !process.env.GOOGLE_CLIENT_SECRET) {
        process.env.GOOGLE_CLIENT_SECRET = data.GOOGLE_CLIENT_SECRET;
      }
      if (data.GOOGLE_REDIRECT_URI && !process.env.GOOGLE_REDIRECT_URI) {
        process.env.GOOGLE_REDIRECT_URI = data.GOOGLE_REDIRECT_URI;
      }
      if (data.GOOGLE_DRIVE_ROOT_FOLDER_ID && !process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID) {
        process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = data.GOOGLE_DRIVE_ROOT_FOLDER_ID;
      }
      if (data.GOOGLE_REFRESH_TOKEN && !process.env.GOOGLE_REFRESH_TOKEN) {
        process.env.GOOGLE_REFRESH_TOKEN = data.GOOGLE_REFRESH_TOKEN;
      }
    } catch (err) {
      console.warn('[server] Failed reading .credentials.json:', err.message);
    }
  }

  // Ensure deterministic default redirect URI if not set
  if (!process.env.GOOGLE_REDIRECT_URI) {
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:5000/api/google-drive/callback';
  }
}
loadStoredCredentials();

function persistCredentials({ clientId, clientSecret, redirectUri, rootFolderId, refreshToken }) {
  if (clientId) process.env.GOOGLE_CLIENT_ID = clientId;
  if (clientSecret) process.env.GOOGLE_CLIENT_SECRET = clientSecret;
  if (redirectUri) process.env.GOOGLE_REDIRECT_URI = redirectUri;
  if (rootFolderId) process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = rootFolderId;
  if (refreshToken) process.env.GOOGLE_REFRESH_TOKEN = refreshToken;

  try {
    let existing = {};
    if (fs.existsSync(CREDENTIALS_FILE)) {
      try {
        existing = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
      } catch (_) {}
    }
    const updated = {
      ...existing,
      ...(clientId ? { GOOGLE_CLIENT_ID: clientId } : {}),
      ...(clientSecret ? { GOOGLE_CLIENT_SECRET: clientSecret } : {}),
      ...(redirectUri || process.env.GOOGLE_REDIRECT_URI ? { GOOGLE_REDIRECT_URI: redirectUri || process.env.GOOGLE_REDIRECT_URI } : {}),
      ...(rootFolderId ? { GOOGLE_DRIVE_ROOT_FOLDER_ID: rootFolderId } : {}),
      ...(refreshToken ? { GOOGLE_REFRESH_TOKEN: refreshToken } : {}),
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(updated, null, 2), 'utf8');
  } catch (err) {
    console.warn('[server] Could not save .credentials.json:', err.message);
  }

  try {
    const envFile = path.join(__dirname, '.env');
    let envContent = '';
    if (fs.existsSync(envFile)) {
      envContent = fs.readFileSync(envFile, 'utf8');
    }
    const updateEnv = (content, key, val) => {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(content)) {
        return content.replace(regex, `${key}=${val}`);
      }
      return content + (content.endsWith('\n') || !content ? '' : '\n') + `${key}=${val}\n`;
    };
    if (clientId) envContent = updateEnv(envContent, 'GOOGLE_CLIENT_ID', clientId);
    if (clientSecret) envContent = updateEnv(envContent, 'GOOGLE_CLIENT_SECRET', clientSecret);
    const rUri = redirectUri || process.env.GOOGLE_REDIRECT_URI;
    if (rUri) envContent = updateEnv(envContent, 'GOOGLE_REDIRECT_URI', rUri);
    if (rootFolderId) envContent = updateEnv(envContent, 'GOOGLE_DRIVE_ROOT_FOLDER_ID', rootFolderId);
    if (refreshToken) envContent = updateEnv(envContent, 'GOOGLE_REFRESH_TOKEN', refreshToken);
    fs.writeFileSync(envFile, envContent, 'utf8');
  } catch (err) {
    console.warn('[server] Could not update .env file:', err.message);
  }
}

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL, 'http://localhost:5173']
  : '*';

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH'],
  },
});

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// --- MULTER CONFIGURATION FOR ATTACHMENT UPLOADS ---
const storage = multer.memoryStorage();
const uploadAttachment = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.pdf', '.jpeg', '.jpg', '.png', '.webp', '.doc', '.docx', '.xls', '.xlsx'];
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedMimeTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];

    if (!allowedExtensions.includes(ext)) {
      return cb(
        new Error(`File format ${ext} is not supported. Permitted types: PDF, JPEG, PNG, WebP, DOC, DOCX, XLS, XLSX.`)
      );
    }

    if (!allowedMimeTypes.includes(file.mimetype) && file.mimetype !== 'application/octet-stream') {
      return cb(new Error(`Invalid file MIME type: ${file.mimetype}`));
    }

    cb(null, true);
  },
});

// --- SOCKET.IO REAL-TIME ROOMS ---
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join_room', async ({ role, email }) => {
    if (role === 'admin') {
      socket.join('admins');
      console.log('Admin joined admins room');
    } else if (email) {
      const userRoom = email.trim().toLowerCase();
      socket.join(userRoom);
      const user = await findUserByNameOrEmail(userRoom);
      if (user) {
        if (user.name) socket.join(user.name.trim().toLowerCase());
        if (user.username) socket.join(user.username.trim().toLowerCase());
      }
      console.log(`User joined room: ${userRoom} (Name: ${user?.name || 'n/a'})`);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});
app.patch('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, userNote, proofAttachment, adminFeedback, deadline, adminChecked } = req.body;

    if (
      status === undefined &&
      userNote === undefined &&
      proofAttachment === undefined &&
      adminFeedback === undefined &&
      deadline === undefined &&
      adminChecked === undefined
    ) {
      return res.status(400).json({
        error: 'No update information provided',
      });
    }

    const updates = {};

    if (status !== undefined) {
      updates.status = status;
    }

    if (userNote !== undefined) {
      updates.userNote = userNote;
    }

    if (proofAttachment !== undefined) {
      updates.proofAttachment = proofAttachment;
    }

    if (adminFeedback !== undefined) {
      updates.adminFeedback = adminFeedback;
    }

    if (deadline !== undefined) {
      updates.deadline = deadline;
    }

    if (adminChecked !== undefined) {
      updates.adminChecked = adminChecked;
    }

    const updatedTask = await updateTask(id, updates);

    if (!updatedTask) {
      return res.status(404).json({
        error: 'Task not found',
      });
    }

    // Notify Admin Dashboard
    io.to('admins').emit('status_updated', updatedTask);
    io.to('admins').emit('user_modules_updated');

    // Notify the assigned user
    const userRoom = String(updatedTask.assignedTo)
      .trim()
      .toLowerCase();

    io.to(userRoom).emit('status_updated', updatedTask);
    if (updatedTask.assignedToEmail) {
      io.to(updatedTask.assignedToEmail.toLowerCase()).emit('status_updated', updatedTask);
    }

    res.json(updatedTask);

  } catch (err) {
    console.error('Task update error:', err);

    res.status(500).json({
      error: 'Failed to update task in Excel',
    });
  }
});

app.post('/api/upload', (req, res) => {
  try {
    const { fileName, fileData } = req.body;
    if (!fileName || !fileData) {
      return res.status(400).json({ error: 'File name and file data are required' });
    }

    const base64Data = fileData.replace(/^data:[^;]+;base64,/, '');
    const cleanFileName = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const filePath = path.join(uploadsDir, cleanFileName);

    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

    const fileUrl = `/uploads/${cleanFileName}`;
    res.json({ url: fileUrl, fileName: cleanFileName });
  } catch (err) {
    console.error('File upload error:', err);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// --- AUTH ROUTES ---

app.post('/api/register', async (req, res) => {
  try {
    const { name, username, email, password, department } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    const user = await registerUser({ name, username, email, password, role: 'user', department: department || 'IT' });
    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Registration failed' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Please enter both email/username and password' });
    }

    const cleanIdentifier = String(email).trim().toLowerCase();
    const user = await findUserByNameOrEmail(cleanIdentifier);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email/username or password' });
    }

    const isMatch = await bcrypt.compare(String(password), user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email/username or password' });
    }

    res.json({ id: user.id, name: user.name, username: user.username, email: user.email, role: user.role });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed: ' + (err.message || 'Server error') });
  }
});

app.patch('/api/admin/credentials', async (req, res) => {
  try {
    const { currentEmail, name, newEmail, currentPassword, newPassword } = req.body;
    if (!currentEmail || !currentPassword) {
      return res.status(400).json({ error: 'Current email and current password are required' });
    }

    const updatedUser = await updateAdminCredentials({
      currentEmail,
      name,
      newEmail,
      currentPassword,
      newPassword,
    });

    res.json(updatedUser);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to update admin credentials' });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const users = await getAllUsers();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.get('/api/admin/user-modules', async (req, res) => {
  try {
    const modules = await getUserProgressModules();
    res.json(modules);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user progress modules' });
  }
});

app.get('/api/admin/attendance', async (req, res) => {
  try {
    const logs = await getAttendanceLogs();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch attendance logs' });
  }
});

app.post('/api/admin/employees', async (req, res) => {
  try {
    const {
      name,
      username,
      email,
      password,
      department,
      position,
      joiningDate,
      contactNumber,
      resume,
    } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    const user = await registerUser({
      name,
      username,
      email,
      password,
      role: 'user',
      department: department || 'IT',
      position: position || '',
      joiningDate: joiningDate || '',
      contactNumber: contactNumber || '',
      resume: resume || '',
    });

    io.to('admins').emit('user_modules_updated');
    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to add employee' });
  }
});

// --- TASK ROUTES ---

app.get('/api/tasks', async (req, res) => {
  try {
    const { role, email } = req.query;
    const allTasks = await getAllTasks();

    if (role === 'admin') {
      return res.json(allTasks);
    }

    if (!email) {
      return res.status(400).json({ error: 'User email or identifier is required' });
    }

    const user = await findUserByNameOrEmail(email);
    const targetEmail = String(email).trim().toLowerCase();
    const targetName = user?.name ? user.name.trim().toLowerCase() : '';
    const targetUsername = user?.username ? user.username.trim().toLowerCase() : '';

    const userTasks = allTasks.filter((t) => {
      const assigned = (t.assignedTo || '').trim().toLowerCase();
      const assignedEmail = (t.assignedToEmail || '').trim().toLowerCase();
      return (
        assigned === targetEmail ||
        assignedEmail === targetEmail ||
        (targetName && assigned === targetName) ||
        (targetUsername && assigned === targetUsername)
      );
    });
    res.json(userTasks);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load tasks from Excel' });
  }
});

app.post('/api/tasks', async (req, res) => {
  try {
    const { assignedTo, title, description, deadline, adminAttachment } = req.body;
    if (!assignedTo || !title) {
      return res.status(400).json({ error: 'Assigned user and title are required' });
    }

    const newTask = await addTask({
      assignedTo,
      title,
      description,
      deadline,
      adminAttachment: adminAttachment || '',
    });

    // Look up user to broadcast to their rooms
    const user = await findUserByNameOrEmail(assignedTo);
    if (user) {
      if (user.email) io.to(user.email).emit('task_assigned', newTask);
      if (user.username) io.to(user.username).emit('task_assigned', newTask);
      if (user.name) io.to(user.name.toLowerCase()).emit('task_assigned', newTask);
    }
    io.to(newTask.assignedTo.toLowerCase()).emit('task_assigned', newTask);
    io.to('admins').emit('task_assigned', newTask);
    io.to('admins').emit('user_modules_updated');

    res.status(201).json(newTask);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save task to Excel' });
  }
});

// ===================================================================
// ATTACHMENT MANAGEMENT ENDPOINTS (GOOGLE DRIVE & EXCEL WORKBOOK)
// ===================================================================

app.post('/api/attachments/upload', (req, res) => {
  uploadAttachment.single('file')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File size exceeds maximum permitted limit of 10 MB.' });
      }
      return res.status(400).json({ error: err.message || 'File upload validation failed' });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file was provided in the upload request' });
      }

      const { taskId, uploadDirection, uploadedBy, uploadedRole, description } = req.body;

      if (!taskId) {
        return res.status(400).json({ error: 'Task ID is required for attachment association' });
      }

      const direction = uploadDirection === 'Admin_to_User' ? 'Admin_to_User' : 'User_to_Admin';
      const role = uploadedRole === 'admin' ? 'admin' : 'user';

      // 1. Server-side Task Existence and Authorization Verification
      const allTasks = await getAllTasks();
      const task = allTasks.find((t) => String(t.id).trim() === String(taskId).trim());

      if (!task) {
        return res.status(404).json({ error: `Task with ID ${taskId} does not exist.` });
      }

      // 2. Role & Access Authorization Checks
      if (role === 'user') {
        const uEmail = String(uploadedBy || '').trim().toLowerCase();
        const assignedTarget = String(task.assignedTo || '').trim().toLowerCase();
        const assignedEmailTarget = String(task.assignedToEmail || '').trim().toLowerCase();

        // Verify that the task is assigned to this user
        if (uEmail !== assignedTarget && uEmail !== assignedEmailTarget) {
          const userObj = await findUserByNameOrEmail(uEmail);
          const userName = userObj?.name?.trim().toLowerCase();
          const userHandle = userObj?.username?.trim().toLowerCase();

          if (userName !== assignedTarget && userHandle !== assignedTarget) {
            return res.status(403).json({
              error: 'Access denied: You are only authorized to upload attachments for tasks assigned to you.',
            });
          }
        }
      }

      // 3. Upload File to Google Drive
      let driveResult;
      try {
        driveResult = await googleDriveService.uploadFile({
          buffer: req.file.buffer,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          uploadDirection: direction,
          taskId: String(taskId).trim(),
          description: description || '',
          uploadedBy: uploadedBy || (role === 'admin' ? 'Administrator' : 'Team Member'),
          uploadedRole: role,
        });
      } catch (driveErr) {
        console.error('Google Drive Upload Error:', driveErr);
        return res.status(502).json({
          error: 'Failed to upload document to Google Drive storage: ' + (driveErr.message || 'Drive API error'),
        });
      }

      // 4. Record Metadata in Excel Attachments Worksheet
      let record;
      try {
        record = await addAttachmentRecord({
          taskId: String(taskId).trim(),
          fileName: driveResult.fileName,
          originalFileName: req.file.originalname,
          fileType: driveResult.fileType || req.file.mimetype,
          fileSize: driveResult.fileSize || req.file.size,
          uploadedBy: uploadedBy || (role === 'admin' ? 'Administrator' : 'Team Member'),
          uploadedRole: role,
          uploadDirection: direction,
          googleDriveFileId: driveResult.googleDriveFileId,
          googleDriveFolderId: driveResult.googleDriveFolderId,
          description: description || '',
        });
      } catch (excelErr) {
        console.error('Excel metadata write error. Initiating Google Drive rollback:', excelErr);
        // Rollback: delete the uploaded file from Google Drive to avoid orphan
        try {
          await googleDriveService.deleteFile(driveResult.googleDriveFileId);
        } catch (delErr) {
          console.error('Google Drive file deletion during rollback failed:', delErr.message);
        }
        return res.status(500).json({ error: 'Failed to record attachment metadata in Excel workbook' });
      }

      // 5. Emit Real-Time Socket.io Updates
      io.to('admins').emit('attachment_uploaded', record);
      io.to('admins').emit('user_modules_updated');

      const assignedRoom = String(task.assignedTo).trim().toLowerCase();
      io.to(assignedRoom).emit('attachment_uploaded', record);
      if (task.assignedToEmail) {
        io.to(task.assignedToEmail.trim().toLowerCase()).emit('attachment_uploaded', record);
      }

      res.status(201).json(record);
    } catch (err) {
      console.error('Attachment upload handler error:', err);
      res.status(500).json({ error: 'Server error processing file attachment: ' + err.message });
    }
  });
});

app.get('/api/attachments', async (req, res) => {
  try {
    const { role, email } = req.query;
    const allAttachments = await getAllAttachments();

    if (role === 'admin') {
      return res.json(
        allAttachments.map((att) => ({
          ...att,
          id: att.attachmentId || att.id,
          createdAt: att.uploadedDate || att.createdAt,
        }))
      );
    }

    if (!email) {
      return res.status(400).json({ error: 'User email is required' });
    }

    const allTasks = await getAllTasks();
    const user = await findUserByNameOrEmail(email);
    const targetEmail = String(email).trim().toLowerCase();
    const targetName = user?.name ? user.name.trim().toLowerCase() : '';
    const targetUsername = user?.username ? user.username.trim().toLowerCase() : '';

    const userTaskMap = new Map();
    allTasks.forEach((t) => {
      const assigned = (t.assignedTo || '').trim().toLowerCase();
      const assignedEmail = (t.assignedToEmail || '').trim().toLowerCase();
      if (
        assigned === targetEmail ||
        assignedEmail === targetEmail ||
        (targetName && assigned === targetName) ||
        (targetUsername && assigned === targetUsername)
      ) {
        userTaskMap.set(String(t.id).trim(), t);
      }
    });

    const userAttachments = allAttachments
      .filter((att) => userTaskMap.has(String(att.taskId).trim()))
      .map((att) => {
        const parentTask = userTaskMap.get(String(att.taskId).trim());
        return {
          ...att,
          id: att.attachmentId || att.id,
          createdAt: att.uploadedDate || att.createdAt,
          taskTitle: parentTask?.title || '',
        };
      });

    res.json(userAttachments);
  } catch (err) {
    console.error('Error fetching user attachments:', err);
    res.status(500).json({ error: 'Failed to retrieve attachments' });
  }
});

app.get('/api/attachments/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { role, email } = req.query;

    if (!taskId) {
      return res.status(400).json({ error: 'Task ID is required' });
    }

    const allTasks = await getAllTasks();
    const task = allTasks.find((t) => String(t.id).trim() === String(taskId).trim());

    if (!task) {
      return res.status(404).json({ error: `Task ${taskId} not found` });
    }

    // Role-based task access verification
    if (role === 'user' && email) {
      const uEmail = String(email).trim().toLowerCase();
      const assignedTarget = String(task.assignedTo || '').trim().toLowerCase();
      const assignedEmailTarget = String(task.assignedToEmail || '').trim().toLowerCase();

      if (uEmail !== assignedTarget && uEmail !== assignedEmailTarget) {
        const userObj = await findUserByNameOrEmail(uEmail);
        const userName = userObj?.name?.trim().toLowerCase();
        const userHandle = userObj?.username?.trim().toLowerCase();

        if (userName !== assignedTarget && userHandle !== assignedTarget) {
          return res.status(403).json({ error: 'Access denied: You are not authorized to view attachments for this task.' });
        }
      }
    }

    const attachments = await getAttachmentsByTaskId(taskId);
    res.json(attachments);
  } catch (err) {
    console.error('Error fetching attachments:', err);
    res.status(500).json({ error: 'Failed to retrieve attachments from Excel' });
  }
});

app.get('/api/attachments/download/:attachmentId', async (req, res) => {
  try {
    const { attachmentId } = req.params;
    const { role, email } = req.query;

    if (!attachmentId) {
      return res.status(400).json({ error: 'Attachment ID is required' });
    }

    const attachment = await getAttachmentById(attachmentId);
    if (!attachment) {
      return res.status(404).json({ error: 'Attachment record not found' });
    }

    // Authorization verification
    const allTasks = await getAllTasks();
    const task = allTasks.find((t) => String(t.id).trim() === String(attachment.taskId).trim());

    if (role === 'user' && email && task) {
      const uEmail = String(email).trim().toLowerCase();
      const assignedTarget = String(task.assignedTo || '').trim().toLowerCase();
      const assignedEmailTarget = String(task.assignedToEmail || '').trim().toLowerCase();

      if (uEmail !== assignedTarget && uEmail !== assignedEmailTarget) {
        const userObj = await findUserByNameOrEmail(uEmail);
        const userName = userObj?.name?.trim().toLowerCase();
        const userHandle = userObj?.username?.trim().toLowerCase();

        if (userName !== assignedTarget && userHandle !== assignedTarget) {
          return res.status(403).json({ error: 'Access denied: You do not have permission to download this file.' });
        }
      }
    }

    const { stream, fileName, fileType, fileSize } = await googleDriveService.getDownloadStream(
      attachment.googleDriveFileId
    );

    const safeFilename = encodeURIComponent(attachment.originalFileName || fileName || 'document');
    res.setHeader('Content-Type', fileType || attachment.fileType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`
    );
    if (fileSize) {
      res.setHeader('Content-Length', fileSize);
    }

    stream.pipe(res);
    stream.on('error', (streamErr) => {
      console.error('Download stream error:', streamErr);
      if (!res.headersSent) {
        res.status(502).json({ error: 'Storage stream interrupted: ' + streamErr.message });
      }
    });
  } catch (err) {
    console.error('Download handler error:', err);
    res.status(500).json({ error: 'Failed to download file: ' + err.message });
  }
});

app.delete('/api/attachments/:attachmentId', async (req, res) => {
  try {
    const { attachmentId } = req.params;
    const role = (req.body && req.body.role) || req.query.role;
    const email = (req.body && req.body.email) || req.query.email;

    if (!attachmentId) {
      return res.status(400).json({ error: 'Attachment ID is required' });
    }

    const attachment = await getAttachmentById(attachmentId);
    if (!attachment) {
      return res.status(404).json({ error: 'Attachment record not found' });
    }

    const allTasks = await getAllTasks();
    const task = allTasks.find((t) => String(t.id).trim() === String(attachment.taskId).trim());

    // Security & Authorization Checks
    if (role === 'user') {
      if (!email) {
        return res.status(400).json({ error: 'User email is required to delete attachment' });
      }
      const uEmail = String(email).trim().toLowerCase();
      const uploader = String(attachment.uploadedBy || '').trim().toLowerCase();

      let isAuthorized = false;
      if (uEmail && uEmail === uploader) {
        isAuthorized = true;
      }

      const userObj = await findUserByNameOrEmail(uEmail);
      const userName = userObj?.name?.trim().toLowerCase();
      const userHandle = userObj?.username?.trim().toLowerCase();

      if (!isAuthorized && (userName === uploader || userHandle === uploader)) {
        isAuthorized = true;
      }

      // If not the uploader, check if this user is assigned to the task (allows deleting admin files for their task)
      if (!isAuthorized && task) {
        const assigned = String(task.assignedTo || '').trim().toLowerCase();
        const assignedEmail = String(task.assignedToEmail || '').trim().toLowerCase();

        if (
          assigned === uEmail ||
          assignedEmail === uEmail ||
          (userName && assigned === userName) ||
          (userHandle && assigned === userHandle)
        ) {
          isAuthorized = true;
        }
      }

      if (!isAuthorized) {
        return res.status(403).json({ error: 'Access denied: You can only delete attachments associated with your assigned tasks.' });
      }
    }

    // NOTE: Explicit user requirement: "and also these should store in drive even after deleting them in website"
    // We intentionally DO NOT delete the physical file from Google Drive, preserving it permanently in Drive storage!
    // We only remove the attachment record from the website (Excel Attachments worksheet).

    // Delete from Excel Attachments worksheet
    await deleteAttachmentRecord(attachmentId);

    // Emit real-time deletion notifications
    io.to('admins').emit('attachment_deleted', { attachmentId, taskId: attachment.taskId });
    if (task) {
      const assignedRoom = String(task.assignedTo).trim().toLowerCase();
      io.to(assignedRoom).emit('attachment_deleted', { attachmentId, taskId: attachment.taskId });
      if (task.assignedToEmail) {
        io.to(task.assignedToEmail.trim().toLowerCase()).emit('attachment_deleted', { attachmentId, taskId: attachment.taskId });
      }
    }

    res.json({
      success: true,
      message: 'Attachment removed from website successfully (retained in Google Drive)',
      attachmentId,
      storedInDrive: true
    });
  } catch (err) {
    console.error('Attachment deletion error:', err);
    res.status(500).json({ error: 'Failed to delete attachment: ' + err.message });
  }
});

// --- GOOGLE OAUTH2 & DRIVE STORAGE ROUTES ---

const oauthStates = new Map(); // state -> timestamp

function createOAuthState() {
  const state = crypto.randomBytes(24).toString('hex');
  oauthStates.set(state, Date.now());
  const now = Date.now();
  for (const [st, time] of oauthStates.entries()) {
    if (now - time > 15 * 60 * 1000) oauthStates.delete(st);
  }
  return state;
}

function validateOAuthState(state) {
  if (!state || !oauthStates.has(state)) return false;
  const time = oauthStates.get(state);
  oauthStates.delete(state);
  return Date.now() - time <= 15 * 60 * 1000;
}

/**
 * GET /api/google-drive/auth
 * Generates OAuth authorization URL with offline access, drive.file scope, and CSRF state validation.
 */
app.get('/api/google-drive/auth', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.warn('[OAuth Diagnostic] /api/google-drive/auth blocked: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing.');
    return res.status(400).json({
      error: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured in environment variables before authenticating with Google.',
    });
  }

  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    `${req.protocol}://${req.get('host')}/api/google-drive/callback`;

  const { google } = require('googleapis');
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );

  const state = createOAuthState();

  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/drive.file'],
    state,
  });

  const clientIdSuffix = process.env.GOOGLE_CLIENT_ID.slice(-25);
  const projNum = process.env.GOOGLE_CLIENT_ID.split('-')[0];
  console.log('[OAuth Diagnostic] /api/google-drive/auth generated:');
  console.log(`[OAuth Diagnostic] - Project Number: ${projNum}`);
  console.log(`[OAuth Diagnostic] - Client ID suffix: ...${clientIdSuffix}`);
  console.log(`[OAuth Diagnostic] - Client Secret loaded: true (length: ${process.env.GOOGLE_CLIENT_SECRET?.length || 0})`);
  console.log(`[OAuth Diagnostic] - Redirect URI in request: ${redirectUri}`);
  console.log(`[OAuth Diagnostic] - Scope: https://www.googleapis.com/auth/drive.file`);
  console.log(`[OAuth Diagnostic] - access_type: offline, prompt: consent, response_type: code`);
  console.log(`[OAuth Diagnostic] - State token: ${state.slice(0, 8)}... (expires in 15m)`);

  if (req.query.json === 'true' || req.headers.accept?.includes('application/json')) {
    return res.json({ authUrl, redirectUri, state });
  }

  res.redirect(authUrl);
});

// Backward-compatible alias for auth URL
app.get('/api/drive/auth-url', (req, res) => {
  res.redirect('/api/google-drive/auth?json=true');
});

/**
 * GET /api/google-drive/debug
 * Provides a safe, sanitized diagnostic view of the OAuth configuration and live status.
 */
app.get('/api/google-drive/debug', (req, res) => {
  const hasClientId = Boolean(process.env.GOOGLE_CLIENT_ID);
  const hasClientSecret = Boolean(process.env.GOOGLE_CLIENT_SECRET);
  const hasRefreshToken = Boolean(process.env.GOOGLE_REFRESH_TOKEN);
  const projNum = hasClientId ? process.env.GOOGLE_CLIENT_ID.split('-')[0] : null;
  const clientIdSuffix = hasClientId ? process.env.GOOGLE_CLIENT_ID.slice(-25) : null;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/google-drive/callback`;

  res.json({
    timestamp: new Date().toISOString(),
    isFullyConfigured: Boolean(hasClientId && hasClientSecret && hasRefreshToken),
    oauth: {
      hasClientId,
      projectNumber: projNum,
      clientIdMasked: hasClientId ? `${projNum}-...${clientIdSuffix}` : null,
      hasClientSecret,
      clientSecretLength: process.env.GOOGLE_CLIENT_SECRET ? process.env.GOOGLE_CLIENT_SECRET.length : 0,
      hasRefreshToken,
      redirectUri,
      requiredScope: 'https://www.googleapis.com/auth/drive.file',
      activeStateTokens: oauthStates.size,
    },
    googleDriveService: {
      clientInitialized: Boolean(googleDriveService.driveClient),
      rootFolderId: process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || '(Auto-resolve "Workly")',
    },
    quickChecks: {
      isGoogleDriveApiEnabled: 'Ensure Google Drive API is Enabled in Google Cloud Console under APIs & Services > Enabled APIs & services',
      isRedirectUriMatched: `Ensure "${redirectUri}" is added under Authorized redirect URIs in Google Cloud Console`,
      isTestUserAdded: 'If App Status is "Testing", ensure your Gmail account is added under OAuth consent screen > Test users',
    },
  });
});

/**
 * GET /api/google-drive/callback
 * Handles OAuth callback, validates state token, exchanges code for tokens, and persists refresh token.
 */
app.get('/api/google-drive/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  console.log('[OAuth Diagnostic] /api/google-drive/callback hit:');
  console.log(`[OAuth Diagnostic] - Has code: ${Boolean(code)} ${code ? `(length: ${code.length})` : ''}`);
  console.log(`[OAuth Diagnostic] - Has state: ${Boolean(state)}`);
  console.log(`[OAuth Diagnostic] - Has error: ${Boolean(error)}`);

  if (error) {
    console.error(`[OAuth Diagnostic] Google returned OAuth error: [${error}] - ${error_description || 'No description'}`);
    return res.status(400).send(`
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 650px; margin: 40px auto; padding: 28px; border: 1px solid #FECACA; border-radius: 12px; background: #FEF2F2;">
        <h2 style="color: #991B1B; margin-top: 0;">Google Authorization Denied: ${error}</h2>
        <p style="color: #7F1D1D; font-size: 15px;">Google returned the following OAuth error:</p>
        <div style="background: #FFFFFF; padding: 12px; border-radius: 6px; border: 1px solid #FCA5A5; font-family: monospace; color: #991B1B;">
          <strong>Error Code:</strong> ${error}<br/>
          <strong>Description:</strong> ${error_description || 'Access not granted or redirect mismatch.'}
        </div>
        <p style="margin-top: 20px;"><a href="/api/google-drive/auth" style="color: #F87524; font-weight: 600; text-decoration: none;">&larr; Try again</a></p>
      </div>
    `);
  }

  const isStateValid = validateOAuthState(state);
  console.log(`[OAuth Diagnostic] - State token validation passed: ${isStateValid}`);

  if (!state || !isStateValid) {
    console.warn('[OAuth Diagnostic] OAuth state token missing or expired.');
    return res.status(400).json({
      error: 'Invalid or expired OAuth state parameter. Potential CSRF detected. Please start authorization from /api/google-drive/auth.',
    });
  }

  if (!code) {
    console.warn('[OAuth Diagnostic] Authorization code missing from Google callback query.');
    return res.status(400).json({
      error: 'Missing authorization code parameter from Google.',
    });
  }

  try {
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI ||
      `${req.protocol}://${req.get('host')}/api/google-drive/callback`;

    console.log(`[OAuth Diagnostic] Exchanging code for tokens using redirectUri: ${redirectUri}`);

    const { google } = require('googleapis');
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    const { tokens } = await oauth2.getToken(code);
    console.log('[OAuth Diagnostic] Token exchange successfully completed:');
    console.log(`[OAuth Diagnostic] - Has access_token: ${Boolean(tokens.access_token)}`);
    console.log(`[OAuth Diagnostic] - Has refresh_token: ${Boolean(tokens.refresh_token)}`);
    console.log(`[OAuth Diagnostic] - Token scope: ${tokens.scope || 'none'}`);
    console.log(`[OAuth Diagnostic] - Token expiry: ${tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : 'unknown'}`);

    // Requirement 8: If Google does not return a new refresh token, preserve an existing valid refresh token
    const effectiveRefreshToken = tokens.refresh_token || process.env.GOOGLE_REFRESH_TOKEN;

    if (tokens.refresh_token) {
      persistCredentials({ refreshToken: tokens.refresh_token });
      console.log('[OAuth Diagnostic] New refresh token securely stored in .credentials.json and environment.');
    } else if (process.env.GOOGLE_REFRESH_TOKEN) {
      console.log('[OAuth Diagnostic] Google did not return a new refresh token; successfully preserved existing valid GOOGLE_REFRESH_TOKEN.');
    } else {
      console.warn('[OAuth Diagnostic] Warning: Google did not return a refresh token and no prior refresh token was stored.');
    }

    if (effectiveRefreshToken) {
      // Requirement 9: Configure the Google OAuth client with the stored refresh token
      googleDriveService.initClient(effectiveRefreshToken);

      // Automatically verify/create Workly folder hierarchy
      googleDriveService.ensureWorklyHierarchy().then((folders) => {
        console.log(`[OAuth Diagnostic] Google Drive Workly folder hierarchy ready: root=${folders?.rootFolderId}`);
      }).catch((hErr) => {
        console.warn('[server] Failed to auto-initialize Workly folder hierarchy:', hErr.message);
      });
    }

    // Immediately run testConnection to verify real Google Drive API request
    let liveTest = null;
    try {
      liveTest = await googleDriveService.testConnection();
      console.log(`[OAuth Diagnostic] Live Google Drive API verification: connected=${liveTest.connected}, status=${liveTest.status}`);
    } catch (testErr) {
      console.error('[OAuth Diagnostic] Live Google Drive API test encountered error:', testErr.message);
    }

    const isRender = Boolean(process.env.RENDER || process.env.IS_RENDER || process.env.RENDER_SERVICE_ID);

    if (req.headers.accept?.includes('application/json')) {
      return res.json({
        success: true,
        message: 'Google Drive connected successfully. Refresh token stored securely.',
        liveTest,
        render: isRender ? {
          persistentStrategy: 'Save GOOGLE_REFRESH_TOKEN in Render Dashboard > Environment to persist across redeployments.',
        } : null,
      });
    }

    res.send(`
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 650px; margin: 40px auto; padding: 28px; border: 1px solid #E2E8F0; border-radius: 14px; background: #FAF8F6; box-shadow: 0 4px 14px rgba(0,0,0,0.06);">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px;">
          <h2 style="color: #242052; margin: 0; font-size: 22px;">Workly &mdash; Google Drive Connected</h2>
        </div>
        <p style="color: #15803D; font-size: 15px; font-weight: 600; margin: 8px 0 16px;">
          &#10004; OAuth 2.0 authorization completed successfully!
        </p>
        <p style="color: #334155; font-size: 14px; line-height: 1.5;">
          ${liveTest?.connected ? 'Real Google Drive API request verified! Connected as: <strong>' + (liveTest.authenticatedUser || 'Authorized User') + '</strong>.' : 'The refresh token has been securely stored on the backend.'}
        </p>
        ${isRender ? `
        <div style="margin-top: 16px; padding: 14px; background: #EEF2FF; border: 1px solid #C7D2FE; border-radius: 8px;">
          <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: 700; color: #3730A3;">Render Production Note:</p>
          <p style="margin: 0; font-size: 12px; color: #4338CA; line-height: 1.5;">
            Google Drive is now active in this running container! Because Render containers have ephemeral storage across new Git deploys, add <code>GOOGLE_REFRESH_TOKEN</code> to your Render Dashboard Environment tab (<strong>Your Web Service &gt; Environment</strong>) to make it permanent across future redeployments.
          </p>
        </div>` : ''}
        <div style="margin-top: 20px; padding: 14px; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px;">
          <p style="margin: 0; font-size: 13px; color: #475569;">
            Verify live connection status:
            <br />
            <a href="/api/google-drive/test" style="color: #F87524; font-weight: 600; text-decoration: none;">/api/google-drive/test &rarr;</a>
          </p>
        </div>
      </div>
    `);
  } catch (err) {
    console.error('[OAuth Diagnostic] Failed to exchange authorization code:', err);
    res.status(500).send(`
      <div style="font-family: sans-serif; max-width: 600px; margin: 40px auto; padding: 24px; border: 1px solid #FECACA; border-radius: 12px; background: #FEF2F2;">
        <h2 style="color: #991B1B;">Failed to Exchange Authorization Code</h2>
        <p>${err.message}</p>
        <p><a href="/api/google-drive/auth">Click here to retry</a></p>
      </div>
    `);
  }
});

// Backward-compatible alias for /oauth2callback
app.get('/oauth2callback', (req, res) => {
  const query = new URLSearchParams(req.query).toString();
  res.redirect(`/api/google-drive/callback?${query}`);
});

/**
 * GET /api/google-drive/test
 * Protected test endpoint verifying credentials, refresh token, API connectivity, and Workly folders.
 */
app.get('/api/google-drive/test', async (req, res) => {
  try {
    loadStoredCredentials();
    const result = await googleDriveService.testConnection();
    const statusCode = result.connected ? 200 : 400;
    res.status(statusCode).json(result);
  } catch (err) {
    res.status(500).json({
      connected: false,
      status: 'error',
      message: 'Unexpected error during Google Drive connectivity test: ' + err.message,
    });
  }
});

/**
 * GET /api/google-drive/status
 * Quick non-blocking status check for UI badges.
 */
app.get('/api/google-drive/status', (req, res) => {
  loadStoredCredentials();
  const hasClientId = Boolean(process.env.GOOGLE_CLIENT_ID);
  const hasClientSecret = Boolean(process.env.GOOGLE_CLIENT_SECRET);
  const hasRefreshToken = Boolean(process.env.GOOGLE_REFRESH_TOKEN);
  const isConfigured = hasClientId && hasClientSecret && hasRefreshToken;

  res.json({
    connected: isConfigured,
    hasCredentials: hasClientId && hasClientSecret,
    hasRefreshToken,
    rootFolderId: process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || null,
  });
});

/**
 * POST /api/google-drive/configure
 * Saves Client ID and Secret, updates Excel Settings & .env, and returns the Google Auth URL.
 */
app.post('/api/google-drive/configure', async (req, res) => {
  try {
    const userRole = req.headers['x-user-role'] || req.body.userRole || req.body.role;
    if (userRole && userRole !== 'admin') {
      return res.status(403).json({ error: 'Access denied: Only administrators can configure Google Drive integration.' });
    }

    const { clientId, clientSecret, rootFolderId } = req.body;
    if (!clientId || !clientSecret) {
      return res.status(400).json({ error: 'Client ID and Client Secret are required.' });
    }

    const cleanClientId = clientId.trim();
    const cleanClientSecret = clientSecret.trim();
    const cleanRootFolderId = (rootFolderId || '').trim();

    process.env.GOOGLE_CLIENT_ID = cleanClientId;
    process.env.GOOGLE_CLIENT_SECRET = cleanClientSecret;
    if (cleanRootFolderId) {
      process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = cleanRootFolderId;
    }

    // Persist credentials securely to process.env, .credentials.json, and .env (NO writes to tasks.xlsx)
    persistCredentials({
      clientId: cleanClientId,
      clientSecret: cleanClientSecret,
      rootFolderId: cleanRootFolderId,
    });

    googleDriveService.reloadCredentials();

    // Generate OAuth Authorization URL
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI ||
      `${req.protocol}://${req.get('host')}/api/google-drive/callback`;

    const { google } = require('googleapis');
    const oauth2 = new google.auth.OAuth2(
      cleanClientId,
      cleanClientSecret,
      redirectUri
    );

    const state = createOAuthState();
    const authUrl = oauth2.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/drive.file'],
      state,
    });

    res.json({
      success: true,
      message: 'Credentials configured. Please complete authorization in Google.',
      authUrl,
    });
  } catch (err) {
    console.error('Failed to configure Google Drive credentials:', err);
    res.status(500).json({ error: 'Failed to configure credentials: ' + err.message });
  }
});

const frontendDist = path.join(__dirname, '../frontend/vite-project/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(frontendDist, 'index.html'));
    }
    next();
  });
}

const PORT = process.env.PORT || 5000;
initExcel().then(async () => {
  // 1. Load Google Drive credentials from secure storage (.credentials.json / .env)
  loadStoredCredentials();

  // 2. Backward-compatible fallback: check Settings sheet only if still missing
  try {
    if (!process.env.GOOGLE_REFRESH_TOKEN) {
      const refreshToken = await getSetting('GOOGLE_REFRESH_TOKEN');
      if (refreshToken) process.env.GOOGLE_REFRESH_TOKEN = refreshToken;
    }
    if (!process.env.GOOGLE_CLIENT_ID) {
      const clientId = await getSetting('GOOGLE_CLIENT_ID');
      if (clientId) process.env.GOOGLE_CLIENT_ID = clientId;
    }
    if (!process.env.GOOGLE_CLIENT_SECRET) {
      const clientSecret = await getSetting('GOOGLE_CLIENT_SECRET');
      if (clientSecret) process.env.GOOGLE_CLIENT_SECRET = clientSecret;
    }
    if (!process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID) {
      const rootFolderId = await getSetting('GOOGLE_DRIVE_ROOT_FOLDER_ID');
      if (rootFolderId) process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = rootFolderId;
    }

    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN) {
      googleDriveService.initClient();
      console.log('[server] Google Drive client initialized from stored credentials.');
    }
  } catch (err) {
    console.warn('[server] Error checking stored Google settings:', err.message);
  }

  server.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
  });
});
