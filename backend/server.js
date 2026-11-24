const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const {
  initExcel,
  findUserByEmail,
  registerUser,
  getAllTasks,
  addTask,
  updateTask,
} = require('./excelservice');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST', 'PATCH'],
  },
});

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

// --- SOCKET.IO REAL-TIME ROOMS ---
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join_room', ({ role, email }) => {
    if (role === 'admin') {
      socket.join('admins');
      console.log('Admin joined admins room');
    } else if (email) {
      const userRoom = email.trim().toLowerCase();
      socket.join(userRoom);
      console.log(`User joined room: ${userRoom}`);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});
app.patch('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, userNote } = req.body;

    if (status === undefined && userNote === undefined) {
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

    const updatedTask = await updateTask(id, updates);

    if (!updatedTask) {
      return res.status(404).json({
        error: 'Task not found',
      });
    }

    // Notify Admin Dashboard
    io.to('admins').emit('status_updated', updatedTask);

    // Notify the assigned user
    const userRoom = String(updatedTask.assignedTo)
      .trim()
      .toLowerCase();

    io.to(userRoom).emit('status_updated', updatedTask);

    res.json(updatedTask);

  } catch (err) {
    console.error('Task update error:', err);

    res.status(500).json({
      error: 'Failed to update task in Excel',
    });
  }
});

// --- AUTH ROUTES ---

app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    const user = await registerUser({ name, email, password, role: 'user' });
    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Registration failed' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
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
      return res.status(400).json({ error: 'User email is required' });
    }

    const userTasks = allTasks.filter(
      (t) => t.assignedTo === email.trim().toLowerCase()
    );
    res.json(userTasks);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load tasks from Excel' });
  }
});

app.post('/api/tasks', async (req, res) => {
  try {
    const { assignedTo, title, description } = req.body;
    if (!assignedTo || !title) {
      return res.status(400).json({ error: 'Assigned user and title are required' });
    }

    const newTask = await addTask({ assignedTo, title, description });

    io.to(newTask.assignedTo).emit('task_assigned', newTask);
    io.to('admins').emit('task_assigned', newTask);

    res.status(201).json(newTask);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save task to Excel' });
  }
});

const PORT = 5000;
initExcel().then(() => {
  server.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
  });
});
