const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./school_duty.db');

db.serialize(() => {
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO users (ic_number, full_name, role, class) VALUES (?, ?, ?, ?)'
  );
  
  users.forEach(user => {
    stmt.run(user.ic, user.name, user.role, user.class);
  });
  
  stmt.finalize();
  console.log('✅ Database seeded with sample users!');
  console.log('📋 Test credentials:');
  console.log('   Student: IC = 020101010001');
  console.log('   Admin: IC = ADMIN001');
});

db.close();