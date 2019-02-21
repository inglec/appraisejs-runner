const commandLineArgs = require('command-line-args');
const fs = require('fs');
const { isPromise } = require('promise-utils');
const util = require('util');
const { NodeVM } = require('vm2');

const {
  BEGIN_BENCHMARK,
  END_BENCHMARK,
  ERROR,
  RESULT,
} = require('./message_types');
const Timer = require('./utils/Timer');
const whitelistedModules = require('./whitelisted_modules');

const readFile = util.promisify(fs.readFile);

const createSandbox = () => (
  new NodeVM({
    // console: 'off',
    require: {
      external: true,
      builtin: whitelistedModules,
      context: 'sandbox',
    },
  })
);

const getSandboxedBenchmarks = (vm, filepath) => (
  // Compile benchmark file in VM2 to get sandboxed `module.exports`.
  readFile(filepath).then(contents => vm.run(contents, filepath))
);

const sendMessage = (type, body) => process.send({ type, body });

const runBenchmark = (id, benchmark) => {
  const {
    // name,
    benchmark: benchmarkFunc,
    // runs = 1,
    // max_attempts: maxAttempts = 1,
  } = benchmark;

  if (typeof benchmarkFunc !== 'function') {
    return Promise.reject(new Error(`no benchmark defined for "${id}"`));
  }

  const timer = new Timer();

  sendMessage(BEGIN_BENCHMARK);
  timer.start();

  // Run sandboxed benchmark.
  const result = benchmarkFunc();

  // Check if function was asynchronous.
  if (isPromise(result)) {
    return result
      .then(resolved => ({
        time: timer.stop(),
        result: resolved,
      }))
      .catch(error => ({
        time: timer.stop(),
        error,
      }))
      .finally(() => sendMessage(END_BENCHMARK));
  }

  // Function was synchronous.
  sendMessage(END_BENCHMARK);

  return Promise.resolve({
    time: timer.stop(),
    result,
  });
};

function main() {
  const args = commandLineArgs([
    { name: 'filepath', type: String },
    { name: 'benchmark', type: String },
  ]);

  const {
    benchmark: benchmarkId,
    filepath,
  } = args;

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

  const vm = createSandbox();

  getSandboxedBenchmarks(vm, filepath)
    .then(sandbox => runBenchmark(benchmarkId, sandbox[benchmarkId]))
    .then(result => sendMessage(RESULT, result))
    .catch(error => sendMessage(ERROR, error.message));
}

main();
