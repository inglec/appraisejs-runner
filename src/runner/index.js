const commandLineArgs = require('command-line-args');

const {
  COMPLETED,
  ERROR,
  GET_BENCHMARK_RESULTS,
  STARTED,
} = require('../constants/messages');
const {
  attemptBenchmark,
  getSandboxedBenchmarkDefinitions,
  validateSandboxedBenchmarkDefinition,
} = require('./benchmark');
const { sendMessage } = require('./utils');

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

  sendMessage(GET_BENCHMARK_RESULTS, STARTED);
  getSandboxedBenchmarkDefinitions(filepath)
    .then(sandbox => validateSandboxedBenchmarkDefinition(sandbox[benchmarkId]))
    .then(definition => attemptBenchmark(definition.benchmark, definition.runs))
    .then(() => sendMessage(GET_BENCHMARK_RESULTS, COMPLETED))
    .catch(error => sendMessage(GET_BENCHMARK_RESULTS, ERROR, error.message));
}

main();
