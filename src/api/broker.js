/*
 * Broker — Director REST + Socket.IO client for a Control4 driver web tab.
 *
 * Clean-room implementation from API_ENDPOINTS.md (no vendor source was
 * available to copy). Reads apihost/driverid/apitoken from the query string
 * the Director iframe injects, then exposes:
 *   - REST: getItems, renameItem, getProperties/setProperty, getDeviceVariables,
 *           executeCommand/executeDeviceCommand, getActions/executeAction,
 *           getDirectorVersion
 *   - Real-time: getPropertyObservable/getVariableObservable/getVariablesObservable,
 *           subscribeOnDataToUI/subscribeItemOnDataToUI, backed by a socket.io
 *           client fetched from the driver's own host.
 *
 * Set Broker.log = function(scope, message, detail) {} to receive a trace of
 * every REST call and socket event (used by index.js to feed the on-page log).
 *
 * See BROKER.md in this folder for a full usage guide with examples.
 */
(function (global) {
  'use strict';

  // ?debug=1 in the tab URL traces every REST call and socket event to the console.
  Broker.log = getQueryParam('debug') === '1'
    ? function (scope, message, detail) { console.debug('[' + scope + ']', message, detail === undefined ? '' : detail); }
    : null;

  /**
   * log(scope, message, detail)
   * Internal trace hook. Forwards to Broker.log if the host page set one
   * (index.js points it at the on-screen Logs tab); no-ops otherwise.
   */
  function log(scope, message, detail) {
    if (typeof Broker.log === 'function') {
      Broker.log(scope, message, detail);
    }
  }

  /**
   * warn(scope, message, detail)
   * Like log(), but also always written to console.warn — used for events
   * that mean live updates may be lost (subscribe failed, disconnect, ...).
   */
  function warn(scope, message, detail) {
    console.warn('[' + scope + ']', message, detail === undefined ? '' : detail);
    log(scope, message, detail);
  }

  // -- Minimal replay-subject (no RxJS dependency available in this webview) --

  /**
   * Subject()
   * Plain observer list: subscribe(fn) registers a callback and returns an
   * object with unsubscribe(); next(val) calls every registered callback.
   * Never replays past values to new subscribers — see ReplaySubject1 below.
   */
  function Subject() {
    this._observers = [];
  }
  Subject.prototype.subscribe = function (fn) {
    var self = this;
    this._observers.push(fn);
    return {
      unsubscribe: function () {
        var idx = self._observers.indexOf(fn);
        if (idx !== -1) self._observers.splice(idx, 1);
      }
    };
  };
  Subject.prototype.next = function (val) {
    this._observers.slice().forEach(function (fn) { fn(val); });
  };
  Subject.prototype.complete = function () {
    this._observers = [];
  };

  /**
   * ReplaySubject1(initial, hasInitial)
   * A Subject that remembers its most recent value and immediately replays
   * it to any new subscriber. This is what makes getPropertyObservable(name)
   * and getVariableObservable(name) safe to subscribe to at any time — a
   * late subscriber still gets the current value instead of waiting for the
   * next change.
   */
  function ReplaySubject1(initial, hasInitial) {
    Subject.call(this);
    this._hasValue = !!hasInitial;
    this.value = initial;
  }
  ReplaySubject1.prototype = Object.create(Subject.prototype);
  ReplaySubject1.prototype.next = function (val) {
    this._hasValue = true;
    this.value = val;
    Subject.prototype.next.call(this, val);
  };
  ReplaySubject1.prototype.subscribe = function (fn) {
    if (this._hasValue) fn(this.value);
    return Subject.prototype.subscribe.call(this, fn);
  };

  /** getQueryParam(name) — reads a single value out of window.location.search. */
  function getQueryParam(name) {
    return new URLSearchParams(global.location.search).get(name);
  }

  // -- Broker -----------------------------------------------------------------

  /**
   * new Broker(options)
   *
   * options.subscribeVariables — falsy to disable the real-time layer entirely
   *   (REST-only: getProperties/setProperty/executeAction/executeCommand still
   *   work); truthy to open the Socket.IO connection and start pushing live
   *   property/variable updates. After every Socket.IO reconnect both
   *   subscriptions are rebuilt and the variables re-read (pollVariables).
   *   The live push can still miss updates — callers that must stay current
   *   should also call pollVariables() periodically.
   *
   * Reads apihost/driverid/apitoken from the page's query string (the
   * Director iframe is expected to inject these) and throws immediately if
   * any is missing. Seeds properties from localStorage so bound fields have
   * something to show before the first network round-trip resolves, then
   * kicks off init() (fire-and-forget — the constructor does not await it).
   */
  function Broker(options) {
    this.options = options || {};

    this.apihost = getQueryParam('apihost');
    this.driverid = getQueryParam('driverid');
    this.apitoken = getQueryParam('apitoken');

    if (!this.apihost || !this.driverid || !this.apitoken) {
      throw new Error('Incorrect call, missing "apihost"');
    }

    this.urlPrefix = 'https://' + this.apihost;
    this.id = this.driverid;

    this.properties = this._loadCachedProperties();
    this.propertyObservables = {};
    this.variableObservables = {};
    this.allPropertiesObservable = new ReplaySubject1(this.properties, true);
    this.variablesObservable = new ReplaySubject1([], true);
    this.readySubject = new Subject();
    // true while the socket is connected and the variables subscription is active.
    this.liveObservable = new ReplaySubject1(false, true);

    this._socket = null;
    this._subscriptionInit = null;
    this._varSub = null;
    this._propSub = null;
    this._polledNames = null;

    log('broker', 'constructed', { apihost: this.apihost, id: this.id });
    this.init();
  }

  // -- Lifecycle ---------------------------------------------------------------

  /**
   * init()
   * Called once from the constructor. Always does an initial REST fetch of
   * all properties (getProperties). If options.subscribeVariables was set,
   * also opens the Socket.IO connection (initSubscription) and, once
   * connected, starts the live variables and properties subscriptions.
   */
  Broker.prototype.init = function () {
    var self = this;
    this.getProperties('v2').catch(function (err) {
      log('broker', 'init: getProperties failed', err.message);
    });

    if (this.options.subscribeVariables) {
      this.initSubscription().then(function () {
        self.subscribeVariables();
        self.subscribeProperties();
      }).catch(function (err) {
        warn('broker', 'init: subscription setup failed', err.message);
      });
    }
  };

  /**
   * whenReady()
   * Returns a Promise that resolves once the Socket.IO connection is open.
   * Resolves immediately if already connected. Internal — used by subscribe()
   * before issuing the SubscriptionClient handshake; you normally don't need
   * to call this directly.
   */
  Broker.prototype.whenReady = function () {
    var self = this;
    if (this._socket && this._socket.connected) return Promise.resolve();
    return new Promise(function (resolve) {
      var handle = self.readySubject.subscribe(function () {
        handle.unsubscribe();
        resolve();
      });
    });
  };

  // -- Low-level REST ------------------------------------------------------

  /** _headers(hasBody) — builds the Authorization (+ Content-Type) header set for a REST call. */
  Broker.prototype._headers = function (hasBody) {
    var headers = { Authorization: 'Bearer ' + this.apitoken };
    if (hasBody) headers['Content-Type'] = 'application/json';
    return headers;
  };

  /**
   * call(method, path, body, timeoutMs)
   * Low-level fetch wrapper every REST method above funnels through.
   * - Adds the bearer token automatically.
   * - JSON-encodes `body` for any non-GET method.
   * - Aborts via AbortController if `timeoutMs` is given.
   * - On a non-ok response, runs _handleAPIError (alerts + logs) and rejects;
   *   pass `quiet` to skip the alert (background polling).
   * - Parses the response as JSON when the content-type says so, otherwise
   *   returns plain text.
   * Returns a Promise. You generally call the higher-level wrapper methods
   * below instead of this directly.
   */
  Broker.prototype.call = function (method, path, body, timeoutMs, quiet) {
    var self = this;
    var hasBody = method !== 'GET' && body !== undefined;
    var opts = { method: method, headers: this._headers(hasBody) };
    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timeoutId = null;

    if (hasBody) opts.body = JSON.stringify(body);
    if (controller) opts.signal = controller.signal;
    if (timeoutMs && controller) {
      timeoutId = setTimeout(function () { controller.abort(); }, timeoutMs);
    }

    log('broker', 'REST ' + method + ' ' + path, hasBody ? body : undefined);

    return fetch(this.urlPrefix + path, opts).then(function (res) {
      if (timeoutId) clearTimeout(timeoutId);
      if (!res.ok) {
        return self._handleAPIError(method, path, res, quiet).then(function () {
          throw new Error(method + ' ' + path + ' failed (' + res.status + ')');
        });
      }
      var contentType = res.headers.get('content-type') || '';
      return contentType.indexOf('application/json') !== -1 ? res.json() : res.text();
    }).catch(function (err) {
      if (timeoutId) clearTimeout(timeoutId);
      log('broker', 'REST ERROR ' + method + ' ' + path, err.message);
      throw err;
    });
  };

  /**
   * _handleAPIError(method, path, res)
   * Called by call() whenever a REST response is not ok. Reads the response
   * body as text, builds a readable message (appending a session-expired
   * hint on HTTP 401), logs it, and shows a browser alert() — matching the
   * reference app's handleAPIError behavior — unless `quiet` is set.
   */
  Broker.prototype._handleAPIError = function (method, path, res, quiet) {
    return res.text().then(function (body) {
      var message = method + ' ' + path + ' failed (' + res.status + '): ' + body;
      if (res.status === 401) {
        message += ' — Session expired. Please restart Composer Pro.';
      }
      if (quiet) {
        warn('broker', 'API ERROR', message);
        return;
      }
      log('broker', 'API ERROR', message);
      global.alert(message);
    });
  };

  // -- REST wrapper methods -------------------------------------------------

  /**
   * getItems(id, query)
   * GET /api/v1/items — list items (devices/drivers) under this project,
   * optionally filtered. `query` is a MongoDB-style filter object, e.g.
   * { $and: [{ parentId: id }, { proxy: "intercomproxy" }] }.
   */
  Broker.prototype.getItems = function (id, query) {
    var qs = query ? '?q=' + encodeURIComponent(JSON.stringify(query)) : '';
    return this.call('GET', '/api/v1/items' + qs);
  };

  /** renameItem(id, name) — PUT /api/v1/items/{id} — renames an item. */
  Broker.prototype.renameItem = function (id, name) {
    return this.call('PUT', '/api/v1/items/' + id, { name: name });
  };

  /**
   * getDeviceProperties(id, apiVersion, propertyNames, coerce)
   * GET /api/{apiVersion}/items/{id}/properties — raw REST call for reading
   * another item's properties. Pass `propertyNames` to filter, `coerce` to
   * ask Director to coerce values to their declared type. Low-level; prefer
   * getProperties() below to also populate this Broker's own observables.
   */
  Broker.prototype.getDeviceProperties = function (id, apiVersion, propertyNames, coerce) {
    apiVersion = apiVersion || 'v2';
    var q = [];
    if (propertyNames && propertyNames.length) q.push('properties=' + encodeURIComponent(propertyNames.join(',')));
    if (coerce) q.push('coerce=true');
    var qs = q.length ? '?' + q.join('&') : '';
    return this.call('GET', '/api/' + apiVersion + '/items/' + id + '/properties' + qs);
  };

  /**
   * getProperties(apiVersion, propertyNames)
   * PROPERTY RETRIEVE (bulk). Fetches this driver's own properties (as
   * declared in driver.xml's <properties>) via getDeviceProperties(this.id, ...),
   * then:
   *   - caches the result in localStorage,
   *   - pushes it to getPropertiesObservable(),
   *   - pushes each individual property to its own getPropertyObservable(name).
   * Called automatically once from init(); call it again any time (e.g. from
   * a "Refresh" button) to force a fresh read from the driver/driver.xml.
   * Resolves with the raw property array, e.g.:
   *   [{ name: "Log Level", value: "5 - Trace", ... }, ...]
   */
  Broker.prototype.getProperties = function (apiVersion, propertyNames) {
    var self = this;
    return this.getDeviceProperties(this.id, apiVersion, propertyNames, true).then(function (props) {
      props = props || [];
      self.properties = props;
      self._cacheProperties(props);
      self.allPropertiesObservable.next(props);
      props.forEach(function (p) {
        self._getOrCreatePropertyObservable(p.name).next(p);
      });
      log('broker', 'properties loaded', props.length + ' properties');
      return props;
    });
  };

  /**
   * setProperties(map)
   * PROPERTY REQUEST (bulk write). POST /api/v1/items/{id}/properties with a
   * map of { "Property Name": value } or { "Property Name": {value, type} }.
   * Prefer setProperty() below for a single property.
   */
  Broker.prototype.setProperties = function (map) {
    return this.call('POST', '/api/v1/items/' + this.id + '/properties', map);
  };

  /**
   * setProperty(name, value, type)
   * PROPERTY REQUEST (single write). Writes one property back to the driver
   * — this is what ends up calling ON_PROPERTY_CHANGED[name] in the driver's
   * Lua and, once accepted, updating driver.xml's runtime Properties table.
   * `type` is optional; pass it (e.g. "STRING") only when the value's type
   * needs to be explicit, otherwise the 2-arg form is enough for LIST/STRING
   * properties such as this driver's "Log Level"/"Log Mode"/"WebSocket Path".
   */
  Broker.prototype.setProperty = function (name, value, type) {
    var body = {};
    body[name] = (type !== undefined) ? { value: value, type: type } : value;
    return this.setProperties(body);
  };

  /**
   * getDeviceVariables(id, varnames)
   * VARIABLE RETRIEVE (on-demand REST). GET /api/v1/items/{id}/variables,
   * optionally filtered to `varnames`. Unlike properties there is no single
   * "get variables and populate observables" convenience method — call this
   * directly (e.g. on a Refresh button) and feed the result into
   * getVariableObservable(name).next(...) yourself, or just rely on the live
   * subscribeVariables() feed. Resolves with an array shaped like:
   *   [{ id, varName, type, value, variableId, name, roomName, ... }]
   * (this is a Control4 device Variable — created in Lua via C4:AddVariable
   *  and updated via C4:SetVariable — not a driver.xml <property>).
   * `opts` = { timeoutMs, quiet } is passed through to call().
   */
  Broker.prototype.getDeviceVariables = function (id, varnames, opts) {
    opts = opts || {};
    var qs = (varnames && varnames.length) ? '?varnames=' + encodeURIComponent(varnames.join(',')) : '';
    return this.call('GET', '/api/v1/items/' + id + '/variables' + qs, undefined, opts.timeoutMs, opts.quiet);
  };

  /**
   * pollVariables(names, opts)
   * VARIABLE RETRIEVE (REST → observables). Reads this driver's variables and
   * feeds each one through _applyVariable, so getVariableObservable(name) and
   * getVariablesObservable() converge even when the live push is down.
   * `names` defaults to the names of the previous call (all variables if never
   * given). opts = { force, timeoutMs, quiet }: `force` re-emits values that
   * did not change (use it for an explicit Refresh).
   */
  Broker.prototype.pollVariables = function (names, opts) {
    var self = this;
    opts = opts || {};
    if (names) this._polledNames = names;
    return this.getDeviceVariables(this.id, this._polledNames, opts).then(function (vars) {
      (vars || []).forEach(function (v) { self._applyVariable(v, opts.force); });
      return vars;
    });
  };

  /**
   * executeDeviceCommand(id, command, tParams, async)
   * Sends a raw Lua command to any item's ExecuteCommand(command, tParams)
   * handler. POST /api/v1/items/{id}/commands. Prefer executeAction() for
   * driver.xml <action> entries — this is the lower-level primitive it and
   * executeCommand() are built on.
   */
  Broker.prototype.executeDeviceCommand = function (id, command, tParams, async) {
    return this.call('POST', '/api/v1/items/' + id + '/commands', {
      command: command,
      tParams: tParams || {},
      async: !!async
    });
  };

  /**
   * executeCommand(command, params, async)
   * Same as executeDeviceCommand but always targets this Broker's own driver
   * (this.id).
   */
  Broker.prototype.executeCommand = function (command, params, async) {
    return this.executeDeviceCommand(this.id, command, params, async);
  };

  /**
   * getActions()
   * GET /api/v1/items/{id}/actions — lists the actions this driver declares
   * in driver.xml's <config><actions>. Informational; app code normally
   * calls executeAction() directly with a known action name instead of
   * discovering it here first.
   */
  Broker.prototype.getActions = function () {
    return this.call('GET', '/api/v1/items/' + this.id + '/actions');
  };

  /**
   * executeAction(action, params)
   * ACTION REQUEST. PUT /api/v1/items/{id}/actions — runs one of this
   * driver's declared actions by its driver.xml <name> (NOT its <command>;
   * e.g. "Send Message", not "SendMessage" — Director resolves the <name> to
   * the right Lua ACTION for you). `params` keys must match the action's
   * declared <params><param><name> exactly, e.g. { Message: "hello" } for
   * this driver's "Send Message" action.
   */
  Broker.prototype.executeAction = function (action, params) {
    var body = Object.assign({ action: action }, params || {});
    return this.call('PUT', '/api/v1/items/' + this.id + '/actions', body);
  };

  /**
   * getDirectorVersion()
   * GET /api/v1/version — resolves with [major, minor, patch] parsed from
   * the "Director" entry's version string.
   */
  Broker.prototype.getDirectorVersion = function () {
    return this.call('GET', '/api/v1/version').then(function (list) {
      var entry = (list || []).filter(function (e) { return e.name === 'Director'; })[0];
      var versionStr = (entry && entry.version) || '0.0.0';
      return versionStr.split('.').map(Number);
    });
  };

  // -- Observables -----------------------------------------------------------

  /** _getOrCreatePropertyObservable(name) — internal lazy accessor backing getPropertyObservable(). */
  Broker.prototype._getOrCreatePropertyObservable = function (name) {
    if (!this.propertyObservables[name]) {
      var cached = (this.properties || []).filter(function (p) { return p.name === name; })[0];
      this.propertyObservables[name] = cached
        ? new ReplaySubject1(cached, true)
        : new ReplaySubject1();
    }
    return this.propertyObservables[name];
  };

  /**
   * getPropertyObservable(name)
   * PROPERTY RETRIEVE (live). Returns a ReplaySubject1 for one named
   * property. subscribe(fn) fires immediately with the current value (once
   * known) and again every time it changes — from getProperties() or from
   * the live subscribeProperties() feed if the real-time layer is enabled.
   * Example (see index.js): broker.getPropertyObservable('Log Level').subscribe(
   *   function (prop) { console.log(prop.value); }
   * );
   */
  Broker.prototype.getPropertyObservable = function (name) {
    return this._getOrCreatePropertyObservable(name);
  };

  /** getPropertiesObservable() — ReplaySubject1 of the full property array. */
  Broker.prototype.getPropertiesObservable = function () {
    return this.allPropertiesObservable;
  };

  /**
   * getVariableObservable(varName)
   * VARIABLE RETRIEVE (live). Returns a ReplaySubject1 for one named
   * Variable. Unlike properties, nothing populates this automatically from
   * a one-time REST call — it's fed either by the live subscribeVariables()
   * feed (when options.subscribeVariables is set) or manually, e.g. after a
   * getDeviceVariables() call: broker.getVariableObservable(v.varName).next(v).
   */
  Broker.prototype.getVariableObservable = function (varName) {
    if (!this.variableObservables[varName]) {
      this.variableObservables[varName] = new ReplaySubject1();
    }
    return this.variableObservables[varName];
  };

  /** getVariablesObservable() — ReplaySubject1 of the full live variable array. */
  Broker.prototype.getVariablesObservable = function () {
    return this.variablesObservable;
  };

  /** getLiveObservable() — ReplaySubject1 of true while live variable pushes are flowing. */
  Broker.prototype.getLiveObservable = function () {
    return this.liveObservable;
  };

  // -- localStorage property cache -------------------------------------------

  /** _cacheKey() — localStorage key this Broker's property cache is stored under. */
  Broker.prototype._cacheKey = function () {
    return 'advanced-properties-' + this.id;
  };

  /** _loadCachedProperties() — best-effort read of the cached property array (empty array if absent/invalid). */
  Broker.prototype._loadCachedProperties = function () {
    try {
      var raw = global.localStorage.getItem(this._cacheKey());
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  };

  /** _cacheProperties(props) — best-effort write of the property array to localStorage. */
  Broker.prototype._cacheProperties = function (props) {
    try {
      global.localStorage.setItem(this._cacheKey(), JSON.stringify(props));
    } catch (e) {
      // storage unavailable — non-fatal, cache is best-effort
    }
  };

  // -- Real-time layer (Socket.IO) --------------------------------------------

  /**
   * initSubscription()
   * Opens the real-time channel. Fetches {urlPrefix}/socket.io/socket.io.js
   * (served by the driver's own host, JWT-authenticated with apitoken) and
   * evaluates it into the page — there is no bundled copy to import — then
   * connects a socket.io client to urlPrefix. Resolves once the socket's
   * 'connect' event fires. Idempotent: safe to call more than once, later
   * calls return the same in-flight/resolved Promise. You normally don't
   * call this directly — init() does when options.subscribeVariables is set.
   */
  Broker.prototype.initSubscription = function () {
    var self = this;
    if (this._subscriptionInit) return this._subscriptionInit;

    this._subscriptionInit = new Promise(function (resolve, reject) {
      var scriptUrl = self.urlPrefix + '/socket.io/socket.io.js?JWT=' + encodeURIComponent(self.apitoken);

      fetch(scriptUrl).then(function (res) {
        if (!res.ok) throw new Error('socket.io.js fetch failed (' + res.status + ')');
        return res.text();
      }).then(function (source) {
        // The socket.io client is served by the driver's own host at runtime —
        // there is no bundled copy to import, so it is evaluated into the page
        // the same way the reference app does.
        (0, eval)(source);
        if (typeof global.io !== 'function') {
          throw new Error('socket.io client script did not define window.io');
        }

        self._socket = global.io.connect(self.urlPrefix, {
          forceNew: true,
          transports: ['polling', 'websocket'],
          timeout: 10000
        });

        var firstConnect = true;
        self._socket.on('connect', function () {
          self.readySubject.next(true);
          if (firstConnect) {
            firstConnect = false;
            log('broker', 'socket connected', self._socket.id);
            resolve();
            return;
          }
          // Director subscriptions belong to the old socket id — rebuild them.
          warn('broker', 'socket reconnected, re-subscribing', self._socket.id);
          self.subscribeVariables();
          self.subscribeProperties();
        });
        self._socket.on('connect_error', function (err) {
          warn('broker', 'socket connect_error', err && err.message);
        });
        self._socket.on('disconnect', function (reason) {
          self.liveObservable.next(false);
          warn('broker', 'socket disconnected', reason);
        });
      }).catch(function (err) {
        warn('broker', 'initSubscription failed', err.message);
        reject(err);
      });
    });

    return this._subscriptionInit;
  };

  /**
   * subscribe(path, params)
   * Generic real-time subscription primitive every subscribeXxx() helper
   * below is built on. Once the socket is ready:
   *   1. GET `path` with a SubscriptionClient={socketId} query param (plus
   *      any `params`, JSON-stringified per key) to obtain a subscriptionId.
   *   2. socket.emit('startSubscription', subscriptionId).
   *   3. socket.on(subscriptionId, cb) delivers each pushed message to the
   *      returned Subject.
   * The returned object's subscribe(fn) wraps Subject.subscribe so that
   * calling the resulting unsubscribe() also emits 'endSubscription' and
   * removes the socket listener — each subscribe() call maps 1:1 to one
   * socket topic. You rarely need this directly; use subscribeItemOnDataToUI/
   * subscribeOnDataToUI, or rely on subscribeVariables/subscribeProperties
   * (started automatically by init()).
   * `onActive(ok)` (optional) is called once the subscription is running
   * (true) or has failed to start (false).
   */
  Broker.prototype.subscribe = function (path, params, onActive) {
    var self = this;
    var subject = new Subject();
    var subscriptionId = null;
    var active = false;
    var cancelled = false;
    var report = function (ok) { if (onActive && !cancelled) onActive(ok); };

    this.whenReady().then(function () {
      if (cancelled) return null;
      var qs = 'SubscriptionClient=' + encodeURIComponent(self._socket.id);
      if (params) {
        Object.keys(params).forEach(function (key) {
          qs += '&' + key + '=' + encodeURIComponent(JSON.stringify(params[key]));
        });
      }
      return self.call('GET', path + '?' + qs);
    }).then(function (res) {
      // Unsubscribed while the GET was in flight — don't start a topic nobody ends.
      if (cancelled) return;
      subscriptionId = res && res.subscriptionId;
      if (!subscriptionId) {
        warn('broker', 'subscribe: no subscriptionId returned', path);
        report(false);
        return;
      }
      active = true;
      self._socket.on(subscriptionId, function (msg) { subject.next(msg); });
      self._socket.emit('startSubscription', subscriptionId);
      log('broker', 'subscribed', path + ' -> ' + subscriptionId);
      report(true);
    }).catch(function (err) {
      warn('broker', 'subscribe failed: ' + path, err.message);
      report(false);
    });

    var baseSubscribe = subject.subscribe.bind(subject);
    subject.subscribe = function (fn) {
      var sub = baseSubscribe(fn);
      return {
        unsubscribe: function () {
          sub.unsubscribe();
          cancelled = true;
          if (active && subscriptionId) {
            self._socket.emit('endSubscription', subscriptionId);
            self._socket.off(subscriptionId);
            active = false;
            log('broker', 'unsubscribed', path);
          }
        }
      };
    };

    return subject;
  };

  /**
   * subscribeOnDataToUI(filter)
   * Live "data to UI" feed for this Broker's own driver — e.g. correlating
   * command responses. Shorthand for subscribeItemOnDataToUI(this.id, filter).
   */
  Broker.prototype.subscribeOnDataToUI = function (filter) {
    return this.subscribeItemOnDataToUI(this.id, filter);
  };

  /**
   * subscribeItemOnDataToUI(itemId, filter)
   * Live "data to UI" feed for an arbitrary item. `filter` is a
   * messagefilterq object, e.g. { "data.device_state.deviceId": itemId }.
   * subscribe(path, {messagefilterq: filter}) under the hood.
   */
  Broker.prototype.subscribeItemOnDataToUI = function (itemId, filter) {
    return this.subscribe('/api/v1/items/' + itemId + '/datatoui', { messagefilterq: filter });
  };

  /**
   * subscribeVariables()
   * VARIABLE RETRIEVE (live, bulk). Opens one long-lived subscription on
   * this driver's /variables topic. Every pushed message (shape: { varName,
   * value, ... } — see getDeviceVariables()) is merged into
   * getVariablesObservable()'s array and forwarded to that variable's own
   * getVariableObservable(varName). Safe to call again (init() does, and so
   * does every Socket.IO reconnect): the previous subscription is ended
   * first, and the variables are re-read so changes made while there was no
   * subscription are not lost. Drives liveObservable.
   */
  Broker.prototype.subscribeVariables = function () {
    var self = this;
    if (this._varSub) this._varSub.unsubscribe();
    this.liveObservable.next(false);

    var handle = null;
    var subject = this.subscribe('/api/v1/items/' + this.id + '/variables', null, function (ok) {
      if (self._varSub === handle) self.liveObservable.next(ok && !!self._socket && self._socket.connected);
    });
    handle = subject.subscribe(function (msg) { self._applyVariable(msg); });
    this._varSub = handle;

    // Backfill anything missed while we had no subscription.
    this.pollVariables(null, { quiet: true }).catch(function (err) {
      warn('broker', 'variables backfill failed', err.message);
    });
    return handle;
  };

  /**
   * _applyVariable(msg, force)
   * Internal. Merges one { varName, value, ... } variable (pushed or polled)
   * into getVariablesObservable()'s array and its getVariableObservable(varName).
   * A value equal to the one already held is dropped (push and polling both
   * deliver it) unless `force` is set.
   */
  Broker.prototype._applyVariable = function (msg, force) {
    if (!msg || !msg.varName) return;
    var observable = this.getVariableObservable(msg.varName);
    if (!force && observable._hasValue && observable.value && observable.value.value === msg.value) return;
    var vars = this.variablesObservable.value.slice();
    var idx = -1;
    for (var i = 0; i < vars.length; i++) {
      if (vars[i].varName === msg.varName) { idx = i; break; }
    }
    if (idx !== -1) vars[idx] = msg; else vars.push(msg);
    this.variablesObservable.next(vars);
    observable.next(msg);
  };

  /**
   * subscribeProperties()
   * PROPERTY RETRIEVE (live, bulk). Opens one subscription on this driver's
   * /properties topic. Each pushed message carries a devicecommand of
   * UPDATE_PROPERTY, UPDATE_PROPERTY_ATTRIBS, or UPDATE_PROPERTY_LIST; each
   * is applied via _applyPropertyUpdate so every getPropertyObservable(name)
   * stays current without polling. Started automatically by init() when
   * options.subscribeVariables is truthy (the same real-time layer backs
   * both properties and variables). Safe to call again: the previous
   * subscription is ended first.
   */
  Broker.prototype.subscribeProperties = function () {
    var self = this;
    if (this._propSub) this._propSub.unsubscribe();
    var subject = this.subscribe('/api/v1/items/' + this.id + '/properties');
    this._propSub = subject.subscribe(function (msg) {
      var cmd = msg && msg.devicecommand && msg.devicecommand.command;
      if (cmd === 'UPDATE_PROPERTY' || cmd === 'UPDATE_PROPERTY_ATTRIBS') {
        self._applyPropertyUpdate(msg.devicecommand);
      } else if (cmd === 'UPDATE_PROPERTY_LIST') {
        (msg.devicecommand.properties || []).forEach(function (p) { self._applyPropertyUpdate(p); });
      }
    });
    return this._propSub;
  };

  /**
   * _applyPropertyUpdate(patch)
   * Internal. Merges one { name, value, ... } patch into this.properties,
   * refreshes the localStorage cache, and re-emits on both
   * getPropertiesObservable() and the matching getPropertyObservable(name).
   */
  Broker.prototype._applyPropertyUpdate = function (patch) {
    if (!patch || !patch.name) return;
    this.properties = this.properties || [];
    var idx = -1;
    for (var i = 0; i < this.properties.length; i++) {
      if (this.properties[i].name === patch.name) { idx = i; break; }
    }
    if (idx !== -1) {
      this.properties[idx] = Object.assign({}, this.properties[idx], patch);
    } else {
      this.properties.push(patch);
    }
    this._cacheProperties(this.properties);
    this.allPropertiesObservable.next(this.properties);
    this._getOrCreatePropertyObservable(patch.name).next(patch);
    log('broker', 'property update', patch.name + ' = ' + patch.value);
  };

  global.Broker = Broker;
})(window);
