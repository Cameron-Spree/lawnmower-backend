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
      description,
      imageUrl,
      productUrl,
      brand,
      powerSource,
      driveType,
      cuttingWidthCm,
      hasRearRoller,
      configuration,
      batterySystem,
      idealFor,
      bestFeature,
      attributes
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
      lower(idealFor) LIKE ? OR
      lower(bestFeature) LIKE ?
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

  // Filter by power source
  if (powerSource) {
    query += ' AND lower(powerSource) = lower(?)';
    params.push(powerSource);
  }

  // Filter by drive type
  if (driveType) {
    query += ' AND lower(driveType) = lower(?)';
    params.push(driveType);
  }

  // Filter by cutting width (numerical comparison)
  if (cuttingWidthCm && !isNaN(parseFloat(cuttingWidthCm))) {
    query += ' AND cuttingWidthCm = ?';
    params.push(parseFloat(cuttingWidthCm));
  } else if (cuttingWidthCm && isNaN(parseFloat(cuttingWidthCm))) {
      return res.status(400).json({ error: 'Invalid value for cuttingWidthCm. Must be a number.' });
  }


  // Filter by hasRearRoller (boolean interpretation)
  if (hasRearRoller === 'true') {
    query += ' AND hasRearRoller = 1';
  } else if (hasRearRoller === 'false') {
    query += ' AND hasRearRoller = 0';
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
      // Add other sortable fields as needed
      default:
        // Default to no specific sort or return an error if sortBy is invalid
        return res.status(400).json({ error: `Invalid sortBy parameter: ${sortBy}` });
    }

    const sortOrder = (order && order.toLowerCase() === 'desc') ? 'DESC' : 'ASC';
    query += ` ORDER BY ${orderByClause} ${sortOrder}`;
  } else {
    // Default relevance sorting (can be more complex, e.g., based on views, sales, etc.)
    // For now, no specific default relevance sorting is implemented beyond database's natural order
    // You could add `ORDER BY SomeRelevanceColumn DESC` here if available
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