const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
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
} = require('./excelservice');

const app = express();
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
    const { status, userNote, proofAttachment, adminFeedback, deadline } = req.body;

    if (
      status === undefined &&
      userNote === undefined &&
      proofAttachment === undefined &&
      adminFeedback === undefined &&
      deadline === undefined
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
    const { name, username, email, password, department } = req.body;
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
    const { assignedTo, title, description, deadline } = req.body;
    if (!assignedTo || !title) {
      return res.status(400).json({ error: 'Assigned user and title are required' });
    }

    const newTask = await addTask({ assignedTo, title, description, deadline });

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
initExcel().then(() => {
  server.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
  });
});
