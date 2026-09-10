const express = require('express');
const multer = require('multer');
const pool = require('./db');
const app = express();
const path = require('path');
const PORT = 3000;
app.use(express.json());

function mapCharacterRow(row) {
    return {
        id: row.id,
        name: row.name,
        hp: row.hp,
        maxHp: row.max_hp,
        ap: row.ap,
        maxAp: row.max_ap,
        sp: row.sp,
        maxSp: row.max_sp,
        patk: row.patk,
        matk: row.matk,
        crit: row.crit,
        hitRate: row.hit_rate,
        dodge: row.dodge,
        speed: row.speed,
        defense: row.defense,
        resist: row.resist,
        image: row.image_path
    };
}

app.use(express.static('public'));
app.use(express.json());
app.use('/uploads', express.static('uploads'));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + file.orginalname;
        cb(null, uniqueName);
    }
});

const upload = multer({ storage });

app.listen(PORT, () => {
    console.log(`伺服器已啟動，請在瀏覽器打開 http://localhost:${PORT}`);
});

app.get('/api/characters', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM characters ORDER BY id');
        res.json(result.rows.map(mapCharacterRow));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '查詢角色失敗' });
    }
});

app.post('/api/characters', upload.single('image'), async (req, res) => {
    try {
        const imagePath = req.file ? '/uploads/' + req.file.filename : null;
        const result = await pool.query(
            `INSERT INTO characters (name, hp, max_hp, ap, max_ap, sp, max_sp, patk, matk, crit, hit_rate, dodge, speed, defense, resist, image_path)
         VALUES ($1, $2, $2, $3, $3, $4, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
            [
                req.body.name,
                Number(req.body.hp),
                Number(req.body.ap),
                Number(req.body.sp),
                Number(req.body.patk),
                Number(req.body.matk),
                Number(req.body.crit),
                Number(req.body.hitRate),
                Number(req.body.dodge),
                Number(req.body.speed),
                Number(req.body.defense),
                Number(req.body.resist),
                imagePath
            ]
        );

        const row = result.rows[0];
        res.json(mapCharacterRow(row));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/grid-groups', async (req, res) => {
    try {
        const groupsResult = await pool.query('SELECT * FROM grid_groups ORDER BY id');
        const groups = [];

        for (const g of groupsResult.rows) {
            const cellsResult = await pool.query(
                `SELECT cells.*, characters.name AS character_name, characters.image_path AS character_image
           FROM cells
           LEFT JOIN characters ON cells.occupied_by = characters.id
           WHERE cells.group_id = $1
           ORDER BY row_index, col_index`,
                [g.id]
            );

            groups.push({
                id: g.id,
                worldX: g.world_x,
                worldY: g.world_y,
                rows: g.rows,
                cols: g.cols,
                cellSize: g.cell_size,
                cells: cellsResult.rows.map(c => ({
                    id: c.id,
                    row: c.row_index,
                    col: c.col_index,
                    occupiedBy: c.occupied_by,
                    characterName: c.character_name,
                    characterImage: c.character_image
                }))
            });
        }

        res.json(groups);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '查詢格子群組失敗' });
    }
});

app.post('/api/grid-groups', async (req, res) => {
    const { worldX, worldY, rows, cols, cellSize } = req.body;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const groupResult = await client.query(
            `INSERT INTO grid_groups (world_x, world_y, rows, cols, cell_size)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [Number(worldX), Number(worldY), Number(rows), Number(cols), cellSize ? Number(cellSize) : 160]
        );
        const group = groupResult.rows[0];

        const cells = [];
        for (let r = 0; r < Number(rows); r++) {
            for (let c = 0; c < Number(cols); c++) {
                const cellResult = await client.query(
                    `INSERT INTO cells (group_id, row_index, col_index) VALUES ($1, $2, $3) RETURNING *`,
                    [group.id, r, c]
                );
                cells.push(cellResult.rows[0]);
            }
        }

        await client.query('COMMIT');

        res.json({
            id: group.id,
            worldX: group.world_x,
            worldY: group.world_y,
            rows: group.rows,
            cols: group.cols,
            cellSize: group.cell_size,
            cells: cells.map(c => ({ id: c.id, row: c.row_index, col: c.col_index, occupiedBy: c.occupied_by }))
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('創建格子群組時發生錯誤詳情:', err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.patch('/api/grid-groups/:id/move', async (req, res) => {
    const groupId = Number(req.params.id);

    try {
        const result = await pool.query(
            `UPDATE grid_groups SET world_x = $1, world_y = $2 WHERE id = $3 RETURNING *`,
            [Number(req.body.worldX), Number(req.body.worldY), groupId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: '找不到這個格子群組' });
        }

        const g = result.rows[0];
        res.json({ id: g.id, worldX: g.world_x, worldY: g.world_y, rows: g.rows, cols: g.cols, cellSize: g.cell_size });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '移動格子群組失敗' });
    }
});

app.delete('/api/grid-groups/:id', async (req, res) => {
    const groupId = Number(req.params.id);

    try {
        const occupiedResult = await pool.query(
            'SELECT COUNT(*) FROM cells WHERE group_id = $1 AND occupied_by IS NOT NULL',
            [groupId]
        );

        if (Number(occupiedResult.rows[0].count) > 0) {
            return res.status(400).json({ error: '這片格子上還有角色，無法刪除' });
        }

        const result = await pool.query('DELETE FROM grid_groups WHERE id = $1 RETURNING *', [groupId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: '找不到這個格子群組' });
        }

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '刪除格子群組失敗' });
    }
});

app.patch('/api/cells/:cellId/occupy', async (req, res) => {
    const cellId = Number(req.params.cellId);
    const { characterId } = req.body;

    try {
        const cellCheck = await pool.query('SELECT * FROM cells WHERE id = $1', [cellId]);
        if (cellCheck.rows.length === 0) {
            return res.status(404).json({ error: '找不到這個格子' });
        }

        if (cellCheck.rows[0].occupied_by !== null && cellCheck.rows[0].occupied_by !== Number(characterId)) {
            return res.status(400).json({ error: '這個格子已經被其他角色佔用' });
        }

        await pool.query('UPDATE cells SET occupied_by = NULL WHERE occupied_by = $1', [Number(characterId)]);

        const result = await pool.query(
            'UPDATE cells SET occupied_by = $1 WHERE id = $2 RETURNING *',
            [Number(characterId), cellId]
        );

        res.json({
            id: result.rows[0].id,
            row: result.rows[0].row_index,
            col: result.rows[0].col_index,
            occupiedBy: result.rows[0].occupied_by
        });
    } catch (err) {
        console.error('放置角色到格子時發生錯誤:', err);
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/characters/:id/vacate', async (req, res) => {
    const characterId = Number(req.params.id);

    try {
        await pool.query('UPDATE cells SET occupied_by = NULL WHERE occupied_by = $1', [characterId]);
        res.json({ success: true });
    } catch (err) {
        console.error('移除角色佔用時發生錯誤:', err);
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/characters/:id/stat', async (req, res) => {
    const characterId = Number(req.params.id);
    const { statType, delta } = req.body;
    const allowedStats = ['hp', 'ap', 'sp'];

    if (!allowedStats.includes(statType)) {
        return res.status(400).json({ error: '不支援這個屬性' });
    }

    try {
        const result = await pool.query(
            `UPDATE characters SET ${statType} = GREATEST(0, ${statType} + $1) WHERE id = $2 RETURNING *`,
            [Number(delta), characterId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: '找不到這個角色' });
        }

        const row = result.rows[0];
        res.json(mapCharacterRow(row));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '更新屬性失敗' });
    }
});