import assert from 'node:assert/strict';
import net from 'node:net';
import { after, describe, it } from 'node:test';
import { attachLocalForwardSocket } from './forwardSocket';

async function createSocketPair(): Promise<{ server: net.Server; local: net.Socket; remote: net.Socket }> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('未能获取本地测试端口');
  }

  const [local, remote] = await Promise.all([
    new Promise<net.Socket>((resolve) => {
      server.once('connection', resolve);
    }),
    new Promise<net.Socket>((resolve, reject) => {
      const socket = net.connect(address.port, '127.0.0.1', () => resolve(socket));
      socket.once('error', reject);
    })
  ]);

  return { server, local, remote };
}

describe('attachLocalForwardSocket', () => {
  const resources: Array<{ server: net.Server; local: net.Socket; remote: net.Socket }> = [];

  after(() => {
    for (const resource of resources) {
      resource.local.destroy();
      resource.remote.destroy();
      resource.server.close();
    }
  });

  it('destroys the local socket on ECONNRESET without an uncaught exception', async () => {
    const pair = await createSocketPair();
    resources.push(pair);
    const sockets = new Set<net.Socket>();
    const uncaught: Error[] = [];
    const onUncaught = (error: Error): void => {
      uncaught.push(error);
    };

    process.on('uncaughtException', onUncaught);
    attachLocalForwardSocket(pair.local, sockets);
    assert.equal(sockets.has(pair.local), true);

    const resetError = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
    pair.local.emit('error', resetError);
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });

    process.off('uncaughtException', onUncaught);
    assert.equal(uncaught.length, 0);
    assert.equal(pair.local.destroyed, true);
  });

  it('removes the socket from the tracking set when it closes', async () => {
    const pair = await createSocketPair();
    resources.push(pair);
    const sockets = new Set<net.Socket>();
    attachLocalForwardSocket(pair.local, sockets);

    await new Promise<void>((resolve) => {
      pair.local.once('close', () => resolve());
      pair.local.destroy();
    });

    assert.equal(sockets.has(pair.local), false);
  });
});
