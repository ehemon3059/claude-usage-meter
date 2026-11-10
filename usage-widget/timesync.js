// Internet time for the clock: asks NTP servers (UDP 123), falling back to an HTTPS Date header
// for networks that block NTP. Result is an offset to add to Date.now().
const dgram = require('node:dgram');
const dns = require('node:dns');

const NTP_UNIX_DELTA = 2208988800; // seconds between 1900-01-01 (NTP epoch) and 1970-01-01

/** SNTP client request: LI 0, version 3, mode 3 (client); the rest stays zero. */
function buildNtpRequest() {
  const buf = Buffer.alloc(48);
  buf[0] = 0x1b;
  return buf;
}

/** Server's transmit timestamp (bytes 40-47) as Unix milliseconds. */
function parseNtpTransmitTime(buf) {
  if (!buf || buf.length < 48) throw new Error('short NTP reply');
  const secs = buf.readUInt32BE(40);
  const frac = buf.readUInt32BE(44);
  if (secs === 0) throw new Error('empty NTP transmit time');
  return (secs - NTP_UNIX_DELTA) * 1000 + Math.round((frac / 2 ** 32) * 1000);
}

/** Server time at local t1, assuming the server stamped the middle of the round trip t0..t1. */
function serverNowFrom(t0, serverMs, t1) {
  return serverMs + (t1 - t0) / 2;
}

function parseHttpDate(value) {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** Tries each {name, query} in order; query resolves to the server's current time in Unix ms. */
async function syncTime(sources, now = Date.now) {
  for (const { name, query } of sources) {
    try {
      const serverNow = await query();
      return { offset: serverNow - now(), source: name };
    } catch {
      // try the next source
    }
  }
  return null;
}

const lookupIPv4 = (host) => dns.promises.lookup(host, { family: 4 }).then((r) => r.address);

/** Server's current time (Unix ms) when the reply arrives. */
async function queryNtp(host, { port = 123, timeoutMs = 3000, lookup = lookupIPv4 } = {}) {
  // Resolve first, so DNS time isn't mistaken for network delay in the round trip.
  const address = await lookup(host);
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    let finished = false;
    const done = (err, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      sock.close();
      if (err) reject(err);
      else resolve(value);
    };
    const timer = setTimeout(() => done(new Error(`NTP ${host} timed out`)), timeoutMs);
    sock.on('error', (err) => done(err));
    let t0 = 0;
    sock.on('message', (msg) => {
      const t1 = Date.now();
      try { done(null, serverNowFrom(t0, parseNtpTransmitTime(msg), t1)); } catch (err) { done(err); }
    });
    t0 = Date.now();
    sock.send(buildNtpRequest(), port, address, (err) => { if (err) done(err); });
  });
}

/**
 * Server's current time from its Date header. The header is truncated to whole seconds, so add
 * 500 ms (the expected truncation); one-way latency is small next to that and is ignored.
 */
async function queryHttpDate(fetchFn, url) {
  const res = await fetchFn(url, { method: 'HEAD', cache: 'no-store' });
  const ms = parseHttpDate(res.headers.get('date'));
  if (ms === null) throw new Error(`no Date header from ${url}`);
  return ms + 500;
}

module.exports = {
  buildNtpRequest, parseNtpTransmitTime, serverNowFrom, parseHttpDate, syncTime, queryNtp, queryHttpDate,
};
