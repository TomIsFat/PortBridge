import fs from 'node:fs';
import { Client, type ConnectConfig } from 'ssh2';
import type { ServerConfig } from '../../shared/types';
import { resolveJumpChain } from './jumpChain';

export function buildConnectConfig(server: ServerConfig): ConnectConfig {
  const config: ConnectConfig = {
    host: server.host,
    port: server.port,
    username: server.username,
    readyTimeout: 15000,
    keepaliveInterval: 30000,
    keepaliveCountMax: 3
  };

  if (server.authType === 'password') {
    config.password = server.password;
  } else {
    if (server.privateKey?.trim()) {
      config.privateKey = server.privateKey;
    } else if (server.privateKeyPath && fs.existsSync(server.privateKeyPath)) {
      config.privateKey = fs.readFileSync(server.privateKeyPath, 'utf8');
    } else {
      throw new Error('私钥文件不存在');
    }
    config.passphrase = server.privateKeyPassphrase || undefined;
  }

  return config;
}

export function closeSshClient(ssh?: Client): void {
  if (!ssh) return;
  ssh.on('error', () => {
    // Keep late ssh2 errors from escaping after the tunnel lifecycle moved on.
  });
  ssh.end();
  ssh.destroy();
}

/**
 * 建立 SSH 连接。
 * 传入 via 时通过跳板：经 via 客户端 forwardOut 到 server.host:server.port，
 * 再用该转发流完成握手（ssh2 的 sock 选项）。
 */
export function connectSsh(ssh: Client, server: ServerConfig, via?: Client): Promise<void> {
  const config = buildConnectConfig(server);
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      ssh.off('ready', onReady);
      ssh.off('error', onError);
      ssh.off('close', onClose);
    };
    const onReady = (): void => {
      cleanup();
      resolve();
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const onClose = (): void => {
      cleanup();
      reject(new Error('SSH 连接在握手完成前断开'));
    };

    ssh.once('ready', onReady);
    ssh.once('error', onError);
    ssh.once('close', onClose);

    if (via) {
      via.forwardOut('127.0.0.1', 0, server.host, server.port, (err, stream) => {
        if (err) {
          cleanup();
          reject(err);
          return;
        }
        ssh.connect({ ...config, sock: stream });
      });
    } else {
      ssh.connect(config);
    }
  });
}

export interface JumpConnection {
  /** 中间跳板客户端（最外层在前），连接期间必须保持打开；调用方负责关闭。 */
  jumpClients: Client[];
  /** 完整链路 [目标, 一级跳板, ..., 最外层跳板]。 */
  chain: ServerConfig[];
}

/**
 * 连接目标服务器，支持多级跳板（ProxyJump）。
 * 无跳板时等价于 connectSsh；有跳板时从最外层逐级转发到目标。
 * 中途失败会关闭已建立的中间客户端再抛错。
 */
export async function connectWithJump(
  ssh: Client,
  target: ServerConfig,
  getServer: (id: string) => ServerConfig | undefined
): Promise<JumpConnection> {
  const chain = resolveJumpChain(getServer, target);
  if (chain.length === 1) {
    await connectSsh(ssh, target);
    return { jumpClients: [], chain };
  }

  const jumpClients: Client[] = [];
  try {
    let via: Client | undefined;
    // 从最外层跳板逐级向内转发到目标。
    for (let index = chain.length - 1; index >= 1; index--) {
      const hop = chain[index];
      const client = new Client();
      // 中间客户端的生命周期由调用方管理，避免握手后错误逃逸到主进程。
      client.on('error', () => {
        // 跳板断开时目标连接会随之关闭，由上层触发重连。
      });
      jumpClients.push(client);
      await connectSsh(client, hop, via);
      via = client;
    }
    await connectSsh(ssh, target, via);
    return { jumpClients, chain };
  } catch (error) {
    for (const client of jumpClients) closeSshClient(client);
    throw error;
  }
}
