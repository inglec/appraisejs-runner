const commandLineArgs = require('command-line-args');
const fs = require('fs');
const util = require('util');
const { NodeVM } = require('vm2');

const Timer = require('./utils/Timer');
const {
  BEGIN_BENCHMARK,
  END_BENCHMARK,
  ERROR,
  RESULT,
} = require('./message_types');
const whitelistedModules = require('./whitelisted_modules');

const readFile = util.promisify(fs.readFile);

const getSandboxedBenchmarks = (vm, filepath) => (
  // Compile benchmark file in VM2 to get sandboxed `module.exports`.
  readFile(filepath).then(contents => vm.run(contents, filepath))
);

const sendMessage = (type, body) => process.send({ type, body });

const runBenchmark = (benchmarkId, benchmark) => {
  const {
    // name,
    benchmark: benchmarkFunc,
    // runs = 1,
    // max_attempts: maxAttempts = 1,
  } = benchmark;

  if (typeof benchmarkFunc !== 'function') {
    throw Error(`no benchmark function defined for "${benchmarkId}"`);
  }

  const timer = new Timer();

  // Run sandboxed benchmark.
  sendMessage(BEGIN_BENCHMARK, { benchmarkId });
  timer.start();

  const benchmarked = benchmarkFunc();

  // Check if benchmark is asynchronous.
  if (benchmarked instanceof Promise) {
    const promise = benchmarked;

    return promise
      .then((value) => {
        const time = timer.stop();
        return { time, value };
      })
      .catch((error) => {
        const time = timer.stop();
        return { time, error };
      })
      .then((result) => {
        sendMessage(END_BENCHMARK, { benchmarkId });
        return result;
      });
  }

  // Function was synchronous.
  const time = timer.stop();
  const value = benchmarked;
  sendMessage(END_BENCHMARK, { benchmarkId });

  return { value, time };
};

function main() {
  const args = commandLineArgs([
    { name: 'filepath', type: String },
    { name: 'benchmark', type: String },
  ]);

  const { benchmark: benchmarkId, filepath } = args;

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

  const vm = new NodeVM({
    // console: 'off',
    require: {
      external: true,
      builtin: whitelistedModules,
      context: 'sandbox',
    },
  });

  getSandboxedBenchmarks(vm, filepath)
    .then(sandbox => runBenchmark(benchmarkId, sandbox[benchmarkId]))
    .then(result => sendMessage(RESULT, { benchmarkId, result }))
    .catch(error => sendMessage(ERROR, { benchmarkId, error: error.message }));
}

main();
