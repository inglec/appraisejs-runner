const promise = () => new Promise((resolve) => {
  setTimeout(() => resolve('promise'), 1000);
});

const async = async () => {
  const value = await new Promise((resolve) => {
    setTimeout(() => resolve('async await'), 1000);
  });
  return value;
};

module.exports = { async, promise };
