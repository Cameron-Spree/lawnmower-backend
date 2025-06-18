import express from 'express';
import sqlite3 from 'sqlite3';
import cors from 'cors';
import path from 'path';
import url from 'url'; // Import the url module

// Get __dirname equivalent in ES Modules
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const dbPath = path.resolve(__dirname, 'lawnmowers.db'); // Adjust path resolution for ES Modules

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
      image_url AS imageUrl,           -- Corrected: Maps image_url from DB to imageUrl in response
      product_url AS productUrl,       -- Corrected: Maps product_url from DB to productUrl in response
      description,
      brand,
      power_source AS powerSource,     -- Corrected: Maps power_source from DB to powerSource in response
      drive_type AS driveType,         -- Corrected: Maps drive_type from DB to driveType in response
      cutting_width_cm AS cuttingWidthCm, -- Corrected: Maps cutting_width_cm from DB to cuttingWidthCm in response
      has_rear_roller AS hasRearRoller, -- Corrected: Maps has_rear_roller from DB to hasRearRoller in response
      configuration,
      battery_system AS batterySystem, -- Corrected: Maps battery_system from DB to batterySystem in response
      ideal_for AS idealFor,           -- Corrected: Maps ideal_for from DB to idealFor in response
      best_feature AS bestFeature      -- Corrected: Maps best_feature from DB to bestFeature in response
      -- Removed 'attributes' as it was not in your provided column list
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
      lower(ideal_for) LIKE ? OR  -- Corrected: ideal_for
      lower(best_feature) LIKE ?  -- Corrected: best_feature
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
    query += ' AND lower(power_source) = lower(?)'; // Corrected: power_source
    params.push(powerSource);
  }

  // Filter by drive type (uses the query param 'driveType' but filters by DB column 'drive_type')
  if (driveType) {
    query += ' AND lower(drive_type) = lower(?)'; // Corrected: drive_type
    params.push(driveType);
  }

  // Filter by cutting width (uses the query param 'cuttingWidthCm' but filters by DB column 'cutting_width_cm')
  if (cuttingWidthCm && !isNaN(parseFloat(cuttingWidthCm))) {
    query += ' AND cutting_width_cm = ?'; // Corrected: cutting_width_cm
    params.push(parseFloat(cuttingWidthCm));
  } else if (cuttingWidthCm && isNaN(parseFloat(cuttingWidthCm))) {
      return res.status(400).json({ error: 'Invalid value for cuttingWidthCm. Must be a number.' });
  }


  // Filter by hasRearRoller (uses the query param 'hasRearRoller' but filters by DB column 'has_rear_roller')
  if (hasRearRoller === 'true') {
    query += ' AND has_rear_roller = 1'; // Corrected: has_rear_roller
  } else if (hasRearRoller === 'false') {
    query += ' AND has_rear_roller = 0'; // Corrected: has_rear_roller
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
      // You can add other sortable fields using their database column names here if needed
      // e.g., case 'category': orderByClause = 'category'; break;
      default:
        // Default to no specific sort or return an error if sortBy is invalid
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