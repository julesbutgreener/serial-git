const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const express = require('express');
const socketIo = require('socket.io');
const admin = require('firebase-admin');
require('dotenv').config();  // Load environment variables from .env file

// Initialize Firebase Admin
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL
};

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
  console.log('Firebase Admin initialized for serial reader');
} catch (error) {
  console.error('Firebase Admin initialization error:', error);
  process.exit(1);
}

const db = admin.database();

// Create an Express application
const app = express();
const server = app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});

// Set up WebSocket server using Socket.IO
const io = socketIo(server);

// Manually specify the correct port path here
const portName = '/dev/tty.usbmodem14201';  // Update this with your actual serial port
const serialPort = new SerialPort({
  path: portName,
  baudRate: 9600
});

// Serial port opened
serialPort.on('open', () => {
  console.log(`Serial port ${portName} is open`);
});

// Handle incoming data from the Arduino
serialPort.on('data', (data) => {
  const receivedData = data.toString().trim();
  console.log('Data received from Arduino:', receivedData);

  // Convert received data to a number
  const capacitiveTouchValue = parseFloat(receivedData);

  // Validate the data to ensure it's a valid number
  if (isNaN(capacitiveTouchValue)) {
    console.log('⚠️ Invalid data received, skipping: ', receivedData);
    return;  // If the data is not a valid number, do not push it to Firebase
  }

  // Save the valid data to Firebase
  const sensorData = {
    capacitiveTouch: capacitiveTouchValue,
    timestamp: Date.now(),
    source: 'arduino'
  };

  // Save to Firebase
  const ref = db.ref('sensor-data');
  ref.push(sensorData)
    .then(() => {
      console.log('✅ Data saved to Firebase');
    })
    .catch(error => {
      console.error('Error saving data to Firebase:', error);
    });

  // Emit data to the frontend (circle resizing)
  io.emit('circleSize', capacitiveTouchValue);  // Send capacitive touch value to frontend
});

// Handle serial port errors
serialPort.on('error', (err) => {
  console.error('Error with Serial Port:', err.message);
});

// Serve the frontend (p5.js sketch)
app.use(express.static('public'));
