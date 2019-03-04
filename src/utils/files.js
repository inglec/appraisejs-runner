const find = require('find');
const { relative } = require('path');

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
  const path = relative(root, filepath);

  const regex = /^\.\.\//;
  if (regex.exec(path)) {
    throw Error(`filepath "${filepath}" does not contain prefix "${root}"`);
  }

  return path;
};

module.exports = { findFiles, stripRoot };
