import { dialog } from 'electron';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import { Client } from 'ssh2';
import { z } from 'zod';
import { checkPortSchema, createServerSchema, idSchema, listByServerSchema, type CreateServerInput } from '../../shared/schemas';
import type { ServerConfig } from '../../shared/types';
import type { ServerRepository } from '../db/serverRepository';
import { checkPortAvailable } from '../utils/checkPort';
import type { LogService } from '../services/LogService';
import type { TunnelManager } from '../services/TunnelManager';
import { closeSshClient, connectWithJump } from '../services/sshConnect';
import { registerHandler } from './safeHandler';

function buildTestTarget(input: CreateServerInput): ServerConfig {
  return {
    id: '__connection-test__',
    groupId: input.groupId,
    name: input.name,
    host: input.host,
    port: input.port,
    username: input.username,
    authType: input.authType,
    password: input.password,
    privateKey: input.privateKey,
    privateKeyPath: input.privateKeyPath,
    privateKeyPassphrase: input.privateKeyPassphrase,
    jumpServerId: input.jumpServerId,
    autoReconnect: false,
    reconnectInterval: 0,
    createdAt: '',
    updatedAt: ''
  };
}

function testSshConnection(input: CreateServerInput, serverRepository: ServerRepository): Promise<boolean> {
  const target = buildTestTarget(input);
  const ssh = new Client();
  ssh.on('error', () => {
    // 避免一次性握手监听消费后，后续 ssh2 错误逃逸到主进程。
  });

  const jumpClients: Client[] = [];
  const finish = (): void => {
    for (const client of jumpClients) closeSshClient(client);
    closeSshClient(ssh);
  };

  return new Promise((resolve, reject) => {
    const fail = (error: unknown): void => {
      finish();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    ssh.once('ready', () => {
      resolve(true);
      finish();
    });
    ssh.once('error', (error) => fail(error));

    connectWithJump(ssh, target, (id) => (id === target.id ? target : serverRepository.get(id, true)))
      .then((result) => {
        jumpClients.push(...result.jumpClients);
      })
      .catch(fail);
  });
}

export function registerRuntimeHandlers(tunnelManager: TunnelManager, logService: LogService, serverRepository: ServerRepository): void {
  registerHandler('runtime:startTunnel', idSchema, (input: z.infer<typeof idSchema>) => tunnelManager.startTunnel(input.id));
  registerHandler('runtime:stopTunnel', idSchema, (input: z.infer<typeof idSchema>) => tunnelManager.stopTunnel(input.id));
  registerHandler('runtime:restartTunnel', idSchema, (input: z.infer<typeof idSchema>) => tunnelManager.restartTunnel(input.id));
  registerHandler('runtime:startServerTunnels', listByServerSchema, (input) => tunnelManager.startServerTunnels(input.serverId));
  registerHandler('runtime:stopServerTunnels', listByServerSchema, (input) => tunnelManager.stopServerTunnels(input.serverId));
  registerHandler('runtime:getStates', null, () => tunnelManager.getTunnelStates());
  registerHandler('runtime:checkPort', checkPortSchema, (input) => checkPortAvailable(input.host, input.port));
  registerHandler('runtime:testServerConnection', createServerSchema, (input) => testSshConnection(input, serverRepository));
  registerHandler('logs:list', null, () => logService.list());
  registerHandler('logs:clear', null, () => {
    logService.clear();
    return true;
  });
  registerHandler('files:selectPrivateKey', null, async () => {
    const result = await dialog.showOpenDialog({
      title: '选择私钥文件',
      properties: ['openFile'],
      filters: [
        { name: 'Private Keys', extensions: ['pem', 'key', 'ppk'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePaths[0]) return null;
    const path = result.filePaths[0];
    return {
      path,
      content: await readFile(path, 'utf8')
    };
  });
}
