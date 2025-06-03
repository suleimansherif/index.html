require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Database Connection
const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'suleiman sheriff',
  password: process.env.DB_PASSWORD || 'sH12eri@28846',
  database: process.env.DB_NAME || 'urbanlabs',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Create tables if they don't exist
async function initializeDatabase() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS contact_submissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS booking_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        service VARCHAR(255) NOT NULL,
        budget VARCHAR(50),
        urgency VARCHAR(50),
        details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Database tables initialized');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

initializeDatabase();

// Contact Form Endpoint
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    // Save to database
    await db.query(
      'INSERT INTO contact_submissions (name, email, subject, message) VALUES (?, ?, ?, ?)',
      [name, email, subject, message]
    );

    // Send email notification
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.ADMIN_EMAIL,
      subject: `New Contact Form Submission: ${subject}`,
      html: `
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <p><strong>Message:</strong></p>
        <p>${message}</p>
      `
    });

    res.status(200).json({ success: true, message: 'Message sent successfully!' });
  } catch (error) {
    console.error('Error submitting contact form:', error);
    res.status(500).json({ success: false, message: 'Error submitting form' });
  }
});

// Booking Form Endpoint
app.post('/api/book', async (req, res) => {
  try {
    const { name, email, phone, service, budget, urgency, details } = req.body;

    // Save to database
    await db.query(
      'INSERT INTO booking_requests (name, email, phone, service, budget, urgency, details) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, email, phone, service, budget, urgency, details]
    );

    // Send email notification
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.ADMIN_EMAIL,
      subject: `New Booking Request: ${service}`,
      html: `
        <h2>New Booking Request</h2>
        <p><strong>Service:</strong> ${service}</p>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Budget:</strong> ${budget || 'Not specified'}</p>
        <p><strong>Urgency:</strong> ${urgency}</p>
        <p><strong>Details:</strong></p>
        <p>${details}</p>
      `
    });

    res.status(200).json({ success: true, message: 'Booking request submitted successfully!' });
  } catch (error) {
    console.error('Error submitting booking form:', error);
    res.status(500).json({ success: false, message: 'Error submitting booking request' });
  }
});


 
// M-Pesa configuration
const MPESA_CONFIG = {
  consumerKey: process.env.MPESA_CONSUMER_KEY,
  consumerSecret: process.env.MPESA_CONSUMER_SECRET,
  businessShortCode: process.env.MPESA_BUSINESS_SHORT_CODE,
  passKey: process.env.MPESA_PASS_KEY,
  callbackURL: process.env.MPESA_CALLBACK_URL || 'https://yourdomain.com/mpesa-callback',
  transactionType: 'CustomerPayBillOnline'
};

// Stripe configuration (for card payments)
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Helper function to generate M-Pesa access token
async function getMpesaAccessToken() {
  try {
    const auth = Buffer.from(`${MPESA_CONFIG.consumerKey}:${MPESA_CONFIG.consumerSecret}`).toString('base64');
    const response = await axios.get('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
      headers: {
        Authorization: `Basic ${auth}`
      }
    });
    return response.data.access_token;
  } catch (error) {
    console.error('Error getting M-Pesa token:', error);
    throw error;
  }
}

// M-Pesa STK push function
async function initiateMpesaPayment(phone, amount, reference) {
  try {
    const accessToken = await getMpesaAccessToken();
    const timestamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, -5);
    const password = Buffer.from(`${MPESA_CONFIG.businessShortCode}${MPESA_CONFIG.passKey}${timestamp}`).toString('base64');

    const response = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      {
        BusinessShortCode: MPESA_CONFIG.businessShortCode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: MPESA_CONFIG.transactionType,
        Amount: amount,
        PartyA: phone,
        PartyB: MPESA_CONFIG.businessShortCode,
        PhoneNumber: phone,
        CallBackURL: MPESA_CONFIG.callbackURL,
        AccountReference: reference,
        TransactionDesc: 'UrbanLabs Technology Services'
      },
      {  
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data;
  } catch (error) {
    console.error('Error initiating M-Pesa payment:', error.response?.data || error.message);
    throw error;
  }
}

// Save booking to database
async function saveBooking(bookingData) {
  const connection = await pool.getConnection();
  try {
    const [result] = await connection.execute(
      `INSERT INTO bookings 
      (name, email, phone, service, budget, urgency, details, payment_method, payment_status, mpesa_phone, card_last4)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [
        bookingData.name,
        bookingData.email,
        bookingData.phone,
        bookingData.service,
        bookingData.budget,
        bookingData.urgency,
        bookingData.details,
        bookingData.paymentMethod,
        bookingData.mpesaPhone || null,
        bookingData.cardLast4 || null
      ]
    );
    return result.insertId;
  } finally {
    connection.release();
  }
}

// Process card payment with Stripe
async function processCardPayment(cardData, amount, description) {
  try {
    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100, // amount in cents
      currency: 'kes',
      payment_method_types: ['card'],
      description: description,
      payment_method: {
        type: 'card',
        card: {
          number: cardData.cardNumber,
          exp_month: cardData.cardExpiry.split('/')[0],
          exp_year: cardData.cardExpiry.split('/')[1],
          cvc: cardData.cardCvv
        },
        billing_details: {
          name: cardData.cardName
        }
      },
      confirm: true
    });

    return {
      success: paymentIntent.status === 'succeeded',
      paymentId: paymentIntent.id,
      cardLast4: paymentIntent.payment_method.card.last4
    };
  } catch (error) {
    console.error('Error processing card payment:', error);
    throw error;
  }
}

// Booking submission endpoint
app.post('/api/bookings', async (req, res) => {
  try {
    const bookingData = req.body;
    
    // Validate required fields
    if (!bookingData.name || !bookingData.email || !bookingData.phone || !bookingData.service) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Calculate amount (in a real app, this would come from your pricing system)
    const amount = bookingData.budget || 1000; // Default to 1000 KSH if no budget provided

    let paymentResult = {};
    let cardLast4 = null;

    // Process payment based on method
    if (bookingData.paymentMethod === 'mpesa') {
      if (!bookingData.mpesaPhone) {
        return res.status(400).json({ error: 'M-Pesa phone number is required' });
      }
      
      // Initiate M-Pesa payment
      paymentResult = await initiateMpesaPayment(
        bookingData.mpesaPhone,
        amount,
        `Booking for ${bookingData.service}`
      );
    } else if (bookingData.paymentMethod === 'card') {
      if (!bookingData.cardNumber || !bookingData.cardExpiry || !bookingData.cardCvv || !bookingData.cardName) {
        return res.status(400).json({ error: 'Card details are incomplete' });
      }

      // Process card payment
      const cardPayment = await processCardPayment(
        {
          cardNumber: bookingData.cardNumber,
          cardExpiry: bookingData.cardExpiry,
          cardCvv: bookingData.cardCvv,
          cardName: bookingData.cardName
        },
        amount,
        `Booking for ${bookingData.service}`
      );

      if (!cardPayment.success) {
        return res.status(400).json({ error: 'Card payment failed' });
      }

      paymentResult = { paymentId: cardPayment.paymentId };
      cardLast4 = cardPayment.cardLast4;
    }

    // Save booking to database
    const bookingId = await saveBooking({
      ...bookingData,
      cardLast4,
      amount
    });

    res.json({
      success: true,
      bookingId,
      paymentResult
    });

  } catch (error) {
    console.error('Booking error:', error);
    res.status(500).json({ error: 'An error occurred while processing your booking' });
  }
});
 
// M-Pesa callback endpoint
app.post('/api/mpesa-callback', async (req, res) => {
  try {
    const callbackData = req.body;
    console.log('M-Pesa callback received:', callbackData);


    res.status(200).send();
  } catch (error) {
    console.error('Error processing M-Pesa callback:', error);
    res.status(500).send();
  }
});

// Start server
const PORT = process.env.PORT || 5500;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});