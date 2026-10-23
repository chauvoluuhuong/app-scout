// A minimal WebSocket server connection (RFC 6455): text frames, ping/pong, close.
// Hand-written so the plugin has no third-party dependencies.
import { createHash } from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function frame(opcode, payload) {
  const len = payload.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | opcode, len]);
  else if (len < 65536) {
    head = Buffer.alloc(4);
    head[0] = 0x80 | opcode;
    head[1] = 126;
    head.writeUInt16BE(len, 2);
  } else {
    head = Buffer.alloc(10);
    head[0] = 0x80 | opcode;
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([head, payload]);
}

/** Complete the upgrade handshake and return a small connection object. */
export function accept(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return null;
  }
  const acceptKey = createHash('sha1').update(key + GUID).digest('base64');
  socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${acceptKey}`, '', ''].join('\r\n'));
  socket.setNoDelay(true);

  const conn = {
    open: true,
    onmessage: () => {},
    onclose: () => {},
    send(obj) {
      if (!conn.open) return;
      socket.write(frame(0x1, Buffer.from(JSON.stringify(obj))));
    },
    close() {
      if (!conn.open) return;
      conn.open = false;
      socket.end(frame(0x8, Buffer.alloc(0)));
    },
  };

  let buf = Buffer.alloc(0);
  let parts = [];
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const fin = (buf[0] & 0x80) !== 0;
      const opcode = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        len = Number(buf.readBigUInt64BE(2));
        off = 10;
      }
      if (len > 4 * 1024 * 1024) return conn.close(); // nothing we accept is this large
      const maskLen = masked ? 4 : 0;
      if (buf.length < off + maskLen + len) return;
      const mask = masked ? buf.subarray(off, off + 4) : null;
      const data = Buffer.from(buf.subarray(off + maskLen, off + maskLen + len));
      if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      buf = buf.subarray(off + maskLen + len);

      if (opcode === 0x8) return conn.close();
      if (opcode === 0x9) {
        socket.write(frame(0xa, data));
        continue;
      }
      if (opcode === 0xa) continue;
      if (opcode === 0x1 || opcode === 0x0) {
        parts.push(data);
        if (!fin) continue;
        const text = Buffer.concat(parts).toString('utf8');
        parts = [];
        let msg;
        try {
          msg = JSON.parse(text);
        } catch {
          continue;
        }
        conn.onmessage(msg);
      }
    }
  });
  const done = () => {
    if (!conn.closed) {
      conn.closed = true;
      conn.open = false;
      conn.onclose();
    }
  };
  socket.on('close', done);
  socket.on('error', done);
  return conn;
}
