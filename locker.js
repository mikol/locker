/**
 * A simple file locker with promise, async continuation, and sync support.
 *
 * @module locker
 */

(function (context) {
// -----------------------------------------------------------------------------

'use strict';

var id = 'locker';
var dependencies = ['fs', 'instance', 'is', 'promise', 'type'];

function factory(fs, instance, is, Promise, type) {
  var DEFAULTS = {
    // 1/2 a second starting at retry 122 with default exponential backoff.
    interval: 500,

    // Approximately 30 seconds with default exponential backoff.
    retries: 128,

    // Back off exponentially.
    retry: function (n) {
      if (n === 0) {
        return process.nextTick;
      } else if (n === 1) {
        return setImmediate;
      } else {
        var i = Math.min(this.interval, Math.pow(n, 1.2945));
        return function (f) {
          setTimeout(f, i);
        };
      }
    },

    // 15 seconds. A maximum of 95 retries with default exponential backoff.
    stale: 15000
  };

  /**
   * A file locking object configured with the lock `filename` and optional
   * parameters that define the timing of locking attempts. If a locker object
   * is holding a lock on a file when the process exits, it will make a best
   * effort to unlock the file.
   *
   * @example
   * var locker = new Locker('/tmp/example.lock');
   * ...
   * // Acquire the lock.
   * locker.lock().then(function () {
   *   // When the promise resolves, do some work with the file locked.
   *   ...
   *   // Then unlock the file.
   *   locker.unlock().then(...);
   * }, function (reason) {
   *   ...
   * });
   *
   * @param {string} filename - The pathname of the lock file.
   * @param {Object} [options]
   * @param {number} [options.interval=500] - The maximum number of milliseconds
   *     to wait before retrying to lock `filename`.
   * @param {number} [options.retries=128] - The maximum number of times to
   *     retry locking `filename` before giving up.
   * @param {function(number): Function} [options.retry=backOffExponentially()]
   *     - Given the number of attempts to lock `filename`, `options.retry()`
   *     should return a timer function that expects a callback function
   *     argument and calls it after no more than `options.interval`
   *     milliseconds.
   * @param {number} [options.stale=15000] - The age in milliseconds of
   *     `filename` before considering it to be invalid and therefor
   *     overwritable.
   *
   * @constructor
   */
  function Locker(filename, options) {
    instance.props(this, {
      count: {value: 0, writable: true},
      filename: filename,
      options: instance.defaults(options || {}, DEFAULTS)
    });

    var self = this;
    process.once('exit', function () {
      try {
        self.unlockSync();
      } catch (error) {
        console.error('Failed to remove lock file.', error.stack || error);
      }
    });
  }

  type(Locker).$implements({
    /**
     * Asynchronously checks if `this.filename` exists and is not stale (that
     * is, it is locked).
     *
     * @param {function(Error, boolean)=} [callback] - The continuation to call
     *     when the check is complete.
     *
     * @return {!(Promise<boolean>|undefined)} `undefined` if `callback` is
     *     specified. Otherwise, a promise that will eventually resolve to
     *     `true` if a lock is currently held.
     */
    locked: function (callback) {
      var self = this;
      var promise = new Promise(function (resolve, reject) {
        fs.stat(self.filename, function (error, stats) {
          if (error) {
            if (error.code === 'ENOENT') {
              // The lock file doesn’t exist.
              resolve(false);
            } else {
              // Maybe the lock file exists, but we couldn’t stat it.
              reject(error);
            }
          } else {
            if (isStale(stats, self.options.stale)) {
              // The lock file exists, but it’s stale.
              resolve(false);
            } else {
              // The lock file exists.
              resolve(true);
            }
          }
        });
      });

      if (is.function(callback)) {
        promise.then(function (value) {
          callback(null, value);
        }, callback);
      } else {
        return promise;
      }
    },

    /**
     * Synchronously checks if `this.filename` exists and is not stale (that is,
     * it is locked).
     *
     * @return {!boolean} `true` if `this.filename` exists and is not stale.
     *
     * @throws {Error} If there is a problem inspecting `this.filename`.
     */
    lockedSync: function () {
      var stats;

      try {
        stats = fs.statSync(this.filename);
      } catch (error) {
        if (error.code === 'ENOENT') {
          // The file doesn’t exist.
          return false;
        }
      }

      if (isStale(stats, this.options.stale)) {
        return false;
      }

      return true;
    },

    /**
     * Asynchronously writes `this.filename` after checking to ensure that the
     * file either does not exist or is stale, retrying until the file can be
     * written or the maximum number of attempts have been made.
     *
     * @param {function(Error)=} [callback] - The continuation to call when the
     *     lock is obtained or an error occurs.
     *
     * @return {!(Promise<boolean>|undefined)} `undefined` if `callback` is
     *     specified. Otherwise, a promise that will eventually resolve if the
     *     lock is obtained or reject otherwise.
     */
    lock: function (callback) {
      var self = this;

      var promise = new Promise(function (resolve, reject) {
        var pid = process.pid;
        var options = {flag: 'wx'};

        fs.writeFile(self.filename, pid, options, function (error) {
          if (error) {
            // The file exists. Check if it is stale.
            fs.stat(self.filename, function (statError, stats) {
              if (statError) {
                if (statError.code === 'ENOENT') {
                  // Now the file doesn’t exist. Try again immediately.
                  self.lock().then(resolve, reject);
                } else {
                  self.count = 0;
                  reject(statError);
                }
              } else {
                if (isStale(stats, self.options.stale)) {
                  // The file is stale. Try again as soon as it’s deleted.
                  self.unlock().then(function () {
                    self.lock().then(resolve, reject);
                  }, function (reason) {
                    self.count = 0;
                    reject(reason);
                  });
                } else {
                  // Use the retry function to try again after an interval.
                  if (self.count < self.options.retries) {
                    return self.options.retry(self.count++)(function () {
                      self.lock().then(resolve, reject);
                    });
                  } else {
                    // Give up.
                    self.count = 0;
                    reject(error);
                  }
                }
              }
            });
          } else {
            self.count = 0;
            resolve();
          }
        });
      });

      if (is.function(callback)) {
        promise.then(function () {
          callback();
        }, callback);
      } else {
        return promise;
      }
    },

    /**
     * Synchronously writes `this.filename` after checking to ensure that the
     * file either does not exist or is stale.
     *
     * @throws {Error} If the lock cannot be obtained.
     */
    lockSync: function () {
      var error;

      try {
        return fs.writeFileSync(this.filename, process.pid, {flag: 'wx'});
      } catch (e) {
        if (e.code === 'EEXIST') {
          error = e;
        } else {
          throw e;
        }
      }

      var stats = fs.statSync(this.filename);
      if (isStale(stats, this.options.stale)) {
        // The file is stale. Try again as soon as it’s deleted.
        try {
          this.unlockSync();
        } catch (e) {
          if (e.code !== 'ENOENT') {
            throw e;
          }
        }

        return this.lockSync();
      } else {
        throw error;
      }
    },

    /**
     * Asynchronously deletes `this.filename`.
     *
     * @param {function(Error)=} [callback] - The continuation to call when the
     *     lock is removed or an error occurs.
     *
     * @return {!(Promise<boolean>|undefined)} `undefined` if `callback` is
     *     specified. Otherwise, a promise that will eventually resolve to
     *     if the lock is removed.
     */
    unlock: function (callback) {
      var self = this;

      var promise = new Promise(function (resolve, reject) {
        fs.unlink(self.filename, function (error) {
          if (error && error.code !== 'ENOENT') {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      if (is.function(callback)) {
        promise.then(function () {
          callback();
        }, callback);
      } else {
        return promise;
      }
    },

    /**
     * Synchronously deletes `this.filename`.
     *
     * @throws {Error} If `this.filename` cannot be deleted.
     */
    unlockSync: function () {
      try {
        fs.unlinkSync(this.filename);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    }
  });

  return Locker;

  // ---------------------------------------------------------------------------
  // Utility Functions

  /**
   * Examines `stats` to determine if a file is older than `stale` milliseconds.
   *
   * @param {fs.Stats} stats - A stats object including `mtime` for the file of
   *     interest.
   * @param {number} stale - The age in milliseconds when a file should be
   *     considered stale.
   *
   * @return {!booolean} `true` if `stats.mtime` is older than `stale`
   *     milliseconds; `false` otherwise.
   *
   * @private
   */
  function isStale(stats, stale) {
    return Date.now() - stats.mtime > stale;
  }
}

// -----------------------------------------------------------------------------
var n = dependencies.length;
var o = 'object';
var r = /([^-_\s])[-_\s]+([^-_\s])/g;
function s(m, a, b) { return a + b.toUpperCase(); }
context = typeof global === o ? global : typeof window === o ? window : context;
if (typeof define === 'function' && define.amd) {
  define(dependencies, function () {
    return factory.apply(context, [].slice.call(arguments));
  });
} else if (typeof module === o && module.exports) {
  for (; n--;) { dependencies[n] = require(dependencies[n]); }
  module.exports = factory.apply(context, dependencies);
} else {
  for (; n--;) { dependencies[n] = context[dependencies[n]]; }
  context[id.replace(r, s)] = factory.apply(context, dependencies);
}
}(this));
