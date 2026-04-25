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
  
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      nombor_daftar TEXT PRIMARY KEY NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT DEFAULT 'student',
      class TEXT,
      rank TEXT DEFAULT 'member',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS duties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombor_daftar TEXT NOT NULL,
      event_name TEXT NOT NULL,
      start_time DATETIME NOT NULL,
      end_time DATETIME NOT NULL,
      hours REAL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
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
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
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
app.use(session({
  secret: 'school-duty-tracker-2024',
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy({
  usernameField: 'nombor_daftar',
  passwordField: 'nombor_daftar'
}, (nombor_daftar, password, done) => {
  const users = query('SELECT * FROM users WHERE nombor_daftar = ?', [nombor_daftar]);
  if (users.length === 0) return done(null, false);
  return done(null, users[0]);
}));

passport.serializeUser((user, done) => done(null, user.nombor_daftar));
passport.deserializeUser((nombor_daftar, done) => {
  const users = query('SELECT * FROM users WHERE nombor_daftar = ?', [nombor_daftar]);
  done(null, users[0] || null);
});

app.get('/', (req, res) => res.redirect('/login'));
app.get('/login', (req, res) => res.render('login', { error: null }));
app.post('/login', passport.authenticate('local', { successRedirect: '/dashboard', failureRedirect: '/login' }));
app.get('/logout', (req, res) => { req.logout(() => res.redirect('/login')); });

function checkAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/login');
}

app.get('/dashboard', checkAuth, (req, res) => {
  const duties = query('SELECT * FROM duties WHERE nombor_daftar = ? ORDER BY created_at DESC', [req.user.nombor_daftar]);
  res.render('dashboard', { user: req.user, duties: duties });
});

app.post('/add-duty', checkAuth, (req, res) => {
  const { event_name, start_time, end_time } = req.body;
  const start = new Date(start_time);
  const end = new Date(end_time);
  const hours = (end - start) / (1000 * 60 * 60);
  run('INSERT INTO duties (nombor_daftar, event_name, start_time, end_time, hours) VALUES (?, ?, ?, ?, ?)', [req.user.nombor_daftar, event_name, start_time.toISOString(), end_time.toISOString(), hours]);
  res.redirect('/dashboard');
});

app.post('/update-status/:id', checkAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
  run('UPDATE duties SET status = ? WHERE id = ?', [req.body.status, req.params.id]);
  res.json({ success: true });
});

app.get('/admin', checkAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.redirect('/dashboard');
  const records = query('SELECT d.*, u.full_name, u.class FROM duties d JOIN users u ON d.nombor_daftar = u.nombor_daftar ORDER BY d.created_at DESC');
  res.render('admin', { user: req.user, records: records });
});

app.get('/admin/students', checkAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.redirect('/dashboard');
  const students = query('SELECT * FROM users ORDER BY full_name');
  res.render('admin-students', { user: req.user, students: students });
});

app.get('/admin/student/:nd', checkAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.redirect('/dashboard');
  const students = query('SELECT * FROM users WHERE nombor_daftar = ?', [req.params.nd]);
  if (students.length === 0) return res.redirect('/admin/students');
  const duties = query('SELECT * FROM duties WHERE nombor_daftar = ? ORDER BY created_at DESC', [req.params.nd]);
  res.render('admin-student-duties', { user: req.user, student: students[0], duties: duties });
});

app.post('/delete-duty/:id', checkAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
  run('DELETE FROM duties WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

app.get('/health', (req, res) => res.send('OK'));

initDB().then(() => {
  app.listen(PORT, () => console.log('✅ http://localhost:' + PORT));
});