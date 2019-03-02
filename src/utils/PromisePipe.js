class PromisePipe {
  static isResult(obj) {
    return typeof obj === 'object' && Array.isArray(obj.errors) && 'result' in obj;
  }

  args(...args) {
    if (args.length === 1 && this.constructor.isResult(args[0])) {
      const { errors, result } = args[0];
      this.errors = errors;

      return Array.isArray(result) ? result : [result];
    }

    this.errors = [];
    return args;
  }

  return(result, errors, key) {
    if (!this.errors) {
      throw Error('`args` must be called before `return`');
    }

    return {
      result,
      errors: this.errors.concat(key ? { [key]: errors } : errors),
    };
  }
}

module.exports = PromisePipe;
