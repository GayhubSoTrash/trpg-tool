const pool = require('./db');


async function initDb() {

    
  await pool.query(`
    CREATE TABLE IF NOT EXISTS characters (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      hp INTEGER NOT NULL,
      max_hP INTEGER NOT NULL,
      ap INTEGER NOT NULL,
      max_ap INTEGER NOT NULL,
      sp INTEGER NOT NULL,
      max_sp INTEGER NOT NULL,
      patk INTEGER NOT NULL,
      matk INTEGER NOT NULL,
      crit INTEGER NOT NULL,
      hit_rate INTEGER NOT NULL,
      dodge INTEGER NOT NULL,
      speed INTEGER NOT NULL,
      defense INTEGER NOT NULL,
      resist INTEGER NOT NULL,
      image_path TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS grid_groups (
      id SERIAL PRIMARY KEY,
      world_x INTEGER NOT NULL,
      world_y INTEGER NOT NULL,
      rows INTEGER NOT NULL,
      cols INTEGER NOT NULL,
      cell_size INTEGER NOT NULL DEFAULT 100,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cells (
      id SERIAL PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES grid_groups(id) ON DELETE CASCADE,
      row_index INTEGER NOT NULL,
      col_index INTEGER NOT NULL,
      occupied_by INTEGER REFERENCES characters(id) ON DELETE SET NULL
    );
  `);

  console.log('資料表建立完成');
  await pool.end();
}

initDb().catch((err) => {
  console.error('建立資料表失敗', err);
  process.exit(1);
});