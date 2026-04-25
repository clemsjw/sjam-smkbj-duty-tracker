const express = require('express');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const sqlite3 = require('sqlite3').verbose();
const SQLiteStore = require('connect-sqlite3')(session);

const app = express();
const PORT = 3000;

const db = new sqlite3.Database('./school_duty.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
      ic_number TEXT PRIMARY KEY NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT DEFAULT 'student',
      class TEXT,
      rank TEXT DEFAULT 'member',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  db.run(`CREATE TABLE IF NOT EXISTS duties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_ic TEXT NOT NULL,
    event_name TEXT NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    hours REAL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  store: new SQLiteStore({ db: 'sessions.db' }),
  secret: 'school-duty-tracker-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));
app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy({
  usernameField: 'ic_number',
  passwordField: 'ic_number'
}, (ic_number, password, done) => {
  db.get('SELECT * FROM users WHERE ic_number = ?', [ic_number], (err, user) => {
    if (err) return done(err);
    if (!user) return done(null, false, { message: 'User not found' });
    return done(null, user);
  });
}));

passport.serializeUser((user, done) => {
  done(null, user.ic_number);
});

passport.deserializeUser((ic_number, done) => {
  db.get('SELECT * FROM users WHERE ic_number = ?', [ic_number], (err, user) => {
    done(err, user);
  });
});

app.get('/', (req, res) => res.redirect('/login'));
app.get('/login', (req, res) => res.render('login', { error: null }));

app.post('/login', passport.authenticate('local', {
  successRedirect: '/dashboard',
  failureRedirect: '/login'
}));

app.get('/logout', (req, res) => {
  req.logout(() => res.redirect('/login'));
});

function checkAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/login');
}

app.get('/dashboard', checkAuth, (req, res) => {
  db.all('SELECT * FROM duties WHERE user_ic = ? ORDER BY created_at DESC',
    [req.user.ic_number], (err, duties) => {
      res.render('dashboard', { user: req.user, duties: duties || [] });
    });
});

app.post('/add-duty', checkAuth, (req, res) => {
  const { event_name, start_time, end_time } = req.body;
  const start = new Date(start_time);
  const end = new Date(end_time);
  const hours = (end - start) / (1000 * 60 * 60);
  db.run('INSERT INTO duties (user_ic, event_name, start_time, end_time, hours) VALUES (?, ?, ?, ?, ?)',
    [req.user.ic_number, event_name, start_time, end_time, hours],
    (err) => {
      if (err) console.error(err);
      res.redirect('/dashboard');
    });
});

app.post('/update-status/:id', checkAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
  db.run('UPDATE duties SET status = ? WHERE id = ?', [req.body.status, req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.get('/admin', checkAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.redirect('/dashboard');
  db.all(`SELECT d.*, u.full_name, u.class FROM duties d JOIN users u ON d.user_ic = u.ic_number ORDER BY d.created_at DESC`, (err, records) => {
    res.render('admin', { user: req.user, records: records || [] });
  });
});

app.get('/admin/students', checkAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.redirect('/dashboard');
  db.all('SELECT * FROM users WHERE role = "student" ORDER BY full_name', (err, students) => {
    res.render('admin-students', { user: req.user, students: students || [] });
  });
});

app.get('/admin/student/:ic', checkAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.redirect('/dashboard');
  db.get('SELECT * FROM users WHERE ic_number = ?', [req.params.ic], (err, student) => {
    if (err || !student) return res.redirect('/admin/students');
    db.all('SELECT * FROM duties WHERE user_ic = ? ORDER BY created_at DESC', [req.params.ic], (err, duties) => {
      res.render('admin-student-duties', { user: req.user, student: student, duties: duties || [] });
    });
  });
});

app.post('/delete-duty/:id', checkAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
  db.run('DELETE FROM duties WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.listen(PORT, () => {
  console.log('✅ http://localhost:' + PORT);
});