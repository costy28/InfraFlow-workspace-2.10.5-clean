const http = require("node:http");
const { config } = require("./config");
const app = require("../app");

process.on("uncaughtException", (err) => {
  if (err.code === "EPERM" || err.code === "EACCES") {
    console.error("EROARE PERMISIUNI: Rulează ca Administrator sau");
    console.error(`verifică că portul ${process.env.INFRAFLOW_PORT || process.env.PORT || config.port || 4180} e disponibil`);
  }
  console.error(err);
  process.exit(1);
});

const server = http.createServer(app);

server.listen(config.port, () => {
  console.log(`${config.appName} ${config.version} pornit pe http://localhost:${config.port}`);
}).on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Portul ${config.port} este ocupat. Oprește procesul existent sau schimbă INFRAFLOW_PORT.`);
    process.exit(1);
  }
  throw err;
});
