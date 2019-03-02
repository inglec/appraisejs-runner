const async = require('./async');

const asyncBenchmark = {
  benchmark: () => async.async(),
};

const promise = {
  benchmark: () => async.promise(),
};

module.exports = { 'async-async': asyncBenchmark, 'async-promise': promise };
