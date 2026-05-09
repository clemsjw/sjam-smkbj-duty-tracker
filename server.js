const express = require('express');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const { createClient } = require('@libsql/client');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

const storage = multer.diskStorage({
  destination: './public/uploads/',
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

const db = createClient({
  url: 'libsql://smkbj-duty-clemsjw.aws-ap-northeast-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzcyNjA4ODYsImlkIjoiMDE5ZGNkMDAtOTcwMS03MTBmLTg5OWYtNzAzNzEwMDk0MGZmIiwicmlkIjoiYzY3NWU0ZmEtMWRkYy00MmYwLWJlZjItZmRhMDU1MDgwOTg1In0.6Z3_P17frFZmELIf9hw1azY9s1KypZXbzoFrt4S43IHj77VNoXAWdm3g927HU9dndBgbBD8oDKA2TODHQNQECQ'
});

async function initDB() {
  await db.execute(`CREATE TABLE IF NOT EXISTS users (nombor_daftar TEXT PRIMARY KEY NOT NULL, full_name TEXT NOT NULL, role TEXT DEFAULT 'student', class TEXT, rank TEXT DEFAULT 'member', password TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await db.execute(`CREATE TABLE IF NOT EXISTS duties (id INTEGER PRIMARY KEY AUTOINCREMENT, nombor_daftar TEXT NOT NULL, event_name TEXT NOT NULL, start_time DATETIME NOT NULL, end_time DATETIME NOT NULL, hours REAL, status TEXT DEFAULT 'pending', reason TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, action_at DATETIME)`);
  await db.execute(`CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, nombor_daftar TEXT NOT NULL, message TEXT NOT NULL, read INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await db.execute(`CREATE TABLE IF NOT EXISTS slides (id INTEGER PRIMARY KEY AUTOINCREMENT, image_url TEXT NOT NULL, title TEXT, link TEXT)`);
  try { await db.execute("ALTER TABLE duties ADD COLUMN action_at DATETIME"); } catch(e) {}
}

async function query(sql, params = []) { const r = await db.execute({ sql, args: params }); return r.rows; }
async function run(sql, params = []) { await db.execute({ sql, args: params }); }

function malaysiaTime() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const myt = new Date(utc + (8 * 3600000));
  const y = myt.getFullYear();
  const m = String(myt.getMonth() + 1).padStart(2, '0');
  const d = String(myt.getDate()).padStart(2, '0');
  const h = String(myt.getHours()).padStart(2, '0');
  const min = String(myt.getMinutes()).padStart(2, '0');
  const s = String(myt.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${min}:${s}`;
}

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({ secret: 'school-duty-tracker-2024', resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy({ usernameField: 'nombor_daftar', passwordField: 'password' }, async (nombor_daftar, password, done) => {
  const users = await query('SELECT * FROM users WHERE nombor_daftar = ?', [nombor_daftar]);
  if (users.length === 0) return done(null, false, { message: 'User not found' });
  const user = users[0];
  if (user.role === 'admin' && (!password || user.password !== password)) return done(null, false, { message: 'Incorrect password' });
  return done(null, user);
}));

passport.serializeUser((user, done) => done(null, user.nombor_daftar));
passport.deserializeUser(async (nombor_daftar, done) => { const users = await query('SELECT * FROM users WHERE nombor_daftar = ?', [nombor_daftar]); done(null, users[0] || null); });

app.get('/', (req, res) => res.redirect('/login'));
app.get('/login', (req, res) => res.render('login', { error: null }));

app.post('/login', async (req, res, next) => {
  const { nombor_daftar } = req.body;
  if (!nombor_daftar) return res.render('login', { error: 'Please enter nombor daftar' });
  const users = await query('SELECT * FROM users WHERE nombor_daftar = ?', [nombor_daftar]);
  if (users.length === 0) return res.render('login', { error: 'User not found' });
  const user = users[0];
  if (user.role === 'admin' && !req.body.password) return res.render('login', { error: null, requirePassword: true, nombor_daftar });
  if (user.role !== 'admin') return req.logIn(user, (err) => { if (err) return next(err); return res.redirect('/dashboard'); });
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.render('login', { error: info.message, requirePassword: true, nombor_daftar });
    req.logIn(user, (err) => { if (err) return next(err); return res.redirect('/dashboard'); });
  })(req, res, next);
});

app.get('/logout', (req, res) => { req.logout(() => res.redirect('/login')); });
function checkAuth(req, res, next) { if (req.isAuthenticated()) return next(); res.redirect('/login'); }

app.get('/dashboard', checkAuth, async (req, res) => {
  const year = req.query.year || 'all';
  const allDuties = await query('SELECT * FROM duties WHERE nombor_daftar = ? ORDER BY created_at DESC', [req.user.nombor_daftar]);
  let duties = allDuties;
  if (year !== 'all') duties = allDuties.filter(d => new Date(d.start_time).getFullYear() == year);
  const allYears = [...new Set(allDuties.map(d => new Date(d.start_time).getFullYear()))].sort();
  const notifications = await query('SELECT * FROM notifications WHERE nombor_daftar = ? ORDER BY created_at DESC LIMIT 10', [req.user.nombor_daftar]);
  const slides = await query('SELECT * FROM slides ORDER BY id');
  res.render('dashboard', { user: req.user, duties, currentYear: year, allYears, notifications, slides });
});

app.post('/add-duty', checkAuth, async (req, res) => {
  const { event_name, start_time, end_time } = req.body;
  const start = new Date(start_time), end = new Date(end_time);
  let hours = (end - start) / (1000 * 60 * 60);
  if (hours <= 0) hours += 24;
  await run('INSERT INTO duties (nombor_daftar, event_name, start_time, end_time, hours, created_at) VALUES (?, ?, ?, ?, ?, ?)', [req.user.nombor_daftar, event_name, start.toLocaleString('sv-SE').replace(' ', 'T'), end.toLocaleString('sv-SE').replace(' ', 'T'), hours, malaysiaTime()]);
  res.redirect('/dashboard');
});

app.post('/update-status/:id', checkAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
  const { status, reason } = req.body;
  await run('UPDATE duties SET status = ?, reason = ?, action_at = ? WHERE id = ?', [status, reason || null, malaysiaTime(), req.params.id]);
  const duty = (await query('SELECT * FROM duties WHERE id = ?', [req.params.id]))[0];
  if (duty) {
    const today = new Date().toLocaleDateString('en-MY');
    const msg = status === 'approved' ? `[${today}] Your duty "${duty.event_name}" has been approved. Hours recorded: ${duty.hours.toFixed(1)} hrs.` : `[${today}] Your duty "${duty.event_name}" was reviewed and requires revision. Reason: ${reason || 'Not specified.'}`;
    await run('INSERT INTO notifications (nombor_daftar, message) VALUES (?, ?)', [duty.nombor_daftar, msg]);
  }
  res.json({ success: true });
});

app.post('/notifications/read', checkAuth, async (req, res) => { await run('UPDATE notifications SET read = 1 WHERE nombor_daftar = ?', [req.user.nombor_daftar]); res.json({ success: true }); });
app.post('/notifications/clear', checkAuth, async (req, res) => { await run('DELETE FROM notifications WHERE nombor_daftar = ?', [req.user.nombor_daftar]); res.json({ success: true }); });
app.get('/notifications/poll', checkAuth, async (req, res) => { const count = (await query('SELECT COUNT(*) as count FROM notifications WHERE nombor_daftar = ? AND read = 0', [req.user.nombor_daftar]))[0].count; res.json({ unread: count }); });

app.get('/admin', checkAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.redirect('/dashboard');
  const year = req.query.year || 'all';
  const allRecords = await query('SELECT d.*, u.full_name, u.class FROM duties d JOIN users u ON d.nombor_daftar = u.nombor_daftar ORDER BY d.created_at DESC');
  let records = allRecords;
  if (year !== 'all') records = allRecords.filter(r => new Date(r.start_time).getFullYear() == year);
  const allYears = [...new Set(allRecords.map(r => new Date(r.start_time).getFullYear()))].sort();
  res.render('admin', { user: req.user, records, currentYear: year, allYears });
});

app.get('/admin/students', checkAuth, async (req, res) => { if (req.user.role !== 'admin') return res.redirect('/dashboard'); const students = await query('SELECT * FROM users ORDER BY class DESC, full_name ASC'); res.render('admin-students', { user: req.user, students }); });

app.get('/admin/student/:nd', checkAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.redirect('/dashboard');
  const students = await query('SELECT * FROM users WHERE nombor_daftar = ?', [req.params.nd]);
  if (students.length === 0) return res.redirect('/admin/students');
  const year = req.query.year || 'all';
  const allDuties = await query('SELECT * FROM duties WHERE nombor_daftar = ? ORDER BY created_at DESC', [req.params.nd]);
  let duties = allDuties;
  if (year !== 'all') duties = allDuties.filter(d => new Date(d.start_time).getFullYear() == year);
  const allYears = [...new Set(allDuties.map(d => new Date(d.start_time).getFullYear()))].sort();
  res.render('admin-student-duties', { user: req.user, student: students[0], duties, currentYear: year, allYears });
});

app.get('/admin/slides', checkAuth, async (req, res) => { if (req.user.role !== 'admin') return res.redirect('/dashboard'); const slides = await query('SELECT * FROM slides ORDER BY id'); res.render('admin-slides', { user: req.user, slides }); });

app.post('/api/slides/add', checkAuth, upload.single('image'), async (req, res) => { if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' }); if (!req.file) return res.status(400).json({ error: 'No image uploaded' }); await run('INSERT INTO slides (image_url, title) VALUES (?, ?)', ['/uploads/' + req.file.filename, req.body.title || '']); res.json({ success: true }); });
app.post('/api/slides/delete/:id', checkAuth, async (req, res) => { if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' }); await run('DELETE FROM slides WHERE id = ?', [req.params.id]); res.json({ success: true }); });

app.post('/delete-duty/:id', checkAuth, async (req, res) => { if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' }); await run('UPDATE duties SET action_at = ? WHERE id = ?', [malaysiaTime(), req.params.id]); await run('DELETE FROM duties WHERE id = ?', [req.params.id]); res.json({ success: true }); });

app.post('/bulk-action', checkAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
  const { ids, status } = req.body;
  try { for (const id of ids) { await run('UPDATE duties SET status = ?, action_at = ? WHERE id = ?', [status, malaysiaTime(), id]); const duty = (await query('SELECT * FROM duties WHERE id = ?', [id]))[0]; if (duty) { const today = new Date().toLocaleDateString('en-MY'); const msg = status === 'approved' ? `[${today}] Your duty "${duty.event_name}" has been approved. Hours recorded: ${duty.hours.toFixed(1)} hrs.` : `[${today}] Your duty "${duty.event_name}" was reviewed and requires revision. Reason: Bulk action.`; await run('INSERT INTO notifications (nombor_daftar, message) VALUES (?, ?)', [duty.nombor_daftar, msg]); } } res.json({ success: true }); } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/bulk-delete', checkAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
  const { ids } = req.body;
  try { for (const id of ids) { await run('UPDATE duties SET action_at = ? WHERE id = ?', [malaysiaTime(), id]); await run('DELETE FROM duties WHERE id = ?', [id]); } res.json({ success: true }); } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/health', (req, res) => res.send('OK'));

app.get('/admin/student/:nd/export', checkAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.redirect('/dashboard');
  const students = await query('SELECT * FROM users WHERE nombor_daftar = ?', [req.params.nd]);
  if (students.length === 0) return res.redirect('/admin/students');
  const student = students[0];
  const duties = (await query('SELECT * FROM duties WHERE nombor_daftar = ? ORDER BY created_at ASC', [req.params.nd])).filter(d => d.status === 'approved');
  let csv = `Nombor Daftar:,${student.nombor_daftar},Name:,${student.full_name},Class:,${student.class || ''}\n\nNo.,Event,Duration (hrs),Date\n`;
  duties.forEach((d, i) => { const date = new Date(d.start_time); csv += `${i + 1},${d.event_name},${(d.hours || 0).toFixed(1)},${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth() + 1).padStart(2,'0')}/${date.getFullYear()}\n`; });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=${student.full_name}_duties.csv`);
  res.send(csv);
});

app.post('/edit-duty/:id', checkAuth, async (req, res) => {
  const { event_name, start_time, end_time } = req.body;
  const start = new Date(start_time), end = new Date(end_time);
  let hours = (end - start) / (1000 * 60 * 60);
  if (hours <= 0) hours += 24;
  await run('UPDATE duties SET event_name = ?, start_time = ?, end_time = ?, hours = ? WHERE id = ? AND nombor_daftar = ?', [event_name, start.toLocaleString('sv-SE').replace(' ', 'T'), end.toLocaleString('sv-SE').replace(' ', 'T'), hours, req.params.id, req.user.nombor_daftar]);
  res.json({ success: true });
});

app.get('/admin/db-editor', checkAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.redirect('/');
  const tables = { users: await query('SELECT * FROM users ORDER BY class DESC, full_name ASC'), duties: await query('SELECT * FROM duties ORDER BY created_at DESC'), notifications: await query('SELECT * FROM notifications ORDER BY created_at DESC'), slides: await query('SELECT * FROM slides') };
  res.render('db-editor', { user: req.user, tables, currentPage: 'db-editor' });
});

app.post('/api/db/update', checkAuth, async (req, res) => { if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' }); const { table, id, data } = req.body; const keys = Object.keys(data); const sets = keys.map(k => `${k} = ?`).join(', '); const values = keys.map(k => data[k]); const idCol = table === 'users' ? 'nombor_daftar' : 'id'; await run(`UPDATE ${table} SET ${sets} WHERE ${idCol} = ?`, [...values, id]); res.json({ success: true }); });
app.post('/api/db/delete', checkAuth, async (req, res) => { if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' }); const { table, id } = req.body; const idCol = table === 'users' ? 'nombor_daftar' : 'id'; await run(`DELETE FROM ${table} WHERE ${idCol} = ?`, [id]); res.json({ success: true }); });

initDB().then(() => app.listen(PORT, () => console.log('✅ http://localhost:' + PORT)));