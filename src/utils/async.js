const _ = require('lodash');

const isPromise = func => func.constructor.name === 'Promise';

const promiseMap = (...args) => Promise.all(_.map(...args));

const promiseWait = (...args) => (
  Promise.all(
    _
      .map(...args)
      .map(result => (isPromise(result) ? result.catch(error => error) : result)),
  )
);

// Split an array of resolved or rejected values into [resolvedArray, rejectedArray].
const promisePartition = results => (
  _.partition(results, result => !(result instanceof Error))
);

module.exports = {
  isPromise,
  promiseMap,
  promisePartition,
  promiseWait,
};
