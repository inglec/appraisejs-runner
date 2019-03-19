const { readFile: readFileCallback } = require('fs');
const { pickBy } = require('lodash/object');
const { repeatWhile } = require('promise-utils');
const { promisify } = require('util');
const { NodeVM } = require('vm2');

const { validateBenchmarkDefinition } = require('../utils/benchmarks');
const Timer = require('../utils/Timer');
const {
  COMPLETED,
  ERROR,
  GET_BENCHMARK_DEFINITION,
  RESULT,
  RUN_BENCHMARK,
  STARTED,
  VALIDATE_BENCHMARK_DEFINITION,
  WARNING,
} = require('../constants/messages');
const whitelistedModules = require('../whitelisted_modules');
const { sendMessage } = require('./utils');

const readFile = promisify(readFileCallback);

const getSandboxedBenchmarkDefinitions = async (filepath) => {
  const vm = new NodeVM({
    console: 'off',
    require: {
      external: true,
      builtin: whitelistedModules,
      context: 'sandbox',
    },
  });

  // Compile benchmark file in VM2 to get sandboxed `module.exports`
  sendMessage(GET_BENCHMARK_DEFINITION, STARTED);
  const sandbox = await readFile(filepath).then(contents => vm.run(contents, filepath));
  sendMessage(GET_BENCHMARK_DEFINITION, COMPLETED);

  return sandbox;
};

const validateSandboxedBenchmarkDefinition = (sandboxedBenchmarkDefinition) => {
  sendMessage(VALIDATE_BENCHMARK_DEFINITION, STARTED);

  // Validate benchmark definition against schema
  const { definition, warnings } = validateBenchmarkDefinition(sandboxedBenchmarkDefinition);

  warnings.forEach(warning => sendMessage(VALIDATE_BENCHMARK_DEFINITION, WARNING, warning));
  sendMessage(
    VALIDATE_BENCHMARK_DEFINITION,
    RESULT,
    pickBy(definition, key => key !== 'benchmark'),
  );

  return definition;
};

const getAsyncResult = async (promise, stopTimer) => {
  const value = await promise;
  const time = stopTimer();

  return { time, value };
};

const getSyncResult = (value, stopTimer) => {
  const time = stopTimer();
  return { time, value };
};

const runBenchmark = async (benchmark) => {
  const timer = new Timer();
  const stopTimer = () => timer.stop();

  sendMessage(RUN_BENCHMARK, STARTED);
  timer.start();

  try {
    const benchmarked = benchmark();

    // Wait for sync / async benchmark to return
    const promise = benchmarked instanceof Promise
      ? getAsyncResult(benchmarked, stopTimer)
      : getSyncResult(benchmarked, stopTimer);

    const result = await promise;
    sendMessage(RUN_BENCHMARK, RESULT, result);

    return result;
  } catch (error) {
    timer.stop();
    sendMessage(RUN_BENCHMARK, ERROR, error.message);

    return { error };
  }
};

const attemptBenchmark = async (benchmark, runs) => {
  // Run benchmark `runs` times, or until an error occurs
  const results = await repeatWhile(
    () => runBenchmark(benchmark),
    (result, index) => index === 0 || (index < runs && !('error' in result)),
  );

  return results.values();
};

module.exports = {
  attemptBenchmark,
  getSandboxedBenchmarkDefinitions,
  validateSandboxedBenchmarkDefinition,
};
