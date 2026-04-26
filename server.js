const express = require('express');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const initSqlJs = require('sql.js');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

let db;
const DB_PATH = './school_duty.db';

async function initDB() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  
  db.run(`CREATE TABLE IF NOT EXISTS users (
      nombor_daftar TEXT PRIMARY KEY NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT DEFAULT 'student',
      class TEXT,
      rank TEXT DEFAULT 'member',
      password TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  try { db.run("ALTER TABLE users ADD COLUMN password TEXT"); } catch(e) {}
  
  db.run(`CREATE TABLE IF NOT EXISTS duties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombor_daftar TEXT NOT NULL,
      event_name TEXT NOT NULL,
      start_time DATETIME NOT NULL,
      end_time DATETIME NOT NULL,
      hours REAL,
      status TEXT DEFAULT 'pending',
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  try { db.run("ALTER TABLE duties ADD COLUMN reason TEXT"); } catch(e) {}
  
  db.run(`CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombor_daftar TEXT NOT NULL,
      message TEXT NOT NULL,
      read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS slides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_url TEXT NOT NULL,
      title TEXT,
      link TEXT
    )`);
  
  saveDB();
}

function saveDB() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function query(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function run(sql, params = []) {
  db.run(sql, params);
  saveDB();
}

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({ secret: 'school-duty-tracker-2024', resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy({
  usernameField: 'nombor_daftar',
  passwordField: 'password'
}, (nombor_daftar, password, done) => {
  const users = query('SELECT * FROM users WHERE nombor_daftar = ?', [nombor_daftar]);
  if (users.length === 0) return done(null, false, { message: 'User not found' });
  const user = users[0];
  if (user.role === 'admin') {
    if (!password || user.password !== password) return done(null, false, { message: 'Incorrect password' });
  }
  return done(null, user);
}));

passport.serializeUser((user, done) => done(null, user.nombor_daftar));
passport.deserializeUser((nombor_daftar, done) => {
  const users = query('SELECT * FROM users WHERE nombor_daftar = ?', [nombor_daftar]);
  done(null, users[0] || null);
});

app.get('/', (req, res) => res.redirect('/login'));
app.get('/login', (req, res) => res.render('login', { error: null }));

app.post('/login', (req, res, next) => {
  const { nombor_daftar } = req.body;
  if (!nombor_daftar) return res.render('login', { error: 'Please enter nombor daftar' });
  const users = query('SELECT * FROM users WHERE nombor_daftar = ?', [nombor_daftar]);
  if (users.length === 0) return res.render('login', { error: 'User not found' });
  const user = users[0];
  if (user.role === 'admin' && !req.body.password) {
    return res.render('login', { error: null, requirePassword: true, nombor_daftar: nombor_daftar });
  }
  if (user.role !== 'admin') {
    return req.logIn(user, (err) => { if (err) return next(err); return res.redirect('/dashboard'); });
  }
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.render('login', { error: info.message, requirePassword: true, nombor_daftar: nombor_daftar });
    req.logIn(user, (err) => { if (err) return next(err); return res.redirect('/dashboard'); });
  })(req, res, next);
});

app.get('/logout', (req, res) => { req.logout(() => res.redirect('/login')); });

function checkAuth(req, res, next) { if (req.isAuthenticated()) return next(); res.redirect('/login'); }

app.get('/dashboard', checkAuth, (req, res) => {
  const year = req.query.year || 'all';
  const allDuties = query('SELECT * FROM duties WHERE nombor_daftar = ? ORDER BY created_at DESC', [req.user.nombor_daftar]);
  let duties = allDuties;
  if (year !== 'all') duties = allDuties.filter(d => new Date(d.start_time).getFullYear() == year);
  const allYears = [...new Set(allDuties.map(d => new Date(d.start_time).getFullYear()))].sort();
  const notifications = query('SELECT * FROM notifications WHERE nombor_daftar = ? ORDER BY created_at DESC LIMIT 10', [req.user.nombor_daftar]);
  const slides = query('SELECT * FROM slides ORDER BY id');
  res.render('dashboard', { user: req.user, duties: duties, currentYear: year, allYears: allYears, notifications: notifications, slides: slides });
});

app.post('/add-duty', checkAuth, (req, res) => {
  const { event_name, start_time, end_time } = req.body;
  const start = new Date(start_time), end = new Date(end_time);
  const hours = (end - start) / (1000 * 60 * 60);
  run('INSERT INTO duties (nombor_daftar, event_name, start_time, end_time, hours) VALUES (?, ?, ?, ?, ?)', [req.user.nombor_daftar, event_name, start.toISOString(), end.toISOString(), hours]);
  res.redirect('/dashboard');
});

app.post('/update-status/:id', checkAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
  const { status, reason } = req.body;
  run('UPDATE duties SET status = ?, reason = ? WHERE id = ?', [status, reason || null, req.params.id]);
  const duty = query('SELECT * FROM duties WHERE id = ?', [req.params.id])[0];
  const today = new Date().toLocaleDateString('en-MY');
  const msg = status === 'approved' 
    ? '[' + today + '] Your duty "' + duty.event_name + '" has been approved. Hours recorded: ' + duty.hours.toFixed(1) + ' hrs.'
    : '[' + today + '] Your duty "' + duty.event_name + '" was reviewed and requires revision. Reason: ' + (reason || 'Not specified.');
  run('INSERT INTO notifications (nombor_daftar, message) VALUES (?, ?)', [duty.nombor_daftar, msg]);
  res.json({ success: true });
});

app.post('/notifications/read', checkAuth, (req, res) => {
  run('UPDATE notifications SET read = 1 WHERE nombor_daftar = ?', [req.user.nombor_daftar]);
  res.json({ success: true });
});

app.post('/notifications/clear', checkAuth, (req, res) => {
  run('DELETE FROM notifications WHERE nombor_daftar = ?', [req.user.nombor_daftar]);
  res.json({ success: true });
});

app.get('/admin', checkAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.redirect('/dashboard');
  const year = req.query.year || 'all';
  const allRecords = query('SELECT d.*, u.full_name, u.class FROM duties d JOIN users u ON d.nombor_daftar = u.nombor_daftar ORDER BY d.created_at DESC');
  let records = allRecords;
  if (year !== 'all') records = allRecords.filter(r => new Date(r.start_time).getFullYear() == year);
  const allYears = [...new Set(allRecords.map(r => new Date(r.start_time).getFullYear()))].sort();
  res.render('admin', { user: req.user, records: records, currentYear: year, allYears: allYears });
});

app.get('/admin/students', checkAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.redirect('/dashboard');
  const students = query('SELECT * FROM users ORDER BY class DESC, full_name ASC');
  res.render('admin-students', { user: req.user, students: students });
});

app.get('/admin/student/:nd', checkAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.redirect('/dashboard');
  const students = query('SELECT * FROM users WHERE nombor_daftar = ?', [req.params.nd]);
  if (students.length === 0) return res.redirect('/admin/students');
  const year = req.query.year || 'all';
  const allDuties = query('SELECT * FROM duties WHERE nombor_daftar = ? ORDER BY created_at DESC', [req.params.nd]);
  let duties = allDuties;
  if (year !== 'all') duties = allDuties.filter(d => new Date(d.start_time).getFullYear() == year);
  const allYears = [...new Set(allDuties.map(d => new Date(d.start_time).getFullYear()))].sort();
  res.render('admin-student-duties', { user: req.user, student: students[0], duties: duties, currentYear: year, allYears: allYears });
});

app.get('/admin/slides', checkAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.redirect('/dashboard');
  const slides = query('SELECT * FROM slides ORDER BY id');
  res.render('admin-slides', { user: req.user, slides: slides });
});

app.post('/api/slides/add', checkAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
  const { image_url, title } = req.body;
  run('INSERT INTO slides (image_url, title) VALUES (?, ?)', [image_url, title || '']);
  res.json({ success: true });
});

app.post('/api/slides/delete/:id', checkAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
  run('DELETE FROM slides WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

app.post('/delete-duty/:id', checkAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
  run('DELETE FROM duties WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

app.get('/health', (req, res) => res.send('OK'));

app.get('/debug/db', (req, res) => {
  const users = query('SELECT nombor_daftar, full_name, role, class, rank FROM users');
  const duties = query('SELECT * FROM duties ORDER BY created_at DESC LIMIT 20');
  res.json({ users, duties });
});

app.get('/admin/student/:nd/export', checkAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.redirect('/dashboard');
  const students = query('SELECT * FROM users WHERE nombor_daftar = ?', [req.params.nd]);
  if (students.length === 0) return res.redirect('/admin/students');
  const student = students[0];
  const allDuties = query('SELECT * FROM duties WHERE nombor_daftar = ? ORDER BY created_at ASC', [req.params.nd]);
  const duties = allDuties.filter(d => d.status === 'approved');

  let csv = `Nombor Daftar:,${student.nombor_daftar},Name:,${student.full_name},Class:,${student.class || ''}\n\n`;
  csv += 'No.,Event,Duration (hrs),Date\n';
  
  duties.forEach((d, i) => {
    const date = new Date(d.start_time);
    const day = String(date.getDate()).padStart(2,'0');
    const month = String(date.getMonth() + 1).padStart(2,'0');
    const year = date.getFullYear();
    csv += `${i + 1},${d.event_name},${(d.hours || 0).toFixed(1)},${day}/${month}/${year}\n`;
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=${student.full_name}_duties.csv`);
  res.send(csv);
});

initDB().then(() => app.listen(PORT, () => console.log('✅ http://localhost:' + PORT)));