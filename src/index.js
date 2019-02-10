const find = require('find');
const fs = require('fs');
const _ = require('lodash');
const path = require('path');
const createPromiseLogger = require('promise-logging');
const util = require('util');
const { NodeVM } = require('vm2');

const readFile = util.promisify(fs.readFile);

const logger = createPromiseLogger('Benchmark');

// Promise wrapper for find.file.
const findFiles = (pattern, root) => new Promise((resolve, reject) => {
  find
    .file(pattern, root, files => resolve(files))
    .error(err => reject(err));
});

const discoverBenchmarkFiles = rootDir => findFiles(/\.benchmark.js$/, rootDir);

const getSandboxedBenchmarks = (benchmarkPaths) => {
  const promises = benchmarkPaths.map((benchmarkPath) => {
    // Create a new Node VM sandbox.
    // TODO: Is a unique VM necessary for each benchmark file?
    const vm = new NodeVM({
      require: {
        external: true,
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
        context: 'sandbox',
      },
    });

    return readFile(benchmarkPath)
      .then(benchmarkFile => vm.run(benchmarkFile, benchmarkPath));
  });

  return Promise.all(promises);
};

const runBenchmark = (
  id,
  name,
  benchmark,
  runs = 1,
  timeout = 1000,
  maxAttempts = 1,
) => {
  if (typeof benchmark === 'function') {
    logger.info(`Running benchmark '${id}'`);
    benchmark();
    return Promise.resolve();
  }
  else {
    return Promise.reject(`No benchmark defined for '${id}'`);
  }
};

const runBenchmarkCollection = (benchmarks) => {
  const promises = _.map(benchmarks, (benchmark, id) => runBenchmark(
    id,
    benchmark.name,
    benchmark.benchmark,
    benchmark.runs,
    benchmark.timeout,
    benchmark.max_attempts,
  ));

  return Promise.all(promises);
};

const benchmarkProject = (rootDir) => {
  return discoverBenchmarkFiles(rootDir)
    .then(getSandboxedBenchmarks)
    .then(values => Promise.all(values.map(runBenchmarkCollection)))
};

module.exports = { benchmarkProject };
