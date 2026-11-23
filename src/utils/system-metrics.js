import os from 'node:os';
import { getBrowserMetrics } from '../audit/browser.js';

let lastCpuUsage = process.cpuUsage();
let lastCpuTime = Date.now();

export function getSystemMetrics(activeJobs = 0, activeAudits = 0) {
  const mem = process.memoryUsage();
  const totalSystemMem = os.totalmem();
  const freeSystemMem = os.freemem();
  const usedSystemMem = totalSystemMem - freeSystemMem;

  // Cálculo de uso de CPU do processo Node.js
  const now = Date.now();
  const timeDiff = (now - lastCpuTime) * 1000; // microsegundos
  const cpuDiff = process.cpuUsage(lastCpuUsage);
  lastCpuUsage = process.cpuUsage();
  lastCpuTime = now;

  const cpuPercent = timeDiff > 0
    ? Math.min(100, Math.round(((cpuDiff.user + cpuDiff.system) / timeDiff) * 100 / (os.cpus().length || 1)))
    : 0;

  const browserMetrics = getBrowserMetrics();

  return {
    timestamp: new Date().toISOString(),
    process: {
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime()),
      cpuPercent,
      ramMb: Math.round(mem.rss / (1024 * 1024)),
      heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
      heapTotalMb: Math.round(mem.heapTotal / (1024 * 1024))
    },
    system: {
      totalRamMb: Math.round(totalSystemMem / (1024 * 1024)),
      usedRamMb: Math.round(usedSystemMem / (1024 * 1024)),
      freeRamMb: Math.round(freeSystemMem / (1024 * 1024)),
      ramUsagePercent: Math.round((usedSystemMem / totalSystemMem) * 100),
      cpuCores: os.cpus().length
    },
    workers: {
      activeJobs,
      activeAudits,
      browserRunning: browserMetrics.running,
      browserPid: browserMetrics.pid,
      browserPagesProcessed: browserMetrics.pagesProcessed
    }
  };
}
