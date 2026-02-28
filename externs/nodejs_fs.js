/**
 * @externs
 * @see http://nodejs.org/api/fs.html
 */
// /closure-compiler-master/contrib/nodejs/fs.js

/**
 * @interface
 * @const
 */
var NodeFileSystem = function () {};

/**
 * @nosideeffects
 * @param {(number|string)} filename
 * @param {(!Object<string, string>|string)=} options
 * @return {string}
 */
NodeFileSystem.prototype.readFileSync = function (filename, options) {};

/**
 * @interface
 * @const
 */
NodeFileSystem.Stats = function () {};

/**
 * @nosideeffects
 * @return {boolean}
 */
NodeFileSystem.Stats.prototype.isFile = function () {};

/**
 * @nosideeffects
 * @return {boolean}
 */
NodeFileSystem.Stats.prototype.isDirectory = function () {};

/**
 * @nosideeffects
 * @const {number}
 */
NodeFileSystem.Stats.prototype.size;

/**
 * @nosideeffects
 * @param {string} path
 * @return {!NodeFileSystem.Stats}
 */
NodeFileSystem.prototype.statSync = function (path) {};

/**
 * @nosideeffects
 * @param {string} path
 * @param {string} flags
 * @return {number}
 */
NodeFileSystem.prototype.openSync = function (path, flags) {};

/**
 * @param {number} fd
 * @param {!Buffer} buff
 * @param {number=} offset
 * @param {number=} length
 * @param {number=} position
 * @return {number}
 */
NodeFileSystem.prototype.writeSync = function (fd, buff, offset, length, position) {};

/**
 * @nosideeffects
 * @param {number} fd
 * @param {!Buffer} buff
 * @param {number} offset
 * @param {number} length
 * @param {number} position
 * @return {number}
 */
NodeFileSystem.prototype.readSync = function (fd, buff, offset, length, position) {};

/**
 * @param {number} fd
 * @return {void}
 */
NodeFileSystem.prototype.closeSync = function (fd) {};

/**
 * @nosideeffects
 * @param {string} path
 * @param {!Object<string, *>=} options
 * @return {!NodeReadableStream}
 */
NodeFileSystem.prototype.createReadStream = function (path, options) {};

/**
 * @nosideeffects
 * @param {string} path
 * @param {!Object<string, *>=} options
 * @return {!NodeWritableStream}
 */
NodeFileSystem.prototype.createWriteStream = function (path, options) {};

/**
 * @param {string} path
 * @return {void}
 */
NodeFileSystem.prototype.mkdirSync = function (path) {};
