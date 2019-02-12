const _ = require('lodash');

const isPromise = func => func.constructor.name === 'Promise';

const promiseMap = (...args) => Promise.all(_.map(...args));

module.exports = { isPromise, promiseMap };
