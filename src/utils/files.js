const find = require('find');

// Promise wrapper for find.file.
const findFiles = (pattern, root) => (
  new Promise((resolve, reject) => {
    find
      .file(pattern, root, files => resolve(files))
      .error(err => reject(err));
  })
);

module.exports = { findFiles };
