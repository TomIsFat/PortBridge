export interface SuggestedPorts {
  localPort: number;
  remotePort: number;
}

/**
 * 从规则名称中提取数字作为端口建议（实时补全用）。
 * - 取名称中所有连续数字（如 "mysql-3306"、"3306-mysql"、"a-1234-b-5678"）。
 * - 仅保留 1-65535 范围内的合法端口；没有合法端口则返回 undefined（不自动补全）。
 * - 1 个数字：本地端口与远程端口都填它。
 * - 2 个及以上数字：第一个填本地端口，第二个填远程端口。
 */
export function extractPortsFromName(name: string): SuggestedPorts | undefined {
  const matches = name.match(/\d+/g);
  if (!matches) return undefined;

  const ports = matches
    .map((match) => Number(match))
    .filter((port) => Number.isInteger(port) && port >= 1 && port <= 65535);
  if (ports.length === 0) return undefined;

  return {
    localPort: ports[0],
    remotePort: ports.length > 1 ? ports[1] : ports[0]
  };
}
