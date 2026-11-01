const net = require('net');

/**
 * The visitor's real address. Requests can arrive through Cloudflare, where
 * Express sees a shared edge address. CF-Connecting-IP holds the real visitor,
 * but anyone can send that header directly, so it is believed only when the
 * connection comes from a published Cloudflare range
 * (https://www.cloudflare.com/ips/). Cloudflare overwrites it on every request.
 */
const cloudflare = new net.BlockList();
[
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18',
  '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17',
  '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
].forEach((c) => { const [ip, bits] = c.split('/'); cloudflare.addSubnet(ip, Number(bits), 'ipv4'); });
[
  '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32',
  '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
].forEach((c) => { const [ip, bits] = c.split('/'); cloudflare.addSubnet(ip, Number(bits), 'ipv6'); });

function clientIp(req) {
  const peer = String(req.ip || '').replace(/^::ffff:/, '');
  const claimed = String(req.get('cf-connecting-ip') || '').trim();
  const family = net.isIP(peer);
  const fromCloudflare = family ? cloudflare.check(peer, family === 6 ? 'ipv6' : 'ipv4') : false;
  return claimed && net.isIP(claimed) && fromCloudflare ? claimed : peer;
}

/** Makes req.ip the real visitor for rate limits, audit logs and everything else. */
function useClientIp(req, res, next) {
  Object.defineProperty(req, 'ip', { value: clientIp(req), configurable: true });
  next();
}

module.exports = { clientIp, useClientIp };
