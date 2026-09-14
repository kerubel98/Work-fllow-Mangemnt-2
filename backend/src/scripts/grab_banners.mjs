import net from 'net';

function grabBanner(host, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(3000);
    socket.on('data', (data) => {
      console.log(`Banner from ${host}:${port} -> ${JSON.stringify(data.toString())}`);
      socket.destroy();
      resolve();
    });
    socket.on('error', (err) => {
      console.log(`Error connecting to ${host}:${port} -> ${err.message}`);
      resolve();
    });
    socket.on('timeout', () => {
      console.log(`Timeout on ${host}:${port}`);
      socket.destroy();
      resolve();
    });
    socket.connect(port, host);
  });
}

async function run() {
  await grabBanner('127.0.0.1', 22);
  await grabBanner('192.168.22.210', 2222);
  await grabBanner('127.0.0.1', 21);
  await grabBanner('192.168.22.210', 21);
}

run();
