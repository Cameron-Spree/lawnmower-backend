import express from 'express';
import sqlite3 from 'sqlite3';
import cors from 'cors';
import path from 'path';

const app = express();
const dbPath = path.resolve(process.cwd(), 'lawnmowers.db');

app.use(cors());
app.use(express.json());

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) console.error("Database connection failed:", err);
  else console.log("Database connection successful.");
});

app.get('/api/products', (req, res) => {
  let query = 'SELECT * FROM Lawnmowers WHERE 1=1';
  const params = [];
  const { brand, power_source, drive_type, has_rear_roller } = req.query;

  if (brand) {
    query += ' AND lower(brand) = lower(?)';
    params.push(brand);
  }
  if (power_source) {
    query += ' AND lower(power_source) = lower(?)';
    params.push(power_source);
  }
  if (has_rear_roller === 'true') {
    query += ' AND has_rear_roller = 1';
  }
  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: 'Database query failed' });
    } else {
      res.json(rows);
    }
  });
});

export default app;
