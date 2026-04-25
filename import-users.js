const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./school_duty.db');

// Just copy-paste your users here in this format:
const users = [
  ['22170', 'Madeline Tan', 'admin', '5 Adara', 'Cadet Sergeant'],
  ['22084', 'Nathan', 'student', '5 Acrux', 'Cadet'],
  ['23156', 'Low Yee Shyuen', 'student', '4 Atria', 'Cadet lance Corporal'],
  ['22146', 'Muhammad Harith Safwan bin Husri', 'admin', '5 Atria', 'Cadet Corporal'],
  ['11228', 'Clement Chan Jing Wei', 'admin', '5 Atria', 'Cadet Sergeant'],
];

const stmt = db.prepare('INSERT OR REPLACE INTO users (nombor_daftar, full_name, role, class, rank) VALUES (?, ?, ?, ?, ?)');
users.forEach(u => stmt.run(u[0], u[1], u[2], u[3], u[4]));
stmt.finalize();
console.log('Done');
db.close();