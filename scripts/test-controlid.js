const http = require('http');

const data = JSON.stringify({ login: 'admin', password: 'admin' });

const req = http.request({
  hostname: '192.168.0.100',
  port: 80,
  path: '/login.fcgi',
  method: 'POST',
  localAddress: '192.168.0.50',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  },
  timeout: 3000
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', body);
  });
});

req.on('error', (err) => {
  console.error('Error:', err.message);
});

req.write(data);
req.end();
