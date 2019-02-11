const isAsync = func => func.constructor.name === 'AsyncFunction';

const isPromise = object => object.then === 'function';

module.exports = {
  isAsync,
  isPromise,
};
