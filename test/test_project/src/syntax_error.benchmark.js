const error = require('./syntax_error');

const syntaxError = {
  benchmark: () => error.syntaxError(),
};

module.exports = { 'syntax_error-syntax-error': syntaxError };
