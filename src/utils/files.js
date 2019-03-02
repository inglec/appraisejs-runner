const find = require('find');
const { sep: pathSeparator } = require('path');

// Promise wrapper for find.file
const findFiles = (pattern, root) => (
  new Promise((resolve, reject) => {
    find
      .file(pattern, root, files => resolve(files))
      .error(error => reject(error));
  })
);

// Remove root directory from filepath
const stripRoot = (filepath, root) => {
  const split = filepath.split(root);
  const { length } = split;

  if (length === 1 && split[0] === filepath) {
    throw Error(`filepath "${filepath}" does not contain prefix "${root}"`);
  }

  const remaining = split[length - 1];
  return remaining.charAt(0) === pathSeparator ? remaining.substring(1) : remaining;
};

module.exports = { findFiles, stripRoot };
