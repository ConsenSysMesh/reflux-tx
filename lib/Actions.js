"use strict";

var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };

var Reflux = _interopRequire(require("reflux"));

module.exports = Reflux.createActions(["add", "clear", "clearAll", "clearPending", "connect", "remove"]);