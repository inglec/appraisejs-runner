const isPromise = func => func.constructor.name === 'Promise';

module.exports = { isPromise };
