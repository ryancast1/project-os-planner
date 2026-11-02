type Poll = () => void | Promise<void>;
type Environment = {
  hidden: () => boolean;
  listen: (callback: () => void) => () => void;
  interval: (callback: () => void, ms: number) => ReturnType<typeof setInterval>;
  clear: (timer: ReturnType<typeof setInterval>) => void;
};

export function createVisiblePolling(environment: Environment) {
  const groups = new Map<number, { jobs: Set<{ run: Poll; pending: boolean }>; timer?: ReturnType<typeof setInterval> }>();
  let unlisten: (() => void) | undefined;
  function tick(group: { jobs: Set<{ run: Poll; pending: boolean }> }) {
    if (environment.hidden()) return;
    for (const job of group.jobs) {
      if (job.pending) continue;
      job.pending = true;
      void Promise.resolve().then(() => {
        if (group.jobs.has(job) && !environment.hidden()) return job.run();
      }).catch(() => {}).finally(() => { job.pending = false; });
    }
  }
  function update(resume = false) {
    for (const [ms, group] of groups) {
      if (environment.hidden()) {
        if (group.timer !== undefined) environment.clear(group.timer);
        group.timer = undefined;
      } else if (group.timer === undefined) {
        if (resume) tick(group);
        group.timer = environment.interval(() => tick(group), ms);
      }
    }
  }
  return (run: Poll, ms: number) => {
    let group = groups.get(ms);
    if (!group) { group = { jobs: new Set() }; groups.set(ms, group); }
    const job = { run, pending: false };
    group.jobs.add(job);
    unlisten ??= environment.listen(() => update(true));
    update();
    return () => {
      group.jobs.delete(job);
      if (group.jobs.size === 0) {
        if (group.timer !== undefined) environment.clear(group.timer);
        groups.delete(ms);
      }
      if (groups.size === 0) { unlisten?.(); unlisten = undefined; }
    };
  };
}

let subscribe: ReturnType<typeof createVisiblePolling> | undefined;
export function subscribeToVisiblePolling(run: Poll, ms: number) {
  subscribe ??= createVisiblePolling({
    hidden: () => document.hidden,
    listen: (callback) => {
      document.addEventListener("visibilitychange", callback);
      return () => document.removeEventListener("visibilitychange", callback);
    },
    interval: (callback, delay) => globalThis.setInterval(callback, delay),
    clear: (timer) => globalThis.clearInterval(timer),
  });
  return subscribe(run, ms);
}
