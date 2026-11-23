import { createId } from '../utils/text.js';

export class JobManager {
  constructor() {
    this.jobs = new Map();
  }

  create(input, runner) {
    const id = createId('job');
    const job = {
      id,
      status: 'executando',
      input,
      phase: 'discovery',
      completed: 0,
      total: 0,
      current: '',
      error: '',
      startedAt: new Date().toISOString(),
      finishedAt: null
    };
    this.jobs.set(id, job);

    Promise.resolve()
      .then(() => runner((progress) => Object.assign(job, progress)))
      .then((results) => {
        job.status = 'concluido';
        job.results = results.map((lead) => lead.id);
      })
      .catch((error) => {
        job.status = 'erro';
        job.error = error.message;
      })
      .finally(() => {
        job.finishedAt = new Date().toISOString();
      });
    return job;
  }

  get(id) {
    return this.jobs.get(id) || null;
  }

  list() {
    return [...this.jobs.values()].slice(-20).reverse();
  }
}
