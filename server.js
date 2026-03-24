const fs = require('fs');
const http = require('http');
const path = require('path');

const server = http.createServer((req, res) => {
  // Sirve el index.html
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  
  // Si es una ruta sin extensión, sirve index.html
  if (!path.extname(filePath)) {
    filePath = path.join(__dirname, 'index.html');
  }

  // Lee y sirve el archivo
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.readFile(path.join(__dirname, 'index.html'), (err2, data2) => {
        res.end(data2);
      });
      return;
    }

    // Establece el tipo de contenido correcto
    const ext = path.extname(filePath);
    let contentType = 'text/html; charset=utf-8';
    if (ext === '.js') contentType = 'application/javascript';
    if (ext === '.css') contentType = 'text/css';
    if (ext === '.json') contentType = 'application/json';

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
