require('.env').config();
const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const cors = require('cors');
const mysql = require('mysql2/promise'); // Using promise-based API

const app = express();
const PORT = process.env.PORT || 5500;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// MySQL Database Connection
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Email configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Create contacts table if not exists (run once)
async function initializeDatabase() {
  try {
    const connection = await pool.getConnection();
    await connection.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        subject VARCHAR(255),
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    connection.release();
    console.log('Database initialized');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

initializeDatabase();

// Contact form endpoint
app.post('/api/contact', async (req, res) => {
  let connection;
  try {
    const { name, email, subject, message } = req.body;

    // Validate input
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Name, email and message are required' });
    }

    // Get a connection from the pool
    connection = await pool.getConnection();

    // Store in database
    const [result] = await connection.query(
      'INSERT INTO contacts (name, email, subject, message) VALUES (?, ?, ?, ?)',
      [name, email, subject, message]
    );

    // Email options
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER, // Sending to yourself
      subject: `New Contact Form Submission: ${subject}`,
      text: `
        Name: ${name}
        Email: ${email}
        Subject: ${subject}
        Message: ${message}
      `,
      html: `
        <h3>New Contact Form Submission</h3>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <p><strong>Message:</strong> ${message}</p>
        <p><strong>DB ID:</strong> ${result.insertId}</p>
      `
    };

    // Send email
    await transporter.sendMail(mailOptions);
    
    res.status(200).json({ 
      message: 'Message sent successfully!',
      dbId: result.insertId 
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to process your request' });
  } finally {
    if (connection) connection.release();
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});