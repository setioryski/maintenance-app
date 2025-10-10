// setioryski/maintenance-app/maintenance-app-new9/server.js
const http = require('http');
const https = require('https');
const fs = require('fs'); // --- FIX: Added the missing fs module ---
const socketIo = require('socket.io');

function createServer(app) {
  let server;

  // For production (VPS), Nginx will handle SSL. We run a plain HTTP server.
  if (process.env.NODE_ENV === 'production') {
    console.log('Running in production mode (HTTP server).');
    server = http.createServer(app);
  } else {
    // For local development, we use mkcert's self-signed certificates for HTTPS.
    console.log('Running in development mode (HTTPS server).');
    try {
      const options = {
        key: fs.readFileSync('localhost+1-key.pem'),
        cert: fs.readFileSync('localhost+1.pem')
      };
      server = https.createServer(options, app);
    } catch (error) {
      console.error('Could not find SSL certificates for development.');
      console.error('Falling back to a standard HTTP server.');
      console.error('To use HTTPS locally, make sure localhost+1-key.pem and localhost+1.pem are in the project root.');
      server = http.createServer(app);
    }
  }

  const io = socketIo(server);
  return { server, io };
}

module.exports = createServer;