const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./school_duty.db');

// Just copy-paste your users here in this format:
const users = [
  ['090831071662', 'Madeline Tan', 'admin', '5 Adara', 'Cadet Sergeant'],
  ['091224070523', 'Nathan', 'student', '5 Acrux', 'Cadet'],
  ['100614070678', 'Low Yee Shyuen', 'student', '4 Atria', 'Cadet lance Corporal'],
  ['091212070083', 'Muhammad Harith Safwan bin Husri', 'admin', '5 Atria', 'Cadet Corporal'],
  ['091122070071', 'Clement Chan Jing Wei', 'admin', '5 Atria', 'Cadet Sergeant'],
];

const stmt = db.prepare('INSERT OR REPLACE INTO users (ic_number, full_name, role, class, rank) VALUES (?, ?, ?, ?, ?)');
users.forEach(u => stmt.run(u[0], u[1], u[2], u[3], u[4]));
stmt.finalize();
console.log('Done');
db.close();