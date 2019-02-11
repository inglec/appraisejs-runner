const find = require('find');
const fs = require('fs');
const _ = require('lodash');
const createPromiseLogger = require('promise-logging');
const util = require('util');
const { NodeVM } = require('vm2');

const { isPromise } = require('./utils/async');
const Timer = require('./utils/Timer');

const readFile = util.promisify(fs.readFile);

// Promise wrapper for find.file.
const findFiles = (pattern, root) => (
  new Promise((resolve, reject) => {
    find
      .file(pattern, root, files => resolve(files))
      .error(err => reject(err));
  })
);

const discoverBenchmarkFiles = rootDir => findFiles(/\.benchmark.js$/, rootDir);

const getSandboxedBenchmarks = (filepath) => {
  // Create a new Node VM sandbox.
  // TODO: Is a unique VM necessary for each benchmark file?
  const vm = new NodeVM({
    require: {
      // Allow loading of external Node modules.
      external: true,

      // Whitelisted internal Node modules.
      builtin: [
        'async_hooks',
        'assert',
        'buffer',
        // 'child_process',
        'console',
        'constants',
        'crypto',
        'cluster',
        'dgram',
        'dns',
        'domain',
        'events',
        'fs',
        'http',
        'http2',
        'https',
        'inspector',
        'module',
        'net',
        'os',
        'path',
        'perf_hooks',
        'process',
        'punycode',
        'querystring',
        'readline',
        'repl',
        'stream',
        'string_decoder',
        'sys',
        'timers',
        'tls',
        'tty',
        'url',
        'util',
        'v8',
        // 'vm',
        'zlib',
      ],

      // Load modules inside sandbox.
      context: 'sandbox',
    },
  });

  // Run benchmark file in VM2 to get sandboxed module.exports.
  return readFile(filepath).then(contents => vm.run(contents, filepath));
};

const runBenchmark = (
  id,
  name,
  benchmark,
  // runs = 1,
  // timeout = 1000,
  // maxAttempts = 1,
) => {
  if (typeof benchmark !== 'function') {
    return Promise.reject(new Error(`no benchmark defined for '${id}'`));
  }

  const timer = new Timer();
  timer.start();

  // Run sandboxed benchmark.
  const result = benchmark();

  // Check if function was asynchronous.
  if (result && isPromise(result)) {
    return result
      .then(resolved => ({
        time: timer.stop(),
        result: resolved,
      }))
      .catch(error => ({
        time: timer.stop(),
        error,
      }));
  }

  // Function was synchronous.
  return Promise.resolve({
    time: timer.stop(),
    result,
  });
};

const runBenchmarks = (benchmarks) => {
  const promises = _.map(benchmarks, (benchmark, id) => {
    const promise = runBenchmark(
      id,
      benchmark.name,
      benchmark.benchmark,
      benchmark.runs,
      benchmark.timeout,
      benchmark.max_attempts,
    );

    // Convert errors.
    return promise.catch(error => Promise.resolve({ error }));
  });

  return Promise.all(promises);
};

const benchmarkProject = (rootDir) => {
  const logger = createPromiseLogger('Benchmark');

  const logResults = results => (
    results.forEach(result => logger.info(result.time))
  );

  return discoverBenchmarkFiles(rootDir)
    .then(filepaths => Promise.all(filepaths.map(getSandboxedBenchmarks)))
    .then(benchmarksByFile => Promise.all(benchmarksByFile.map(runBenchmarks)))
    .then(resultsByFile => resultsByFile.forEach(logResults));
};

module.exports = { benchmarkProject };
