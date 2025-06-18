import express from 'express';
import sqlite3 from 'sqlite3';
import cors from 'cors';
import path from 'path';
import url from 'url';

// Get __dirname equivalent in ES Modules
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const dbPath = path.resolve(__dirname, 'lawnmowers.db');

app.use(cors());
app.use(express.json());

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error("Database connection failed:", err);
  } else {
    console.log("Database connection successful.");
  }
});

app.get('/api/products', (req, res) => {
  let query = `
    SELECT
      id,
      name,
      category,
      price,
      image_url AS imageUrl,
      product_url AS productUrl,
      description,
      brand,
      power_source AS powerSource,
      drive_type AS driveType,
      cutting_width_cm AS cuttingWidthCm,
      has_rear_roller AS hasRearRoller,
      configuration,
      battery_system AS batterySystem,
      ideal_for AS idealFor,
      best_feature AS bestFeature
    FROM Lawnmowers WHERE 1=1
  `;
  const params = [];
  const {
    brand,
    powerSource,
    driveType,
    hasRearRoller,
    keywords,
    category,
    productId,
    cuttingWidthCm,
    sortBy,
    order
  } = req.query;

  // Filter by productId (if provided, this should be the primary filter)
  if (productId) {
    query += ' AND id = ?';
    params.push(productId);
    // Execute query immediately for single product lookup
    db.get(query, params, (err, row) => {
      if (err) {
        console.error("Database query failed:", err);
        return res.status(500).json({ error: 'Database query failed' });
      }
      if (!row) {
        return res.status(404).json({ error: 'Product not found' });
      }
      res.json([row]); // Return as an array for consistency
    });
    return; // Exit after sending single product response
  }

  // General text search (keywords)
  if (keywords) {
    const searchKeywords = `%${keywords.toLowerCase()}%`;
    query += ` AND (
      lower(name) LIKE ? OR
      lower(description) LIKE ? OR
      lower(ideal_for) LIKE ? OR
      lower(best_feature) LIKE ?
    )`;
    params.push(searchKeywords, searchKeywords, searchKeywords, searchKeywords);
  }

  // Strict category filtering (CRITICAL)
  if (category) {
    query += ' AND lower(category) = lower(?)';
    params.push(category);
  }

  // Filter by brand
  if (brand) {
    query += ' AND lower(brand) = lower(?)';
    params.push(brand);
  }

  // Filter by power source (uses the query param 'powerSource' but filters by DB column 'power_source')
  if (powerSource) {
    query += ' AND lower(power_source) = lower(?)';
    params.push(powerSource);
  }

  // Filter by drive type (uses the query param 'driveType' but filters by DB column 'drive_type')
  if (driveType) {
    query += ' AND lower(drive_type) = lower(?)';
    params.push(driveType);
  }

  // Filter by cutting width (uses the query param 'cuttingWidthCm' but filters by DB column 'cutting_width_cm')
  if (cuttingWidthCm && !isNaN(parseFloat(cuttingWidthCm))) {
    query += ' AND cutting_width_cm = ?';
    params.push(parseFloat(cuttingWidthCm));
  } else if (cuttingWidthCm && isNaN(parseFloat(cuttingWidthCm))) {
      return res.status(400).json({ error: 'Invalid value for cuttingWidthCm. Must be a number.' });
  }

  // Corrected: Filter by hasRearRoller to match string values in database
  if (hasRearRoller === 'true') {
    query += ' AND lower(has_rear_roller) = \'true\''; // Matches 'TRUE' or 'true' in DB
  } else if (hasRearRoller === 'false') {
    query += ' AND lower(has_rear_roller) = \'false\''; // Matches 'FALSE' or 'false' in DB
  } else if (hasRearRoller) {
      return res.status(400).json({ error: 'Invalid value for hasRearRoller. Must be "true" or "false".' });
  }

  // Sorting
  if (sortBy) {
    let orderByClause = '';
    switch (sortBy.toLowerCase()) {
      case 'price':
        orderByClause = 'price';
        break;
      case 'name':
        orderByClause = 'name';
        break;
      default:
        return res.status(400).json({ error: `Invalid sortBy parameter: ${sortBy}` });
    }

    const sortOrder = (order && order.toLowerCase() === 'desc') ? 'DESC' : 'ASC';
    query += ` ORDER BY ${orderByClause} ${sortOrder}`;
  } else {
    // Default relevance sorting
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error("Database query failed:", err);
      return res.status(500).json({ error: 'Database query failed' });
    }
    res.json(rows);
  });
});

export default app;