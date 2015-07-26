(function (root, factory) {
    "use strict";

    if (typeof define === "function" && define.amd) {     //AMD
        define(["mobbe", "underscore", "jquery"], factory);
    }
    else if (typeof exports !== "undefined") {//CommonJS

        var Mobbe= require("mobbe"),
            _ = require("underscore"),
            $ = require("jquery");

        factory(Mobbe, _, $);
    }
    else { //GLOBAL
        factory(root.Mobbe, root._, root.jQuery);
    }
})(this, function (Mobbe, _, $) {
    "use strict";

    var cmPlugin = (function () {

        var _version = "0.0.1";

        var _defaultOptions = {
            showCoverOnRequest: true,
            coverClass: "mobbe-view-cover-overlay",
            coverStyle: {
                "position": "absolute",
                "display": "block",
                "top": 0,
                "bottom": 0,
                "left": 0,
                "right": 0,
                "height": "100%",
                "width": "100%",
                "opacity": "0.6",
                "background-color": "#999"
            },
            removeAlways: true
            //coverTarget: "<the selector for the element to cover> , default is the view's container (el)"
        };

        var ViewCover = function () {
        };

        _.extend(ViewCover.prototype, Backbone.Events, {

            attach: function (view, options) {
                _attach.call(this, view, options);
                return view;
            },

            detach: function (view) {
                _detach.call(this, view);
                return view;
            }
        });

        /* ------------------------------------------------------------
         STATIC METHODS
         ------------------------------------------------------------*/
        ViewCover.attach = function (view, options) {
            var vc = new ViewCover();
            vc.attach(view, options);
            return vc;
        };

        ViewCover.setDefaults = function (key, val) {

            if (_.isObject(key)) {
                _defaultOptions = key;
            }
            else {
                _defaultOptions[key] = val;
            }
        };

        ViewCover.getDefaults = function () {
            return _.clone(_defaultOptions);
        };

        ViewCover.setDefaultStyle = function (key, val) {

            if (_defaultOptions.coverStyle) {
                if (_.isObject(key)) {
                    _defaultOptions.coverStyle = key;
                }
                else {
                    _defaultOptions.coverStyle[key] = val;
                }
            }
        };

        ViewCover.getDefaultStyle = function () {
            return _.clone(_defaultOptions.coverStyle);
        };

        ViewCover.version = function () {
            return _version;
        };

        /* ------------------------------------------------------------
         PRIVATE METHODS
         ------------------------------------------------------------*/
        function _attach(view, options) {

            var attachOptions = _.extend({}, _defaultOptions, options);

            if (view.collection) {
                view.collection.on("request", _handleDataRequestEvent, {view: view, attachOptions: attachOptions});
            }

            if (view.model) {
                view.model.on("request", _handleDataRequestEvent, {view: view, attachOptions: attachOptions});
            }

            this.listenTo(view, "close", function () {
                _detach.call(this, view);
            });

            view.showViewCover = function (options) {
                _showCover(this, _.extend(attachOptions, options));
            };

            view.removeViewCover = function (options) {
                _removeCover(this, _.extend(attachOptions, options));
            };
        }

        function _detach(view) {

            if (view.collection) {
                view.collection.off("request", _handleDataRequestEvent);
            }

            if (view.model) {
                view.model.off("request", _handleDataRequestEvent);
            }

            delete view.showViewCover;
            delete view.removeViewCover;
            delete view.__viewCovers;

            this.stopListening();
        }

        function _showCover(view, options) {

            var el = options.coverTarget ? view.$(options.coverTarget) : view.$el;
            var style = options.coverStyle;
            var coverId = _.uniqueId("vcvr");

            if (el.css("position") !== "absolute" && style && !_.isEmpty(style.height)) {
                var elHeight = el.innerHeight();
                style.height = elHeight > 0 ? elHeight + "px" : style.height;   //unless the container is also position absolute, the cover wont spread over the entire container
            }

            var item = $("<div/>")
                .addClass(options.coverClass)
                .css(options.coverStyle)
                .attr("data-id", coverId);

            view.__viewCovers = view.__viewCovers || {};
            view.__viewCovers[coverId] = {item: item, coverViews: []};

            _addAdditionalCoverViews(view, item, coverId, options);

            el.append(item);
        }

        function _addAdditionalCoverViews(view, item, coverId, options) {

            if (_.isArray(options.coverViews)) {
                _.each(options.coverViews, function (ViewType) {

                    var coverView = new ViewType();
                    coverView.render();
                    item.append(coverView.el);

                    view.__viewCovers[coverId].coverViews.push(coverView);
                });
            }
        }

        function _removeCover(view, options) {

            var coverId = options.removeCoverId;

            if (coverId) {
                var cover = view.__viewCovers[coverId];

                if (cover) {
                    _removeAdditionalCoverViews(cover.coverViews);
                    cover.item.remove();
                }

                delete view.__viewCovers[coverId];
            }
            else { //remove any cover currently showing
                _.each(view.__viewCovers, function (item, id) {
                    _removeCover(view, _.extend({}, options, {removeCoverId: id}));
                });

                delete view.__viewCovers;
            }
        }

        function _removeAdditionalCoverViews(views) {
            _.each(views, function (v) {
                v.close();
            });
        }

        function _handleDataRequestEvent(data, xhr, options) {

            var view = this.view;

            options = _.extend({}, this.attachOptions, options);

            xhr.always(function () { //remove the cover as soon as the xhr operation finished, successfully or not
                if (options.removeAlways) {
                    _removeCover(view, options);
                }
            });

            if (view.isRendered && options.showCoverOnRequest) {
                _showCover(view, options);
            }
        }

        return ViewCover;
    })();

    Mobbe.ViewCover = cmPlugin;

    return Mobbe.ViewCover;
});