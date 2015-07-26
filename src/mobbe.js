/**
 *  Mobbe 0.0.1
 *
 *  (c) 2014-2015 Yoav Niran
 *  Mobbe may be freely distributed under the MIT license.
 */

define(function (require) {
    "use strict";

    //todo: move to factory pattern implementation

    var _ = require("underscore");
    var Backbone = require("backbone");
    var Wreqr = require("backbone.wreqr");
    var Handlebars = require("handlebars");       //todo: change so handlebars is not a hard dependency and can be replaced

    var Mobbe = (function () {

        var version = "0.0.1";

        var Mobbe = {
            version: version,
            $: Backbone.$, //get reference to jquery or its equivalent from backbone
            extend: Backbone.Model.extend // Borrow the Backbone `extend` method so we can use it as needed
        };

        var TemplateHelper = Mobbe.TemplateHelper = {

            compile: function (template) {

                return Handlebars.compile(template);
            },

            process: function (data, template) {

                if (!_.isFunction(template)) {

                    template = this.compile(template);
                }

                return template(data);
            }
        };

        /**
         * only calls the method on the specified object if the method exists
         * @param obj
         * @param methodName
         * @param context
         * @param pars
         */
        function callIf(obj, methodName, context) {
            if (_.isFunction(obj[methodName])) {
                var args = Array.prototype.slice.call(arguments);
                args.splice(0, 3);
                return obj[methodName].apply((context || obj), args);
            }
        }

        var selectorToNameRgx = /(\.|#|\t|>|<|-)\w/gi;

        function selectorToName(selector) {

            var result = selector.replace(selectorToNameRgx, function (val) { //, p1, index) {
                return val.charAt(1).toUpperCase();
            });

            var spaces = result.split(" ");
            result = spaces[spaces.length - 1]; //take only the last part of the selector

            return result.charAt(0).toLowerCase() + result.substring(1);
        }

        var changeUpdaterSyntaxEngine = Mobbe.changeUpdaterSyntaxEngine = (function () {

            var updatersSyntxRegx = /^([@&])([\w-]*)(?:'([\w-]*)')?([?=])(!?>)(.+)/;

            return{
                compile: function (syntax) {     //this = view

                    var externalUpdater;

                    if (_.isFunction(this[syntax])) {  //passed a function name to call
                        syntax = this[syntax];
                    }

                    if (_.isFunction(syntax)) {  //passed a function to call
                        externalUpdater = syntax;
                    }

                    if (!externalUpdater) {

                        var groups = updatersSyntxRegx.exec(syntax);

                        if (!groups || groups.length > 7) {
                            throw new Error("Mobbe - invalid syntax");
                        }

                        var isAttr = (groups[1] === "@"),
                            action = groups[2],
                            isClass = (action === "class" || action === "cls"),
                            className = groups[3],
                            toggle = (groups[4] === "?"),
                            reverse = (groups[5] === "!>");
                    }

                    return function compiledUpdater(model, value, options, container) {

                        if (externalUpdater) {
                            externalUpdater.call(this, container, model, value, options);
                            return;
                        }

                        var element = (groups[6] === "." ? container : container.find(groups[6]));

                        if (isAttr) {
                            if (!_.isEmpty(className)) {
                                if (isClass && toggle) {
                                    element.toggleClass(className, reverse ? !value : value);
                                }
                            }
                            else {
                                element.attr(action, value);
                            }
                        }
                        else {
                            if (toggle) {
                                element.toggle(reverse ? !value : value);
                            }
                            else if (element[action]) {
                                element[action](value);
                            }
                        }
                    };
                }
            };
        })();

        //--------------------------------------------------------------------------------------------------------------
        //                                          Environment
        //--------------------------------------------------------------------------------------------------------------
        Mobbe.Environment = (function () {

//            var getPlatformInfo = function (callback) {
//
//
//            };

            var screenInfo = {
                innerHeight: window.innerHeight,
                innerWidth: window.innerWidth,
                screen: window.screen
            };

            var appInfo = {};

            if (window.chrome) {
                if (window.chrome.runtime) {
                    var man = window.chrome.runtime.getManifest();

                    appInfo.name = man.name;
                    appInfo.version = man.version;
                    appInfo.description = man.description;
                }
            }
            else {
                throw new Error("This isnt the environment you were looking for! I should be running in a chrome app/extension");
            }

            Mobbe.hasCordova = !!window.cordova;

            return {
                hasCordova: Mobbe.hasCordova,
                appInfo: appInfo,
                screenInfo: screenInfo
            };
        })();  //todo: move to plugin
        //--------------------------------------------------------------------------------------------------------------
        //                                          /Environment
        //--------------------------------------------------------------------------------------------------------------

        //--------------------------------------------------------------------------------------------------------------
        //                                          Controller
        //--------------------------------------------------------------------------------------------------------------
        var Controller = Mobbe.Controller = function (options) {

            this.options = options || {};

            if (_.isObject(this.options.comms)) {
                this.comms = this.options.comms;
                this.vent = this.comms.vent;
            }

            this.commsHandlers = [];

            this.initialize(this.options);
        };

        _.extend(Controller.prototype, Backbone.Events, {

            initialize: function (/*options*/) {
            },

            close: function () {
                this.stopListening();
                this.removeReqHandlers();
                this.unbind();
                callIf(this, "onClose");
            },

            setListener: function (name, handler, context) {

                this._checkComms();
                context = context || this;
                this.listenTo(this.comms.vent, name, handler, context);
            },

            setListenerOnce: function (name, handler, context) {
                this._checkComms();
                context = context || this;
                this.listenToOnce(this.comms.vent, name, handler, context);
            },

            setRequestHandler: function (name, handler, context) {

                this._checkComms();

                context = context || this;
                this.commsHandlers.push({name: name, type: "reqres"});
                this.comms.reqres.setHandler(name, handler, context);
            },

            setCommandHandler: function (name, handler, context) {

                this._checkComms();

                context = context || this;
                this.commsHandlers.push({name: name, type: "command"});
                this.comms.commands.setHandler(name, handler, context);
            },

            removeReqHandlers: function () {
                if (this.comms) { //  && this.comms.reqres) {

                    var reqres = this.comms.reqres,
                        commands = this.comms.commands;

                    _.each(this.commsHandlers, function (handler) {
                        (handler.type === "reqres" ? reqres : commands).removeHandler(handler.name);
                    });

                    this.commsHandlers.splice(0);
                }
            },

            raise: function () {
                this._checkComms();
                return this.comms.vent.trigger.apply(this.comms.vent, arguments);
            },

            makeRequest: function () {
                this._checkComms();
                return this.comms.reqres.request.apply(this.comms.reqres, arguments);
            },

            executeCommand: function () {
                this._checkComms();
                return this.comms.commands.execute.apply(this.comms.commands, arguments);
            },

            _checkComms: function () {
                if (!this.comms) {
                    throw new Error("communication object not available");
                }
            }
        });

        Controller.extend = Mobbe.extend;
        //--------------------------------------------------------------------------------------------------------------
        //                                          /Controller
        //--------------------------------------------------------------------------------------------------------------

        //--------------------------------------------------------------------------------------------------------------
        //                                          RouteController
        //--------------------------------------------------------------------------------------------------------------
        /**
         * This class is both a Backbone Router and a Mobbe Controller = RouteController
         */
        Mobbe.RouteController = Backbone.Router.extend(Mobbe.Controller.prototype).extend({
            constructor: function () {
                Backbone.Router.apply(this, arguments);
                Mobbe.Controller.apply(this, arguments);
            }
        });
        //--------------------------------------------------------------------------------------------------------------
        //                                          /RouteController
        //--------------------------------------------------------------------------------------------------------------

        //--------------------------------------------------------------------------------------------------------------
        //                                          PanelContainerHelper
        //--------------------------------------------------------------------------------------------------------------
        var PanelContainerHelper = _.extend(Backbone.Events, {

            setContainerElement: function () {

                if (!this.ce$) {

                    var container = _.result(this, "container");

                    if (!container) {
                        throw new Error("PanelContainerHelper object must have a container defined");
                    }

                    this.ce$ = Mobbe.$(container);
                }
            },

            getPanelType: function () {

                var panelType = _.property("panelType")(this);

                if (!panelType) {
                    throw new Error("PanelContainerHelper object panel type must be provided");
                }

                return panelType;
            },

            createPanel: function (options) {

                var PanelType = this.getPanelType();

                this.panel = new PanelType(options);

                this.trigger("panel:created", {panel: this.panel});
            },

            renderPanel: function (options) {

                options = _.extend({}, _.result(this, "panelOptions"), options);

                this.panel = options.panel || this.panel;

                if (!this.panel) {
                    this.createPanel(options);
                }

                this.setContainerElement();

                this.panel.render(options);

                this.ce$.html(this.panel.el);

                this.trigger("panel:rendered");
            },

            closePanel: function (options) {

                if (!this.panel) {
                    return;
                }

                this.panel.close(options);
                delete this.panel;

                this.trigger("panel:closed");
            }
        });
        //--------------------------------------------------------------------------------------------------------------
        //                                          /PanelContainerHelper
        //--------------------------------------------------------------------------------------------------------------

        //--------------------------------------------------------------------------------------------------------------
        //                                          Application
        //--------------------------------------------------------------------------------------------------------------

        /**
         *
         * Application is using the PanelContainerHelper
         */
        var Application = Mobbe.Application = Controller.extend({

            deviceEvents: ["deviceready", "backbutton", "batterycritical", "batterystatus", "menubutton"],
            appEvents: ["resume", "pause"],

            constructor: function (options) {

                options = options || {};

                if (!options.comms) {                 //todo: consider  using channels (and radio) more rather than just one channel
                    options.comms = new Wreqr.Channel("main"); //initialize the main communication object for the entire application
                }

                Controller.prototype.constructor.call(this, options);

                this.container = options.container;
            },

            start: function (options) {

                callIf(this, "onStartBefore", null, options);

                this.renderPanel();
                this.registerPanelOverlayListeners();
                this.registerDeviceEventsListeners();
                this.registerAppEventsListeners();

                callIf(this, "onStartAfter", null, options);
                this.trigger("app:started", null, options);

                return this;
            },

            stop: function (options) {

                callIf(this, "onStopBefore", null, options);
                this.closePanel();
                this.close();
                callIf(this, "onStopAfter", null, options);

                return this;
            },

            renderPanel: function () {

                if (!MasterPanel.prototype.isPrototypeOf(this.panelType.prototype)) {
                    throw new Error("Application master panel must inherit from Mobbe.MasterPanel");
                }

                return PanelContainerHelper.renderPanel.apply(this, arguments);
            },

            /**
             * Make it easy to toggle the display of application level overlays (dialogs)
             */
            registerPanelOverlayListeners: function () {

                var overlays = this.panel.getOverlayNames();

                _.each(overlays, function (val) {
                    this.setListener("app:overlay:" + val + ":show", this._togglePanelOverlay.bind(this, val, true));
                    this.setListener("app:overlay:" + val + ":hide", this._togglePanelOverlay.bind(this, val, false));
                    this.setListener("app:overlay:" + val + ":toggle", this._togglePanelOverlay.bind(this, val, null));
                }, this);
            },

            registerDeviceEventsListeners: function () {
                this._registerDocListOfEvents("device", this.deviceEvents);
            },

            registerAppEventsListeners: function () {
                this._registerDocListOfEvents("app", this.appEvents);
            },

            getConnectionState: function () {

                return {
                    connected: !!this.connected,
                    connectedSince: this.connectedSince
                };
            },

            setConnectionState: function (connected, options) {

                if (this.connected !== connected) {

                    this.connected = connected;

                    if (connected) {

                        this.connectedSince = new Date().getTime();
                        callIf(this, "onAppConnected", null, options);
                    }
                    else {

                        this.connectedSince = null;
                        callIf(this, "onAppDisconnected", null, options);
                    }

                    this.trigger("app:connection:state", connected, options);
                }
            },

            _registerDocListOfEvents: function (triggerPrefix, eventNames) {

                _.each(eventNames, function (name) {
                    document.addEventListener(name, function (e) {
                        _.defer(function () {  //breakout and place in the event loop
                            this.trigger(triggerPrefix + ":" + name, e);
                        }.bind(this));
                    }.bind(this), false);
                }, this);
            },

            _togglePanelOverlay: function (name, show, options) {
                if (show === null) {
                    this.panel.toggleOverlay(name, options);
                }
                else if (show) {
                    this.panel.showOverlay(name, options);
                }
                else {
                    this.panel.hideOverlay(name, options);
                }
            },

            getVent: function () {
                return this.vent;
            }
        });

        _.extend(Application.prototype, PanelContainerHelper);
        //--------------------------------------------------------------------------------------------------------------
        //                                          /Application
        //--------------------------------------------------------------------------------------------------------------

        //--------------------------------------------------------------------------------------------------------------
        //                                          View
        //--------------------------------------------------------------------------------------------------------------

        var viewHtmlMethodType = {APPEND: "append", HTML: "html", PREPEND: "prepend"};
        var viewDefaults = { runChangeUpdatersOnRender: true,
            removeContainer: true,
            selfChangeUpdaterEventPrefix: "cngUpd-model-",
            templateDataPropName: "templateData"};

        var View = Mobbe.View = Backbone.View.extend({

            constructor: function (options) {

                _.defaults(this, viewDefaults);

                Backbone.View.prototype.constructor.apply(this, arguments);

                options = options || {};

                this.htmlMethod = options.htmlMethod || viewHtmlMethodType.HTML;
                this.hiddenClass = options.hiddenClass || null;

                this._reset();

                this.processChangeUpdaters();
                this.processBroadcasts();
            },

            getJson: function (obj) {

                var data = {};

                obj = obj || this.model;

                if (obj && _.isFunction(obj.toJSON)) {
                    data = obj.toJSON();
                }
                else if (_.isObject(obj)) {
                    data = obj;
                }

                return data;
            },

            addTemplateData: function (data) {

                var templateData = _.result(this, "templateData");

                data[this.templateDataPropName] = templateData;

                return data;
            },

            processTemplate: function (data, template) {
                return TemplateHelper.process(data, template);
            },

            getTemplate: function () {
                return this.template;
            },

            postHtmlRendered: function () {
            },

            renderData: function (options) {

                var html = "";
                var template = this.getTemplate();

                if (options.model && _.isObject(options.model)) {
                    this.model = options.model;
                }

                if (template) {
                    var data = this.getJson();
                    data = this.addTemplateData(data);
                    html = this.processTemplate(data, template);
                }

                this.addHtml(this.$el, html, options);

                this.processUiSelectors(); //create the ui elements hash if any selectors are provided
            },

            render: function (options) {

                options = options || {};

                this.isRendered = false;
                this.isClosing = false;

                callIf(this, "onBeforeRender", null, options);

                this.renderData(options);

                if (this.runChangeUpdatersOnRender === true) {
                    this.executeChangeUpdaters();
                }

                this.postHtmlRendered(options);

                this.isRendered = true;
                this.trigger("ready", this, options);
                callIf(this, "onRender", null, options);
                callIf(this, "onShow", null, options);

                return this;
            },

            addHtml: function (el, html, options) {

                options = options || {};

                var htmlMethod = options.htmlMethod || this.htmlMethod;

                el[htmlMethod].call(el, html);

                this.alreadyClosed = false;
                this.isShowing = true;
            },

            _reset: function () {

                this.alreadyClosed = true;
                this.isRendered = false;
                this.isShowing = false;
                this.isClosing = false;

                this.cleanChangeUpdaters();
                this.cleanUiits();
            },

            getIsRendered: function () {
                return this.isRendered;
            },

            getIsShowing: function () {
                return this.isShowing;
            },

            close: function (options) {

                if (this.alreadyClosed || this.isClosing) {
                    return;
                }

                this.isClosing = true;

                options = options || {};
                callIf(this, "onBeforeClose", null, options);
                this.remove(options);
                this._reset();
                this.trigger("close");
                callIf(this, "onClose", null, options);

                return true;
            },

            remove: function (options) {

                if (options.removeContainer === false ||
                    (this.removeContainer === false && !options.removeContainer)) {//only if specifically set to false, otherwise default to backbone remove

                    this.$el.empty(); //instead of the  backbone remove, empty the container, probably because view got it from outside
                    this.stopListening();
                }
                else {
                    Backbone.View.prototype.remove.call(this);
                }

                return this;
            },

            hide: function () {
                this.toggle(false);
            },

            show: function () {
                if (!this.getIsShowing()) {
                    this.toggle(true);
                    callIf(this, "onShow");
                }
            },

            processUiSelectors: function () {

                if (!this.uiSelectors) {
                    return;
                }

                var selectors = _.result(this, "uiSelectors");

                if (!_.isEmpty(selectors)) {
                    this.ui = this._uiSelectors = {};
                    this.uiit(selectors);
                }
            },

            /**
             *  UI It - find an element based on selector and add it to the ui hash
             *  uses a normalized name from the selector as the key or the optional name parameter
             *
             *  accepts:
             *
             *  1. a single selector/name combinaiton (name optional)
             *  2. an array of selectors - the normalized key will be provided
             *  3. a hash of key/value pairs. key = selector, value = name
             *
             * returns:
             *  when passed a single selector/name returns the $ element
             *  when passed an array or hash returns reference to the updated: this.ui object
             */
            uiit: function (selector, name) {

                function addIt(selector, name) {
                    name = name || selectorToName(selector);

                    this.ui = this.ui || {};
                    this._uiSelectors = this._uiSelectors || {};

                    this._uiSelectors[selector] = name;

                    var element = this.ui[name] = this.$(selector);

                    return element;
                }

                if (_.isObject(selector)) {

                    var isArr = _.isArray(selector);

                    _.each(selector, function (val, key) {  //key = selector in hash. val = selector in array
                        addIt.call(this, (isArr ? val : key), (isArr ? void 0 : val));
                    }, this);

                    return this.ui;
                }

                return addIt.call(this, selector, name);
            },

            cleanUiits: function () {

                delete this.uiSelectors;

                if (!this.ui) {
                    return;
                }

                _.each(this.ui, function (val, key) {
                    delete this.ui[key];
                }, this);

                delete this.ui;
            },

            cleanChangeUpdaters: function () {

                if (this.model && this.processedUpdaters && this.processedUpdaters.length > 0) {

                    _.each(this.processedUpdaters, function (name) {
                        this.stopListening(this.model, name, this._onPropChangeHandler);
                    }, this);

                    this.stopListening(this.model, "change", this._onModelChangeHandler);
                }
            },

            toggle: function (show) {

                if (!this.alreadyClosed && this.isRendered) {
                    if (this.hiddenClass && _.isString(this.hiddenClass)) {
                        this.$el.toggleClass(this.hiddenClass, !show);
                    }
                    else {
                        this.$el.toggle(show);
                    }
                }

                this.isShowing = show;
            },

            delegateEvents: function () {

                var events = this.processUiActions();

                Backbone.View.prototype.delegateEvents.call(this, events);
            },

            raise: function (eventName, e) {
                this.trigger.call(this, eventName, this.model, this.collection);
                callIf(this, eventName, null, e, this.model, this.colelction); //callIf.call(null, this, eventName, null, e, this.model, this.collection);
            },

            /**
             * supports different ways of registering for DOM events:
             *
             * uiActions: {
             *              "#selector": {
             *                  "click": "myClickHandler",
             *                  "mouseover": function(e){}
             *              },
             *              ".anotherSelector": "click>anotherClickHandler"
             *            }
             *
             */
            processUiActions: function () {

                var actions = _.result(this, "uiActions");
                var events = {};

                if (!actions) {
                    return;
                }

                _.each(actions, function (config, selector) { //key being the selector

                    if (_.isObject(config)) {
                        _.each(config, function (fn, eventName) { //key being the event name
                            events[eventName + " " + selector] = this.raise.bind(this, fn);
                        }, this);
                    }
                    else {
                        var vals = config.split(">");

                        if (vals.length > 1) {
                            events[vals[0] + " " + selector] = this.raise.bind(this, vals[1]);
                        }
                    }
                }, this);

                return events;
            },

            /**
             * broadcast an internal event to the outside world
             */
            processBroadcasts: function () {

                var broadcasts = _.result(this, "broadcasts");

                if (!broadcasts) {
                    return;
                }

                _.each(broadcasts, function (val, key) {
                    this.listenTo(this, key, function () {

                        var args = Array.prototype.slice.call(arguments);
                        args.unshift(val === "*" ? key : val); //use original event name if val is  '*'

                        this.trigger.apply(this, args);
                    });
                }, this);
            },

            executeChangeUpdaters: function () {

                var triggered = false;

                if (!this.model) {
                    return;
                }

                var updaters = _.result(this, "changeUpdaters");

                if (!_.isObject(updaters) || _.size(updaters) === 0) {
                    return;
                }

                _.each(updaters, function (val, key) {

                    var eventParts = key.split(":");
                    var fieldName = eventParts.length > 0 ? eventParts[eventParts.length - 1] : null;
                    var fieldValue = fieldName ? this.model.get(fieldName) : void(0);

                    if (!_.isUndefined(fieldValue)) {
                        triggered = true;
                        this.trigger(this.selfChangeUpdaterEventPrefix + key, this.model, fieldValue);
                    }
                }, this);

                if (triggered) {
                    this.trigger(this.selfChangeUpdaterEventPrefix + "change", this.model);
                }
            },

            /**
             * supports hooks for model change events.
             * uses predefined syntax to update elements or attributes in the view upon model change events
             * clones container for performance sake before running updaters
             * (doesnt handle unset attributes)
             *
             * DSL syntax:
             *
             *     "<event name>" : "[attribute/method][toggle/pass-value][optional reverse]>[selector]
             *
             *     "change:shareOn":       "@class'item-shared'?>."     [@class]=attribute called class, ['item-shared']=name of class, [?]=toggle, [>]=normal action, [.]=element is container
             *     "change:shareOn":       "@class'item-shared'?!>."    [@class]=attribute called class, ['item-shared']=name of class, [?]=toggle, [!>]=reverse action, [.]=element is container
             *     "change:id":            "@data-id=>."                [@data-id]=attribute called data-id, [=]=set value, [>]=normal action, [.]=element is container
             *     "change:title" :        "&text=>.title-text"         [&text]=method to call, [=]=pass value, [>]=normal action, [.title-text]=element matching selector: .title-text
             *     "change:isDisabled":    "&?!>#save-button"           [&?]=toggle method, [!>]=reverse action, [#save-button]=on element matching selector: #save-button
             *     "change:isEnabled":     "&?>#save-button"            [&?]= toggle method, [>]=normal action, [#save-button]=on element matching selector: #save-button
             *
             * call function #1: calls named function on the view
             *
             *     "change event" : "function name"   (receives: container, model, newValue, options)
             *
             * call function #2: calls the associated annonymous function
             *
             *     "change:sharePaused": function(container, model, newValue, options ){}
             */
            processChangeUpdaters: function () {

                if (typeof this.selfChangeUpdaterEventPrefix === "undefined" || this.selfChangeUpdaterEventPrefix.length < 1) {
                    throw new Error("Mobbe - View - must have value for selfChangeUpdaterEventPrefix");
                }

                var updaters = _.result(this, "changeUpdaters");

                if (!_.isObject(updaters) || _.size(updaters) === 0) {
                    return;
                }

                var updatesTracker = {
                    aggregator: null,
                    counter: 0 //counter for handled model-fields change events
                };

                this.processedUpdaters = [];

                _.each(updaters, function (val, key) {   //put listeners for change events in place

                    if (key.indexOf("change:") === 0) {

                        var compiledUpdater = changeUpdaterSyntaxEngine.compile.call(this, val);

                        var boundPropChangeHandler = this._onPropChangeHandler.bind(this, updatesTracker, compiledUpdater);
                        boundPropChangeHandler._callback = this._onPropChangeHandler;

                        this.listenTo(this.model, key, boundPropChangeHandler);
                        this.listenTo(this, this.selfChangeUpdaterEventPrefix + key, boundPropChangeHandler); //for executeChangeUpdaters

                        this.processedUpdaters.push(key);
                    }
                }, this);

                var boundModelChangeHandler = this._onModelChangeHandler.bind(this, updatesTracker);
                boundModelChangeHandler._callback = this._onModelChangeHandler;

                this.listenTo(this.model, "change", boundModelChangeHandler);
                this.listenTo(this, this.selfChangeUpdaterEventPrefix + "change", boundModelChangeHandler); //for executeChangeUpdaters
            },

            /**
             * executes the callback as soon as the view is rendered. if the view is already rendered,
             * it will execute immediately
             * @param callback
             */
            executeWhenReady: function (callback) {

                if (!_.isFunction(callback)) {
                    throw new Error("Mobbe.View - callback must be a function");
                }

                if (this.getIsRendered()) {
                    callback();
                }
                else {
                    this.listenToOnce(this, "ready", callback);
                }
            },

            _onPropChangeHandler: function (updatesTracker, compiledUpdater, model, prop, options) {

                updatesTracker.counter += 1;

                if (!updatesTracker.aggregator) {
                    updatesTracker.aggregator = Mobbe.$.Deferred();
                }

                updatesTracker.aggregator.then(compiledUpdater.bind(this, model, prop, options));
            },

            _onModelChangeHandler: function (updatesTracker /*, model*/) {

                if (updatesTracker.counter > 0) {

                    callIf(this, "onBeforeUpdaters");

                    var cloned = this.isRendered ? this.$el.clone(true) : this.$el; //deep copy container including events and data if view was already rendered

                    updatesTracker.aggregator.done(function (cloned) {
                        this.$el.replaceWith(cloned).remove(); //all updaters executed, time to replace the container with the updated clone
                        this.$el = cloned;
                        this.processUiSelectors(); //now that we replaced the container we need to re-find the ui elements if there are any
                        this.delegateEvents();
                    });

                    updatesTracker.aggregator.resolveWith(this, [cloned]);
                    callIf(this, "onAfterUpdaters");
                }

                updatesTracker.aggregator = null;
                updatesTracker.counter = 0;
            }
        });
        //--------------------------------------------------------------------------------------------------------------
        //                                          /View
        //--------------------------------------------------------------------------------------------------------------

        //--------------------------------------------------------------------------------------------------------------
        //                                          MultiItemView
        //--------------------------------------------------------------------------------------------------------------

        /**
         * information which can be set on the instance or passed to the constructor in the form of a hash(options):
         *      itemViewType, itemTemplate, itemsContainer, model, collection, template
         */

        var multiItemViewDefaults = {viewEventBubble: true};

        Mobbe.MultiItemView = View.extend({

            constructor: function () {

                Mobbe.View.prototype.constructor.apply(this, arguments);

                _.defaults(this, multiItemViewDefaults);

                if (!this.collection) {
                    throw new Error("Collection must be provided for a MultiItemView");
                }

                this.wireCollectionEvents();
            },

            wireCollectionEvents: function () {
                this.listenTo(this.collection, "add", this.addItem);
                this.listenTo(this.collection, "remove", this.removeItem);
                this.listenTo(this.collection, "reset", this._renderCollection);
            },

            renderData: function (options) {

                if (this.template) {
                    Mobbe.View.prototype.renderData.call(this, options);
                }

                this.renderCollection(options);
            },

            addItem: function (model, collection, options) {
                this.renderCollectionModel(model, options);
            },

            _renderCollection: function (options) {

                if (!this.isRendered) {
                    this.render(options);
                    return;
                }

                this.renderCollection(options);
            },

            renderCollection: function (options) {

                this.closeSubViews();

                if (this.itemViewType || this.itemTemplate) {

                    this.itemContainerEl = this.getItemsContainer(options);
                    this._fragment = document.createDocumentFragment();

                    this.renderCollectionItems(options);

                    this.addCollectionHtml();

                    callIf(this, "onCollectionRender");
                }
            },

            getItemsContainer: function (/*options*/) {
                return this.itemsContainer ? this.$(this.itemsContainer) : this.$el;
            },

            addCollectionHtml: function () {

                this.addHtml(this.itemContainerEl, this._fragment);
                delete this._fragment;
            },

            renderCollectionItems: function (options) {

                this.collection.each(function (model) {
                    this.renderCollectionModel(model, options);
                }, this);
            },

            renderCollectionModel: function (model, options) {

                var html;

                if (this.itemViewType) {
                    options = _.extend({itemViewType: this.itemViewType}, options);
                    html = this.getHtmlFromCollectionModelWithType(model, options);
                }
                else {
                    options = _.extend({itemTemplate: this.itemTemplate}, options);
                    html = this.getHtmlFromCollectionModelWithTemplate(model, options);
                }

                this.appendItemHtml(html, options);
            },

            appendItemHtml: function (itemHtml, options) {

                if (this._fragment) { // decide whether to use the _fragment or inject directly to the container based on whether rendering all colllection or a single one
                    this._fragment.appendChild(itemHtml);
                }
                else {
                    options = options || {};
                    options.htmlMethod = options.htmlMethod || viewHtmlMethodType.APPEND;

                    this.addHtml(this.getItemsContainer(options), itemHtml, options);
                }
            },

            getHtmlFromCollectionModelWithType: function (model, options) {

                var viewInstance = this.getItemViewInstance(model, options);

                this._subViews = this._subViews || {};

                this._subViews[model.cid] = viewInstance;

                if (this.viewEventBubble) {
                    this.addViewEventBubble(viewInstance);
                }

                viewInstance.render();

                return viewInstance.el;
            },

            getHtmlFromCollectionModelWithTemplate: function (model, options) {

                options = options || {};
                var data = this.getJson(model);
                var template = options.itemTemplate || this.itemTemplate;

                data = this.addTemplateData(data);
                var html = this.processTemplate(data, template);
                var node = Mobbe.$(html)[0];

                return node;
            },

            addViewEventBubble: function (view) {

                this.listenTo(view, "all", function () {

                    var args = Array.prototype.slice.apply(arguments);

                    args[0] = "sub:" + args[0];
                    args.push(view);

                    this.trigger.apply(this, args); //first argument for trigger is the sub:... event name
                });
            },

            closeSubView: function (view, id, options) {

                if (view) {
                    if (view.close) {
                        view.close();
                    }
                    else if (view.remove) {  //if only backbone view, not mobbe
                        view.remove();
                    }

                    this.stopListening(view);
                    callIf(this, "onSubViewsClose", null, view, options);
                }

                delete this._subViews[id];
            },

            closeSubViews: function (options) {

                if (this.itemContainerEl) {
                    this.itemContainerEl.empty();
                }

                if (this._subViews) {
                    _.each(this._subViews, function (view, id) {
                        this.closeSubView(view, id, options);
                    }, this);

                    callIf(this, "onSubViewsClose", null, options);
                }
            },

            close: function (options) {

                if (this.alreadyClosed) {
                    return;
                }

                this.closeSubViews(options);

                return Mobbe.View.prototype.close.apply(this, arguments);
            },

            removeItem: function (/*model*/) {
                throw new Error("'removeItem' not implemented !!!!");
            },

            getItemViewInstance: function (model, options) {

                var viewOptions = _.extend({}, options, {model: model});
                var ItemViewType = options.itemViewType || this.itemViewType;

                return new ItemViewType(viewOptions);
            }
        });
        //--------------------------------------------------------------------------------------------------------------
        //                                          /MultiItemView
        //--------------------------------------------------------------------------------------------------------------

        //--------------------------------------------------------------------------------------------------------------
        //                                          Panel
        //--------------------------------------------------------------------------------------------------------------

        var panelDefaults = {containerSelector: ".panel-container", containerIdAttr: "id"};

        var Panel = Mobbe.Panel = View.extend({

            constructor: function () {
                Mobbe.View.prototype.constructor.apply(this, arguments);
                _.defaults(this, panelDefaults);
            },

            postHtmlRendered: function (options) {
                this.initContainers(options);
            },

            initContainers: function (options) {

                options = options || {};

                var selected = this.$((options.containerSelector || this.containerSelector));
                var idAttr = (options.containerIdAttr || this.containerIdAttr);
                var containers = this.containers = {};

                selected.each(function (i, elm) {

                    var elm$ = Mobbe.$(elm); //wrap with jQuery object
                    var id = _.isFunction(idAttr) ? idAttr.call(this, elm$) : elm$.attr(idAttr);

                    containers[id] = elm$;
                });
            }
        });
        //--------------------------------------------------------------------------------------------------------------
        //                                          /Panel
        //--------------------------------------------------------------------------------------------------------------

        //--------------------------------------------------------------------------------------------------------------
        //                                          Overlay
        //--------------------------------------------------------------------------------------------------------------

        var overlayDefaults = { controllerStartsPanel: true};

        /**
         * Overlay is an internal type that can be hosted by a master panel
         * the master panel manages a collection of overlays for the application
         *
         * Overlay is using PanelContainerHelper
         * @type {Function}
         */
        var Overlay = Mobbe.Overlay = function (options) {

            this.container = options.container;
            this.panelType = options.panelType;
            this._isClosed = true;
            this._isShowing = false;

            _.defaults(this, overlayDefaults);

            this.panelOptions = options;

            this.initialize.apply(this, arguments);
        };

        _.extend(Overlay.prototype, PanelContainerHelper, {

            initialize: function () {
            },

            createPanel: function () {
                return PanelContainerHelper.createPanel.apply(this, arguments);
            },

            closePanel: function () {
                return PanelContainerHelper.closePanel.apply(this, arguments);
            },

            renderPanel: function () {
                return PanelContainerHelper.renderPanel.apply(this, arguments);
            },

            toggle: function (options) {

                if (this._isShowing) {
                    this.hide(options);
                }
                else {
                    this.show(options);
                }
            },

            show: function (options) {

                options = options || {};

                if (this._isShowing && options.reset){
                    this.close(options);
                }

                if (!this._isShowing) {

                    this.trigger("show:before");

                    if (this.getIsClosed()) {

                        var panelOptions = _.extend({}, this.panelOptions, options);

                        if (!this.controllerStartsPanel || !panelOptions.controllerType) { //by default, if a controller type is configured its in charge of showing the panel
                            this.renderPanel(panelOptions);
                        }

                        this.startController(panelOptions);
                    }

                    this.ce$.show();
                    this.panel.show();
                    this._isShowing = true;
                    this._isClosed = false;

                    this.trigger("show:after");
                }

                return this;
            },

            hide: function (options) {

                var panelOptions = _.extend({}, this.panelOptions, options);

                this.trigger("hide:before");

                if (this.ce$) {
                    this.ce$.hide();
                }

                this._isShowing = false;

                var close = !panelOptions.dontClose || panelOptions.closeOnHide; //CLOSE OVERLAY PANEL BY DEFAULT DONT JUST HIDE - only hiding can leave zombies lying around and no one wants that...

                if (close) {
                    this.closePanel(panelOptions);
                    this.closeController(panelOptions);
                    this._isClosed = true;
                }

                this.trigger("hide:after");

                return this;
            },

            close: function (options) {
                options = _.extend({}, options, {dontClose: false, closeOnHide: true});//make sure overlay is closed not just hidden
                this.hide(options);
            },

            startController: function(options){
                if (options.controllerType) {
                    this.controller = new options.controllerType(_.extend({}, options, {overlay: this}));
                }
            },

            closeController: function (options) {
                if (this.controller) {
                    this.controller.close(options);
                }
            },

            getIsClosed: function () {
                return this._isClosed;
            },

            getIsShowing: function () {
                return this._isShowing;
            }
        });
        //--------------------------------------------------------------------------------------------------------------
        //                                          /Overlay
        //--------------------------------------------------------------------------------------------------------------

        //--------------------------------------------------------------------------------------------------------------
        //                                          MasterPanel
        //--------------------------------------------------------------------------------------------------------------

        var masterPanelOverlayDefaults = {overlayType: Mobbe.Overlay, closeOnHide: true};

        var MasterPanel = Mobbe.MasterPanel = Panel.extend({

            constructor: function (options) {

                Panel.prototype.constructor.apply(this, arguments);

                options = options || {};

                this.showOnlyOneOverlay = (options.showOnlyOneOverlay !== false);
                this.overlays = {};

                this.initOverlays(options);
            },

            initOverlays: function (options) {

                var overlaysConfig = _.result(this, "overlaysConfig");

                if (overlaysConfig) {
                    _.each(overlaysConfig, function (o, key) {
                        this.configureOverlay(key, o, options);
                    }, this);
                }
            },

            configureOverlay: function (name, config, options) {

                config = _.extend({}, masterPanelOverlayDefaults, (_.isFunction(config) ? config.call(this) : config), options);

                var overlay = new config.overlayType(config);

                this.overlays[name] = overlay;
            },

            getOverlayNames: function () {
                return _.keys(this.overlays);
            },

            getOverlay: function (name) {

                var overlayInst = null;

                if (_.isString(name)) {
                    overlayInst = this.overlays[name];
                }
                else {
                    overlayInst = _.find(this.overlays, function (o) {
                        return o === name;
                    });
                }

                if (!overlayInst) {
                    throw new Error("overlay was not found");
                }

                return overlayInst;
            },

            toggleOverlay: function (name, options) {

                var o = this.getOverlay(name);

                if (o.getIsShowing() === true) {
                    this.hideOverlay(o, options);
                }
                else {
                    this.showOverlay(o, options);
                }

                return this;
            },

            /**
             * shouldnt be called directly by your app code. to show an overlay trigger event on the app's vent with the "app:overlay:<overlay_name>:show" syntax
             * @param name
             * @param options
             * @returns {Mobbe.MasterPanel}
             */
            showOverlay: function (name, options) {

                var found = false;

                _.each(this.overlays, function (o, confName) {

                    var same = (name === o || name === confName); //name can be the overlay config object or the name itself

                    if (same) {
                        found = true;
                         o.show(options); //Overlay show method knows how to handle the overlay close state as well
                    }
                    else if (this.showOnlyOneOverlay) {
                        o.hide({"dontClose": true});
                    }
                }, this);

                if (!found) {
                    throw new Error("overlay was not found");
                }

                return this;
            },

            hideOverlay: function (overlay, options) {

                var o = this.getOverlay(overlay);

                o.hide(options);

                return this;
            },

            closeOverlays: function (options) {
                _.each(this.overlays, function (o) {
                    o.close(options);
                }, this);
            }
        });
        //--------------------------------------------------------------------------------------------------------------
        //                                          /MasterPanel
        //--------------------------------------------------------------------------------------------------------------

        window.Mobbe = Mobbe; //all your Mobbe belongs to us
        return Mobbe; //look everybody, its a Mobbe!
    })();

    return Mobbe;
});