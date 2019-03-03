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

  return(result, errors, key) {
    return {
      result,
      errors: this.errors.concat(key ? { [key]: errors } : errors),
    };
  }
}

module.exports = PromisePipe;
