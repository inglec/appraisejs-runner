const commandLineArgs = require('command-line-args');
const fs = require('fs');
const tripwire = require('tripwire');
const util = require('util');
const { NodeVM } = require('vm2');

const { isPromise } = require('./utils/async');
const Timer = require('./utils/Timer');

const readFile = util.promisify(fs.readFile);

const TIMEOUT_MAX = 5000;

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

    // Load modules inside of sandbox.
    context: 'sandbox',
  },
});

const getSandboxedBenchmarks = (vm, filepath) => (
  // Compile benchmark file in VM2 to get sandboxed module.exports.
  readFile(filepath).then(contents => vm.run(contents, filepath))
);

const runBenchmark = (id, benchmark) => {
  const {
    // name,
    benchmark: benchmarkFunc,
    // runs = 1,
    timeout = 1000,
    // max_attempts: maxAttempts = 1,
  } = benchmark;

  if (typeof benchmarkFunc !== 'function') {
    return Promise.reject(new Error(`no benchmark defined for '${id}'`));
  }

  const timer = new Timer();
  tripwire.resetTripwire(timeout > TIMEOUT_MAX ? TIMEOUT_MAX : timeout);

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
      }))
      .finally(tripwire.clearTripwire);
  }

  tripwire.clearTripwire();

  return Promise.resolve({
    time: timer.stop(),
    result,
  });
};

function main() {
  const options = commandLineArgs([
    { name: 'filepath', type: String },
    { name: 'benchmark', type: String },
  ]);

  const {
    benchmark: benchmarkId,
    filepath,
  } = options;

  if (!filepath) {
    // eslint-disable-next-line no-console
    console.error('no filepath specified');
    process.exit(1);
  }
  if (!benchmarkId) {
    // eslint-disable-next-line no-console
    console.error('no benchmark specified');
    process.exit(1);
  }

  // The tripwire module throws an exception after the specified timeout.
  // process.on('uncaughtException', () => {
  //   // eslint-disable-next-line no-console
  //   console.error(`The event loop was blocked for longer than ${TIMEOUT_MAX} milliseconds`);
  //   process.exit(1);
  // });
  //
  // const vm = createSandbox();
  // const sandbox = getSandboxedBenchmarks(vm, filepath);
  // const benchmark = sandbox[benchmarkId];
  //
  // // Run benchmark and send result to parent process.
  // runBenchmark(benchmarkId, benchmark)
  //   .then(result => process.send(result))
  //   .then(() => process.exit(0)); // FIX: May not be necessary.

  console.log('Hello from the child process!');
}

main();
