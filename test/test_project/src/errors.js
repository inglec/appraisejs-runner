const syntaxError = () => {
  // Mis-spell `const`.
  cont x = 5;
  return x;
};

module.exports = { syntaxError };
