import express from 'express';
import sqlite3 from 'sqlite3';
import cors from 'cors';
import path from 'path';
import url from 'url';
import { Pool } from 'pg'; // Import the Pool from 'pg'

// Get __dirname equivalent in ES Modules
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const dbPath = path.resolve(__dirname, 'lawnmowers.db');

app.use(cors());
app.use(express.json());

// --- PostgreSQL Pool for Logging ---
// This connects to your external PostgreSQL database.
// Vercel will inject DATABASE_URL from your environment variables.
const logDbPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    // Required for some cloud providers like Supabase/Neon to connect securely
    rejectUnauthorized: false,
  },
});

logDbPool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  // It's generally good practice to log the error but not necessarily exit the process
  // unless it's a non-recoverable error for the entire application.
});
// --- END PostgreSQL Pool for Logging ---


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
    order,
    minPrice,
    maxPrice
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

  // --- START OF KEYWORD SEARCH ENHANCEMENT (Flexible AND logic across fields) ---
  if (keywords) {
    // Split keywords into individual tokens (words)
    const keywordTokens = keywords.toLowerCase().split(/\s+/).filter(token => token.length > 0);

    if (keywordTokens.length > 0) {
      // Define fields and whether they need space normalization
      const fieldsToSearch = [
        { name: 'name', normalizeSpaces: true },
        { name: 'description', normalizeSpaces: true },
        { name: 'ideal_for', normalizeSpaces: false }, // Ideal for doesn't typically have compound words with spaces
        { name: 'best_feature', normalizeSpaces: false } // Best feature doesn't typically have compound words with spaces
      ];

      // For each keyword token, build an OR condition across all searchable fields
      const tokenConditions = keywordTokens.map(token => {
        const fieldOrConditions = fieldsToSearch.map(fieldDef => {
          const fieldName = fieldDef.name;
          // Apply REPLACE to remove spaces before comparison for relevant fields (e.g., "lawn mower" -> "lawnmower")
          const columnExpression = fieldDef.normalizeSpaces ? `REPLACE(${fieldName}, ' ', '')` : fieldName;
          params.push(`%${token}%`); // Each token needs its own param for each field it's checked against
          return `lower(${columnExpression}) LIKE ?`;
        });
        // Combine field conditions for this single token with OR
        return `(${fieldOrConditions.join(' OR ')})`;
      });

      // Combine all token conditions with AND (product must contain ALL keywords, but they can be in any field)
      query += ` AND (${tokenConditions.join(' AND ')})`;
    }
  }
  // --- END OF KEYWORD SEARCH ENHANCEMENT ---


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
    query += ' AND lower(power_source) = lower(?)';
    params.push(powerSource);
  }

  // Filter by drive type
  if (driveType) {
    query += ' AND lower(drive_type) = lower(?)';
    params.push(driveType);
  }

  // Filter by cutting width (numerical comparison)
  if (cuttingWidthCm && !isNaN(parseFloat(cuttingWidthCm))) {
    query += ' AND cutting_width_cm = ?';
    params.push(parseFloat(cuttingWidthCm));
  } else if (cuttingWidthCm && isNaN(parseFloat(cuttingWidthCm))) {
      return res.status(400).json({ error: 'Invalid value for cuttingWidthCm. Must be a number.' });
  }

  // Corrected: Filter by hasRearRoller to match string values in database
  if (hasRearRoller === 'true') {
    query += ' AND lower(has_rear_roller) = \'true\'';
  } else if (hasRearRoller === 'false') {
    query += ' AND lower(has_rear_roller) = \'false\'';
  } else if (hasRearRoller) {
      return res.status(400).json({ error: 'Invalid value for hasRearRoller. Must be "true" or "false".' });
  }

  // --- Price Filtering ---
  if (minPrice && !isNaN(parseFloat(minPrice))) {
    query += ' AND price >= ?';
    params.push(parseFloat(minPrice));
  } else if (minPrice && isNaN(parseFloat(minPrice))) {
      return res.status(400).json({ error: 'Invalid value for minPrice. Must be a number.' });
  }

  if (maxPrice && !isNaN(parseFloat(maxPrice))) {
    query += ' AND price <= ?';
    params.push(parseFloat(maxPrice));
  } else if (maxPrice && isNaN(parseFloat(maxPrice))) {
      return res.status(400).json({ error: 'Invalid value for maxPrice. Must be a number.' });
  }
  // --- END Price Filtering ---

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
        return res.status(400).json({ error: `Invalid sortBy parameter: ${sortBy}` });
    }
    const sortOrder = (order && order.toLowerCase() === 'desc') ? 'DESC' : 'ASC';
    query += ` ORDER BY ${orderByClause} ${sortOrder}`;
  } else {
    // Default relevance sorting (can be more complex, e.g., based on views, sales, etc.)
    // For now, no specific default relevance sorting is implemented beyond database's natural order
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error("Database query failed:", err);
      return res.status(500).json({ error: 'Database query failed' });
    }
    res.json(rows);
  });
});

// --- NEW ENDPOINT FOR LOGGING ---
app.post('/api/submit-debug-log', async (req, res) => {
  // Frontend sends logs as an array, with each logEntry being an object or string
  // Example: [{"message": "User input: ...", "level": "INFO"}, ...]
  const { logs, sessionId, userId } = req.body;

  if (!logs || !Array.isArray(logs) || logs.length === 0) {
    return res.status(400).json({ error: 'Invalid or empty logs array provided.' });
  }

  try {
    const client = await logDbPool.connect();
    try {
      await client.query('BEGIN'); // Start a transaction for multiple inserts

      for (const logEntry of logs) {
        // Safely extract the log message and log level
        const logMessage = typeof logEntry === 'string' ? logEntry : logEntry.message;
        const logLevel = typeof logEntry === 'object' && logEntry.level ? logEntry.level : null;

        // Ensure logMessage is always a string for the database, stringify if it's an object
        const finalLogMessage = typeof logMessage === 'string' ? logMessage : JSON.stringify(logMessage);
        const timestamp = new Date().toISOString(); // Generate timestamp in ISO format

        // INSERT query to match all columns in your debug_logs table
        const insertQuery = `
          INSERT INTO debug_logs (session_id, user_id, timestamp, log_message, log_level)
          VALUES ($1, $2, $3, $4, $5)
        `;
        await client.query(insertQuery, [sessionId, userId, timestamp, finalLogMessage, logLevel]);
      }

      await client.query('COMMIT'); // Commit the transaction
      res.status(200).json({ message: 'Logs received and stored successfully.' });
    } catch (err) {
      await client.query('ROLLBACK'); // Rollback on error
      console.error('Error inserting logs into PostgreSQL:', err);
      res.status(500).json({ error: 'Failed to store logs in database.' });
    } finally {
      client.release(); // Release client back to the pool
    }
  } catch (poolErr) {
    console.error('Error connecting to PostgreSQL pool:', poolErr);
    res.status(500).json({ error: 'Database connection error for logging.' });
  }
});

export default app;