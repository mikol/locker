(function (context) {
// -----------------------------------------------------------------------------

'use strict';

var id = '';
var dependencies = [
  'actually',
  'fs',
  '../locker',
  'promise',
  'sinon',
  'actually/resolves',
  'actually/throws',
  'criteria'
];

function factory(actually, fs, Locker, Promise, sinon, resolves, throws) {
  /* globals scope, test */
  var filename = '/tmp/basic-locker.test.' + process.pid + '.lock';

  process.setMaxListeners(1024);

  scope('Basic File Locker Tests',
  function () {
    var clock;
    var locker;

    test.before(function () {
      clock = sinon.useFakeTimers(Date.now());
      locker = new Locker(filename);
    });

    test.after(function () {
      clock.restore();

      try {
        fs.unlinkSync(filename);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    });

    test('Merely constructing a locker doesn’t lock the file.',
    function () {
      actually(!locker.lockedSync());
    });

    test('Merely constructing a locker doesn’t lock the file. [Continuation]',
    function () {
      var promise = new Promise(function (resolve, reject) {
        locker.locked(function (error, value) {
          if (error) {
            reject(error);
          } else {
            resolve(value);
          }
        });
      });

      return actually(resolves, function (a) {
        return a === false;
      }, promise);
    });

    test('Merely constructing a locker doesn’t lock the file. [Promise]',
    function () {
      return actually(resolves, function (a) {
        return a === false;
      }, locker.locked());
    });

    test('Lock file exists.',
    function () {
      fs.writeFileSync(filename, process.pid);
      actually(locker.lockedSync());
    });

    test('Lock file exists. [Continuation]',
    function () {
      fs.writeFile(filename, process.pid);

      var promise = new Promise(function (resolve, reject) {
        fs.writeFileSync(filename, process.pid);
        locker.locked(function (error, value) {
          if (error) {
            reject(error);
          } else {
            resolve(value);
          }
        });
      });

      return actually(resolves, actually, promise);
    });

    test('Lock file exists. [Promise]',
    function () {
      fs.writeFileSync(filename, process.pid);
      return actually(resolves, actually, locker.locked());
    });

    test('Lock file is stale.',
    function () {
      fs.writeFileSync(filename, process.pid);
      clock.tick(15250);
      actually(!locker.lockedSync());
    });

    test('Lock file is stale. [Continuation]',
    function () {
      fs.writeFileSync(filename, process.pid);
      clock.tick(15000);

      var promise = new Promise(function (resolve, reject) {
        locker.locked(function (error, value) {
          if (error) {
            reject(error);
          } else {
            resolve(value);
          }
        });
      });

      return actually(resolves, function (a) {
        return a === false;
      }, promise);
    });

    test('Lock file is stale. [Promise]',
    function () {
      fs.writeFileSync(filename, process.pid);
      clock.tick(15000);

      return actually(resolves, function (a) {
        return a === false;
      }, locker.locked());
    });

    test('File can be locked.',
    function () {
      locker.lockSync();
      fs.statSync(filename);
    });

    test('File can be locked. [Continuation]',
    function () {
      var promise = new Promise(function (resolve, reject) {
        locker.lock(function (error, value) {
          if (error) {
            reject(error);
          } else {
            resolve(value);
          }
        });
      });

      return actually(resolves, function () {
        return !!fs.statSync(filename);
      }, promise);
    });

    test('File can be locked. [Promise]',
    function () {
      return actually(resolves, function () {
        return !!fs.statSync(filename);
      }, locker.lock());
    });

    test('File can be unlocked.',
    function () {
      fs.writeFileSync(filename, process.pid);
      fs.statSync(filename);

      locker.unlockSync();

      actually(throws, 'ENOENT', function () {
        fs.statSync(filename);
      });
    });

    test('File can be unlocked. [Continuation]',
    function () {
      fs.writeFileSync(filename, process.pid);
      fs.statSync(filename);

      var promise = new Promise(function (resolve, reject) {
        locker.unlock(function (error, value) {
          if (error) {
            reject(error);
          } else {
            resolve(value);
          }
        });
      });

      return actually(resolves, function () {
        return actually(throws, 'ENOENT', function () {
          fs.statSync(filename);
        });
      }, promise);
    });

    test('File can be unlocked. [Promise]',
    function () {
      fs.writeFileSync(filename, process.pid);
      fs.statSync(filename);

      return actually(resolves, function () {
        return actually(throws, 'ENOENT', function () {
          fs.statSync(filename);
        });
      }, locker.unlock());
    });

    test('File can be unlocked even if it doesn’t exist.',
    function () {
      locker.unlockSync();
    });

    test('File can be unlocked even if it doesn’t exist. [Continuation]',
    function () {
      fs.writeFileSync(filename, process.pid);
      fs.statSync(filename);

      var promise = new Promise(function (resolve, reject) {
        locker.unlock(function (error, value) {
          if (error) {
            reject(error);
          } else {
            resolve(value);
          }
        });
      });

      return actually(resolves, promise);
    });

    test('File can be unlocked even if it doesn’t exist. [Promise]',
    function () {
      return actually(resolves, locker.unlock());
    });

    test('File is checked, locked, and unlocked.',
    function () {
      actually(!locker.lockedSync());

      locker.lockSync();

      actually(throws, function () {
        locker.lockSync();
      });

      actually(locker.lockedSync());

      locker.unlockSync();

      actually(!locker.lockedSync());
    });

    test('File is checked, locked, and unlocked. [Continuation]',
    function () {
      var promise = new Promise(function (resolve, reject) {
        locker.locked(function (error, locked) {
          if (error) {
            reject(error);
          } else {
            try {
              actually(!locked);
            } catch (e) {
              reject(e);
            }

            locker.lock(function (error) {
              if (error) {
                reject(error);
              } else {
                locker.locked(function (error, locked) {
                  if (error) {
                    reject(error);
                  } else {
                    try {
                      actually(locked);
                    } catch (e) {
                      reject(e);
                    }

                    locker.unlock(function (error) {
                      if (error) {
                        reject(error);
                      } else {

                        locker.locked(function (error, locked) {
                          if (error) {
                            reject(error);
                          } else {
                            resolve(locked);
                          }
                        });
                      }
                    });
                  }
                });
              }
            });
          }
        });
      });

      return actually(resolves, function (locked) {
        return locked === false;
      }, promise);
    });

    test('File is checked, locked, and unlocked. [Promise]',
    function () {
      var promise = locker.locked().then(function (locked) {
        actually(!locked);
        return locker.lock();
      }).then(function () {
        return locker.locked();
      }).then(function (locked) {
        actually(locked);
        return locker.unlock();
      }).then(function () {
        return locker.locked();
      });

      return actually(resolves, function (locked) {
        return locked === false;
      }, promise);
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
