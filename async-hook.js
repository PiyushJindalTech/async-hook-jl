'use strict';

const asyncWrap = process.binding('async_wrap');
const TIMERWRAP = asyncWrap.Providers.TIMERWRAP;

const patchs = {
  'nextTick': require('./patches/next-tick.js'),
  'promise': require('./patches/promise.js'),
  'timers': require('./patches/timers.js')
};

const uidSymbol = Symbol('async-hook-uid');
const ignoreUIDs = new Set();

function State() {
  this.enabled = false;
  this.counter = 0;
}

function Hooks() {
  const initFns = this.initFns = [];
  const preFns = this.preFns = [];
  const postFns = this.postFns = [];
  const destroyFns = this.destroyFns = [];

  this.init = function (provider, uid, parentHandle) {
    this[uidSymbol] = uid;

    // Ignore TIMERWRAP, since setTimeout etc. is monkey patched
    if (provider === TIMERWRAP) {
      ignoreUIDs.add(uid);
      return;
    }

    // send the parent uid, not the parent handle. The user map the handle
    // objects appropiatly if needed.
    let parentUid = null;
    if (parentHandle !== null) parentUid = parentHandle[uidSymbol];

    // call hooks
    for (const hook of initFns) {
      hook(uid, this, provider, parentUid, parentHandle);
    }
  };

  this.pre = function () {
    const uid = this[uidSymbol];
    if (ignoreUIDs.has(uid)) return;

    // call hooks
    for (const hook of preFns) {
      hook(uid, this);
    }
  };

  this.post = function () {
    const uid = this[uidSymbol];
    if (ignoreUIDs.has(uid)) return;

    // call hooks
    for (const hook of postFns) {
      hook(uid, this);
    }
  };

  this.destroy = function (uid) {
    // Cleanup the ignore list if this uid should be ignored
    if (ignoreUIDs.has(uid)) {
      ignoreUIDs.delete(uid);
      return;
    }

    // call hooks
    for (const hook of destroyFns) {
      hook(uid);
    }
  };
}

Hooks.prototype.add = function (hooks) {
  if (hooks.init) this.initFns.push(hooks.init);
  if (hooks.pre) this.preFns.push(hooks.pre);
  if (hooks.post) this.postFns.push(hooks.post);
  if (hooks.destroy) this.destroyFns.push(hooks.destroy);
};

function removeElement(array, item) {
  const index = array.indexOf(item);
  if (index === -1) return;
  array.splice(index, 1);
}

Hooks.prototype.remove = function (hooks) {
  if (hooks.init) removeElement(this.initFns, hooks.init);
  if (hooks.pre) removeElement(this.preFns, hooks.pre);
  if (hooks.post) removeElement(this.postFns, hooks.post);
  if (hooks.destroy) removeElement(this.destroyFns, hooks.destroy);
};

function AsyncHook() {
  this._state = new State();
  this._hooks = new Hooks();

  // expose version for conflict detection
  this.version = require('./package.json').version;

  // expose the Providers map
  this.providers = asyncWrap.Providers;

  // apply patches
  for (const key of Object.keys(patchs)) {
    patchs[key].call(this);
  }

  // setup async wrap
  asyncWrap.setupHooks(this._hooks.init, this._hooks.pre, this._hooks.post, this._hooks.destroy);
}
module.exports = AsyncHook;

AsyncHook.prototype.addHooks = function (hooks) {
  this._hooks.add(hooks);
};

AsyncHook.prototype.removeHooks = function (hooks) {
  this._hooks.remove(hooks);
};

AsyncHook.prototype.enable = function () {
  this._state.enabled = true;
  asyncWrap.enable();
};

AsyncHook.prototype.disable = function () {
  this._state.enabled = false;
  asyncWrap.disable();
};
