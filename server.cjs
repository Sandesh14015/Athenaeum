const http = require("http");
const fs = require("fs");
const path = require("path");

const port = 8765;
const host = "127.0.0.1";
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

http.createServer((request, response) => {
  const requestedPath = request.url === "/" ? "index.html" : request.url.split("?")[0];
  const filePath = path.join(__dirname, requestedPath);

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream"
    });
    response.end(data);
  });
}).listen(port, host, () => {
  console.log(`Philosophy archive: http://${host}:${port}`);
});
