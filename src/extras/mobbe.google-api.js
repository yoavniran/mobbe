(function (root, factory) {
    "use strict";

    if (typeof define === "function" && define.amd) {     //AMD
        define(["mobbe", "underscore", "backbone.deepmodel"], factory);
    }
    else if (typeof exports !== "undefined") {//CommonJS

        var Mobbe = require("mobbe"),
            _ = require("underscore"),
            DeepModel = require("backbone.deepmodel");

        factory(Mobbe, _, DeepModel);
    }
    else { //GLOBAL
        factory(root.Mobbe, root._, root.DeepModel);
    }
})(this, function (Mobbe, _, DeepModel) {
    "use strict";

    //--------------------------------------------------------------------------------------------------------------
    //                                          Authentication
    //--------------------------------------------------------------------------------------------------------------
    var ChromeAuthentication = Mobbe.ChromeAuthentication = (function () {

        var userToken,
            userTokenError,
            userTokenDef = Mobbe.$.Deferred();  //only need once, after that use the state of the deferred

        function getChromeUserToken(callback) {

            userTokenDef.then(callback);

            if (!userToken && userTokenDef.state() === "pending") {

                userTokenDef.notify(); //change the deferred state from pending

                chrome.identity.getAuthToken({ "interactive": true },
                    function (token) {

                        userTokenError = chrome.runtime.lastError;

                        if (!userTokenError) {
                            userToken = token;
                        }

                        userTokenDef.resolve(userTokenError, userToken);
                    });
            }
        }

        function removeToken(callback) {
            chrome.identity.removeCachedAuthToken({ "token": getToken() }, function () {
                userToken = null;
                userTokenDef = Mobbe.$.Deferred();
                callback();
            });
        }

        function getToken() {
            return userToken;
        }

        return {
            getChromeUserToken: getChromeUserToken,
            removeToken: removeToken,
            getToken: getToken
        };
    })();
    //--------------------------------------------------------------------------------------------------------------
    //                                          /Authentication
    //--------------------------------------------------------------------------------------------------------------

    //--------------------------------------------------------------------------------------------------------------
    //                                          GoogleApiModel
    //--------------------------------------------------------------------------------------------------------------
    Mobbe.GoogleApiModel = DeepModel.extend({
        fetch: function (options) {
            _doGoogleApiFetch.call(this, options, Backbone.Model);
        }
    });
    //--------------------------------------------------------------------------------------------------------------
    //                                          /GoogleApiModel
    //--------------------------------------------------------------------------------------------------------------

    //--------------------------------------------------------------------------------------------------------------
    //                                          GoogleApiCollection
    //--------------------------------------------------------------------------------------------------------------
    Mobbe.GoogleApiCollection = Backbone.Collection.extend({

        initialize: function () {
            this.parameters = {};
        },

        fetch: function (options) {
            _doGoogleApiFetch.call(this, options, Backbone.Collection);
        },

        parse: function (resp /*, options*/) {

            this.googleListInfo = {
                kind: resp.kind,
                etag: resp.etag,
                selfLink: resp.selfLink
            };

            return resp.items;
        },

        buildQueryPars: function () {   //doesnt support all query capabilities

            var q = "";
            var eqOp = "=";

            if (_.isObject(this.parameters)) {

                var pars = _.map(this.parameters, function (val, key) {

                    var p = [];
                    var notOp = (val.not ? " not " : "");
                    var valStr = "'" + (val.value || val) + "'";

                    if (val.operator === "in") {
                        p.push(valStr);
                        p.push(notOp);
                        p.push(val.operator);
                        p.push(key);
                    }
                    else {
                        p.push(key);
                        p.push(notOp);
                        p.push(val.operator || eqOp);
                        p.push(valStr);
                    }

                    return p.join(" ");
                });

                q = "?q=" + pars.join("and");
            }

            return q;
        }
    });

    /**
        wraps the backbone fetch with logic to retry a failed request by removing the API token and retrieving a new one
        currently will only retry once before giving up
     **/
    function _doGoogleApiFetch(options, bbType) {

        options = _.extend({retryOnError: true}, options);

        var token = options.token || ChromeAuthentication.getToken();
        options.headers = _.extend({}, options.headers, {"Authorization": "Bearer " + token});

        _ApiErrorHandler.call(this, options, bbType);

        return bbType.prototype.fetch.call(this, options);
    }

    function _ApiErrorHandler(options, bbType) {

        var errorFn = options.error;

        var orgOptions = _.clone(options);

        options.error = function (model, resp, options) {

            if (options.retryOnError) {
                orgOptions.error = errorFn;  //set back the original error handler
                orgOptions.retryOnError = false; //dont retry again

                ChromeAuthentication.removeToken(function () {  //remove the token from cache, get a new token and retry
                    ChromeAuthentication.getChromeUserToken(function (error, token) {
                        if (!error && token) {
                            _doGoogleApiFetch.call(model, orgOptions, bbType);
                        }
                        else if (errorFn) {
                            errorFn(model, error);
                        }
                    });
                });

            }
            else {
                if (errorFn) {
                    errorFn(model, resp, options);
                }
            }
        };
    }

    //--------------------------------------------------------------------------------------------------------------
    //                                          /GoogleApiCollection
    //--------------------------------------------------------------------------------------------------------------
});