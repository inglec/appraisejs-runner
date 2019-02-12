const find = require('find');
const fs = require('fs');
const createPromiseLogger = require('promise-logging');
const util = require('util');
const { NodeVM } = require('vm2');

const { isPromise, promiseMap } = require('./utils/async');
const Timer = require('./utils/Timer');

const readFile = util.promisify(fs.readFile);

// const TIMEOUT_MAX = 5000;

// Promise wrapper for find.file.
const findFiles = (pattern, root) => (
  new Promise((resolve, reject) => {
    find
      .file(pattern, root, files => resolve(files))
      .error(err => reject(err));
  })
);

const discoverBenchmarkFiles = rootDir => findFiles(/\.benchmark.js$/, rootDir);

const getSandboxedBenchmarks = (vm, filepath) => (
  // Run benchmark file in VM2 to get sandboxed module.exports.
  readFile(filepath).then(contents => vm.run(contents, filepath))
);

const runBenchmark = (id, benchmark) => {
  const {
    // name,
    benchmark: benchmarkFunc,
    // runs = 1,
    // timeout = benchmark.timeout > TIMEOUT_MAX ? TIMEOUT_MAX : 1000,
    // max_attempts: maxAttempts = 1,
  } = benchmark;

  if (typeof benchmarkFunc !== 'function') {
    return Promise.reject(new Error(`no benchmark defined for '${id}'`));
  }

  const timer = new Timer();
  timer.start();

  // Run sandboxed benchmark.
  const result = benchmarkFunc();

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

  return Promise.resolve({
    time: timer.stop(),
    result,
  });
};

const runBenchmarks = benchmarks => (
  promiseMap(benchmarks, (benchmark, id) => (
    // Convert errors when running benchmark.
    // FIX: This is probably not good.
    runBenchmark(id, benchmark).catch(error => Promise.resolve({ error }))
  ))
);

const createSandbox = () => new NodeVM({
  console: 'inherit',
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

const benchmarkProject = (rootDir) => {
  // Create VM2 sandbox to run benchmarks in.
  const vm = createSandbox();
  const logger = createPromiseLogger('Benchmark');

  const logResults = results => results.forEach(result => logger.info(result.time));

  return discoverBenchmarkFiles(rootDir)
    .then(filepaths => promiseMap(filepaths, filepath => getSandboxedBenchmarks(vm, filepath)))
    .then(benchmarksByFile => promiseMap(benchmarksByFile, runBenchmarks))
    .then(resultsByFile => promiseMap(resultsByFile, logResults));
};

module.exports = {
  benchmarkProject,
  createSandbox,
  discoverBenchmarkFiles,
  getSandboxedBenchmarks,
  runBenchmark,
  runBenchmarks,
};
