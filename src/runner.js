const commandLineArgs = require('command-line-args');
const { readFile: readFileCallback } = require('fs');
const { pickBy } = require('lodash');
const { repeat } = require('promise-utils');
const { promisify } = require('util');
const { NodeVM } = require('vm2');

const { validateBenchmarkDefinition } = require('./utils/benchmarks');
const Timer = require('./utils/Timer');
const {
  ERROR,
  GET_BENCHMARK_DEFINITION,
  RESULT,
  RUN_BENCHMARK,
  STARTED,
  VALIDATE_BENCHMARK_DEFINITION,
  WARNING,
} = require('./constants/messages');
const { DELIMITER, StageError } = require('./error_types');
const whitelistedModules = require('./whitelisted_modules');

const readFile = promisify(readFileCallback);

const getSandboxedBenchmarkDefinitions = (vm, filepath) => (
  // Compile benchmark file in VM2 to get sandboxed `module.exports`
  readFile(filepath).then(contents => vm.run(contents, filepath))
);

const sendMessage = (stage, status, body) => process.send({ body, stage, status });

const getAsyncResult = (promise, getTime) => (
  promise
    .then((value) => {
      const time = getTime();
      return { time, value };
    })
    .catch((error) => {
      const time = getTime();
      return { time, error };
    })
);

const getSyncResult = (value, getTime) => {
  const time = getTime();

  return Promise.resolve({ time, value });
};

const runBenchmark = (benchmark) => {
  const timer = new Timer();
  const getTime = () => timer.stop();

  sendMessage(RUN_BENCHMARK, STARTED);
  timer.start();

  const benchmarked = benchmark();

  // Wait for sync / async benchmark to return
  return (
    benchmarked instanceof Promise
      ? getAsyncResult(benchmarked, getTime)
      : getSyncResult(benchmarked, getTime)
  ).then(result => sendMessage(RUN_BENCHMARK, RESULT, result));
};

const repeatBenchmark = (benchmark, runs) => (
  repeat(() => runBenchmark(benchmark), runs)
);

function main() {
  const args = commandLineArgs([
    { name: 'filepath', type: String },
    { name: 'benchmark', type: String },
  ]);

  const { benchmark: benchmarkId, filepath } = args;

  if (!filepath) {
    throw Error('no filepath specified');
  }
  if (!benchmarkId) {
    throw Error('no benchmark specified');
  }

  const vm = new NodeVM({
    console: 'off',
    require: {
      external: true,
      builtin: whitelistedModules,
      context: 'sandbox',
    },
  });

  sendMessage(GET_BENCHMARK_DEFINITION, STARTED);
  getSandboxedBenchmarkDefinitions(vm, filepath)
    .catch((error) => {
      throw StageError({ stage: GET_BENCHMARK_DEFINITION, error: error.message });
    })
    .then((sandbox) => {
      sendMessage(VALIDATE_BENCHMARK_DEFINITION, STARTED);

      try {
        const { definition, warnings } = validateBenchmarkDefinition(sandbox[benchmarkId]);
        warnings.forEach(warning => sendMessage(VALIDATE_BENCHMARK_DEFINITION, WARNING, warning));
        sendMessage(
          VALIDATE_BENCHMARK_DEFINITION,
          RESULT,
          pickBy(definition, key => key !== 'benchmark'),
        );

        return definition;
      } catch (error) {
        throw StageError({ type: VALIDATE_BENCHMARK_DEFINITION, error: error.message });
      }
    })
    .then(({ benchmark, runs }) => (
      // eslint-disable-next-line promise/no-nesting
      repeatBenchmark(benchmark, runs).catch((error) => {
        throw StageError({ stage: RUN_BENCHMARK, error: error.message });
      })
    ))
    .catch((error) => {
      let stage;
      let errorMessage = error.message;

      if (errorMessage.includes(DELIMITER)) {
        [stage, errorMessage] = errorMessage.split(DELIMITER);
      }

      sendMessage(stage, ERROR, errorMessage);
    });
}

main();
