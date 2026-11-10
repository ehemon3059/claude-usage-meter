const test = require('node:test');
const assert = require('node:assert');
const dgram = require('node:dgram');
const http = require('node:http');
const T = require('../timesync');

const NTP_UNIX_DELTA = 2208988800; // seconds between 1900-01-01 and 1970-01-01

function ntpReply(unixMs) {
  const buf = Buffer.alloc(48);
  buf[0] = 0x1c; // LI 0, version 3, mode 4 (server)
  const secs = Math.floor(unixMs / 1000) + NTP_UNIX_DELTA;
  const frac = Math.round(((unixMs % 1000) / 1000) * 2 ** 32);
  buf.writeUInt32BE(secs, 40);
  buf.writeUInt32BE(frac, 44);
  return buf;
}

test('buildNtpRequest is a 48-byte SNTP v3 client packet', () => {
  const req = T.buildNtpRequest();
  assert.strictEqual(req.length, 48);
  assert.strictEqual(req[0], 0x1b);
});

test('parseNtpTransmitTime converts the NTP timestamp to Unix ms', () => {
  assert.strictEqual(T.parseNtpTransmitTime(ntpReply(1700000000500)), 1700000000500);
});

test('parseNtpTransmitTime rejects short or empty replies', () => {
  assert.throws(() => T.parseNtpTransmitTime(Buffer.alloc(20)));
  assert.throws(() => T.parseNtpTransmitTime(Buffer.alloc(48)));
});

test('serverNowFrom assumes the server stamped the midpoint of the round trip', () => {
  // Sent at local 1000, got reply at local 1200, server said 10100 -> server time is 10200 on arrival.
  assert.strictEqual(T.serverNowFrom(1000, 10100, 1200), 10200);
});

test('parseHttpDate reads an RFC 1123 Date header', () => {
  assert.strictEqual(T.parseHttpDate('Tue, 10 Nov 2026 12:00:00 GMT'), Date.UTC(2026, 10, 10, 12, 0, 0));
  assert.strictEqual(T.parseHttpDate('garbage'), null);
  assert.strictEqual(T.parseHttpDate(undefined), null);
});

test('syncTime turns the current server time from the first working source into an offset', async () => {
  let clock = 1000;
  const sources = [
    { name: 'bad', query: async () => { throw new Error('timeout'); } },
    // Resolves at local 1200 saying the server's "now" is 10100 -> server is 8900 ms ahead.
    { name: 'good', query: async () => { clock = 1200; return 10100; } },
  ];
  assert.deepStrictEqual(await T.syncTime(sources, () => clock), { offset: 8900, source: 'good' });
});

test('syncTime returns null when every source fails', async () => {
  const fail = { name: 'x', query: async () => { throw new Error('down'); } };
  assert.strictEqual(await T.syncTime([fail, fail], () => 0), null);
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function ntpServer(t, delayMs) {
  const server = dgram.createSocket('udp4');
  t.after(() => server.close());
  server.on('message', async (msg, rinfo) => {
    if (msg.length !== 48 || msg[0] !== 0x1b) return;
    await wait(delayMs);
    server.send(ntpReply(1700000000000), rinfo.port, rinfo.address);
  });
  await new Promise((r) => server.bind(0, '127.0.0.1', r));
  return server.address().port;
}

test('queryNtp returns the server time advanced by half the round trip', async (t) => {
  const port = await ntpServer(t, 200);
  const ms = await T.queryNtp('127.0.0.1', { port, timeoutMs: 2000 });
  assert.ok(Math.abs(ms - (1700000000000 + 100)) < 40, `got +${ms - 1700000000000} ms`);
});

test('queryNtp leaves the DNS lookup out of the round trip', async (t) => {
  const port = await ntpServer(t, 0);
  const slowLookup = async () => { await wait(300); return '127.0.0.1'; };
  const ms = await T.queryNtp('time.example', { port, timeoutMs: 2000, lookup: slowLookup });
  assert.ok(Math.abs(ms - 1700000000000) < 40, `got +${ms - 1700000000000} ms`);
});

test('queryNtp rejects when the server never answers', async (t) => {
  const server = dgram.createSocket('udp4');
  t.after(() => server.close());
  await new Promise((r) => server.bind(0, '127.0.0.1', r));
  await assert.rejects(T.queryNtp('127.0.0.1', { port: server.address().port, timeoutMs: 150 }), /timed out/);
});

test('queryHttpDate reads the Date header, adding half a second for its truncation', async (t) => {
  const server = http.createServer((_req, res) => {
    res.setHeader('Date', 'Tue, 10 Nov 2026 12:00:00 GMT');
    res.end();
  });
  t.after(() => server.close());
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const ms = await T.queryHttpDate(fetch, `http://127.0.0.1:${server.address().port}/`);
  assert.strictEqual(ms, Date.UTC(2026, 10, 10, 12, 0, 0) + 500);
});
