function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

function notFound(res, req) {
  sendJson(res, 404, {
    ok: false,
    error: {
      code: "ROUTE_NOT_FOUND",
      message: "Ruta API inexistenta.",
      method: req.method,
      path: new URL(req.url, "http://localhost").pathname
    }
  });
}

module.exports = { sendJson, notFound };

