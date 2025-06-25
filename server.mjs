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

// --- PostgreSQL Pool for Logging (NEW) ---
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
  process.exit(-1); // Exit process if critical error
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

  // --- START OF KEYWORD SEARCH ENHANCEMENT ---
  if (keywords) {
    // Split keywords into individual tokens (words)
    const keywordTokens = keywords.toLowerCase().split(/\s+/).filter(token => token.length > 0);

    if (keywordTokens.length > 0) {
      const fieldsToSearch = ['name', 'description', 'ideal_for', 'best_feature'];
      const fieldSearchConditions = [];

      // Build conditions for each field: (field LIKE %token1% AND field LIKE %token2% ...)
      fieldsToSearch.forEach(field => {
        const tokenLikeConditions = keywordTokens.map(() => `lower(${field}) LIKE ?`);
        if (tokenLikeConditions.length > 0) {
          fieldSearchConditions.push(`(${tokenLikeConditions.join(' AND ')})`);
          // Add parameters for each token, for this specific field
          keywordTokens.forEach(token => params.push(`%${token}%`));
        }
      });

      // Combine all field conditions with OR
      if (fieldSearchConditions.length > 0) {
        query += ` AND (${fieldSearchConditions.join(' OR ')})`;
      }
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
    query += ' AND lower(has_rear_roller) = \'true\'';
  } else if (hasRearRoller === 'false') {
    query += ' AND lower(has_rear_roller) = \'false\'';
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

// --- NEW ENDPOINT FOR LOGGING ---
app.post('/api/submit-debug-log', async (req, res) => {
  const { logs, sessionId, userId } = req.body; // Frontend sends these

  if (!logs || !Array.isArray(logs) || logs.length === 0) {
    return res.status(400).json({ error: 'Invalid or empty logs array provided.' });
  }

  try {
    const client = await logDbPool.connect();
    try {
      await client.query('BEGIN');

      for (const logEntry of logs) {
        // --- START: Changes for log_level extraction ---
        // Safely extract the log message and log level
        const logMessage = typeof logEntry === 'string' ? logEntry : logEntry.message;
        const logLevel = typeof logEntry === 'object' && logEntry.level ? logEntry.level : null; // This line extracts the 'level' property

        // Ensure logMessage is always a string for the database
        const finalLogMessage = typeof logMessage === 'string' ? logMessage : JSON.stringify(logMessage);
        const timestamp = new Date().toISOString();

        // Updated INSERT query to include 'log_level' column
        const insertQuery = `
          INSERT INTO debug_logs (session_id, user_id, timestamp, log_message, log_level)
          VALUES ($1, $2, $3, $4, $5)
        `;
        // Pass 'logLevel' as the fifth parameter to the query
        await client.query(insertQuery, [sessionId, userId, timestamp, finalLogMessage, logLevel]);
        // --- END: Changes for log_level extraction ---
      }

      await client.query('COMMIT');
      res.status(200).json({ message: 'Logs received and stored successfully.' });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error inserting logs into PostgreSQL:', err);
      res.status(500).json({ error: 'Failed to store logs in database.' });
    } finally {
      client.release();
    }
  } catch (poolErr) {
    console.error('Error connecting to PostgreSQL pool:', poolErr);
    res.status(500).json({ error: 'Database connection error for logging.' });
  }
});
// --- END NEW ENDPOINT ---

export default app;
