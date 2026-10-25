'use strict'
const { normalizeGatewayHost, resolveDemoRoute } = require('../../../scripts/lib/demo-gateway-route')
function createDemoGatewayRouteHarness({ readSnapshot, clock }) {
  if (process.env.NODE_ENV !== 'test') throw Error('synthetic_test_only')
  if (typeof readSnapshot !== 'function' || typeof clock !== 'function') throw Error('invalid_gateway_harness')
  return async (req, res) => {
    const send = (status, code, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
      res.end(JSON.stringify(data || { code }))
    }
    try {
      if (process.env.NODE_ENV !== 'test') return send(503, 'synthetic_test_only')
      if (req.method !== 'GET') return send(405, 'read_only')
      if (req.url !== '/route-probe') return send(400, 'invalid_gateway_request')
      const rawHosts = req.rawHeaders.filter((_, i) => i % 2 === 0).filter(name => name.toLowerCase() === 'host')
      if (rawHosts.length !== 1 || Object.keys(req.headers).some(key => key === 'forwarded' || key.startsWith('x-forwarded-')))
        return send(400, 'invalid_gateway_request')
      let host
      try { host = normalizeGatewayHost(req.headers.host) } catch { return send(400, 'invalid_gateway_request') }
      const snapshot = await readSnapshot()
      const decision = resolveDemoRoute({ registry: snapshot.registry, bindings: snapshot.bindings, host, now: clock() })
      return send(200, null, decision)
    } catch (error) {
      return send(error.code === 'gateway_route_denied' ? 404 : 503,
        error.code === 'gateway_route_denied' ? 'route_unavailable' : 'gateway_unavailable')
    }
  }
}
module.exports = { createDemoGatewayRouteHarness }
