class PromisePipe {
  constructor() {
    this.errors = [];
  }

  static isResult(obj) {
    return typeof obj === 'object' && Array.isArray(obj.errors) && 'result' in obj;
  }

  args(...args) {
    const [first, ...rest] = args;

    if (this.constructor.isResult(first)) {
      const { errors, result } = first;
      this.errors = errors;

      return [result, ...rest];
    }

    return args;
  }

  return(result, errors = [], stage, fields = {}) {
    const newError = {
      ...fields,
      errors,
    };

    if (stage) {
      newError.stage = stage;
    }

    return {
      result,
      errors: this.errors.concat(newError),
    };
  }
}

module.exports = PromisePipe;
