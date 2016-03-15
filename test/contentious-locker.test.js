(function (context) {
// -----------------------------------------------------------------------------

'use strict';

var id = '';
var dependencies = [
  'actually',
  'fs',
  'is',
  '../locker',
  'promise',
  'sinon',
  'actually/resolves',
  'criteria'
];

function factory(actually, fs, is, Locker, Promise, sinon, resolves) {
  /* globals scope, test */
  var filename = '/tmp/contention-locker.test.' + process.pid + '.lock';

  process.setMaxListeners(1024);

  scope('Contentious File Locker Tests',
  function () {
    var clock;
    var continuationLocker;
    var promiseLocker;
    var synchronousLocker;

    test.before(function () {
      clock = sinon.useFakeTimers(Date.now());
      continuationLocker = new Locker(filename);
      promiseLocker = new Locker(filename);
      synchronousLocker = new Locker(filename);
    });

    test.after(function () {
      clock.restore();
      unlock();
    });

    function lock() {
      synchronousLocker.lockSync();
    }

    function lockTemporarily() {
      clock.restore();
      lock();
      setTimeout(unlock, 10);
    }

    function unlock() {
      synchronousLocker.unlockSync();
    }

    test('Locks eventually.',
    function () {
      lockTemporarily();

      var promise = new Promise(function (resolve, reject) {
        var count = 0;
        var interval = 1;
        var max = 10;

        (function retry() {
          try {
            synchronousLocker.lockSync();
            resolve(count);
          } catch (e) {
            if (count < max) {
              count++;
              setTimeout(retry, interval);
            } else {
              reject(e);
            }
          }
        }());
      });

      return actually(resolves, function (count) {
        return count > 0;
      }, promise);
    });

    test('Locks eventually. [Continuation]',
    function () {
      lockTemporarily();

      var promise = new Promise(function (resolve, reject) {
        continuationLocker.lock(function (error) {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      return actually(resolves, promise);
    });

    test('Locks eventually. [Promise]',
    function () {
      lockTemporarily();

      return actually(resolves, promiseLocker.lock());
    });

    test('Locks when file is stale.',
    function () {
      lock();
      actually(synchronousLocker.lockedSync());
      clock.tick(5001);
      actually(synchronousLocker.lockedSync());
      clock.tick(5001);
      actually(synchronousLocker.lockedSync());
      clock.tick(5001);
      actually(!synchronousLocker.lockedSync());
      synchronousLocker.lockSync();
      clock.restore();
      actually(synchronousLocker.lockedSync());
    });

    test('Locks when file is stale. [Continuation]',
    function () {
      lock();

      var promise = new Promise(function (resolve, reject) {
        continuationLocker.lock(function (error) {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      var count = 0;
      (function tick() {
        if (count < 5) {
          count++;
          clock.tick(3000);
          setTimeout(tick);
          clock.tick(1);
        }
      }());

      return actually(resolves, function () {
        clock.restore();
        return actually(synchronousLocker.lockedSync());
      }, promise);
    });

    test('Locks when file is stale. [Promise]',
    function () {
      lock();

      var count = 0;
      (function tick() {
        if (count < 5) {
          count++;
          clock.tick(3000);
          setTimeout(tick);
          clock.tick(1);
        }
      }());

      return actually(resolves, function () {
        clock.restore();
        return actually(synchronousLocker.lockedSync());
      }, promiseLocker.lock());
    });
  });
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
