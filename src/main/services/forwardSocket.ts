import type { Socket } from 'node:net';

export function attachLocalForwardSocket(localSocket: Socket, sockets: Set<Socket>): void {
  sockets.add(localSocket);
  localSocket.once('close', () => sockets.delete(localSocket));
  localSocket.on('error', () => localSocket.destroy());
}
