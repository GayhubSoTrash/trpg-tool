const pool = require('./db');
const { ensureSchema } = require('./schema');

async function initDb() {
    await ensureSchema();
    console.log('資料表建立 / 更新完成');
}

initDb()
    .catch((error) => {
        console.error('建立資料表失敗：', error);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
