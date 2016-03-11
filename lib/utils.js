"use strict";

module.exports = {
  formatHex: function formatHex(hexStr) {
    var withOx = arguments[1] === undefined ? false : arguments[1];

    if (typeof hexStr !== "string") {
      return hexStr;
    }var hasOx = hexStr.slice(0, 2) == "0x";
    if (withOx && !hasOx) {
      return "0x" + hexStr;
    }if (!withOx && hasOx) {
      return hexStr.slice(2);
    }return hexStr;
  },
  toArr: function toArr(s) {
    try {
      return s.constructor === Array ? s : [s];
    } catch (e) {
      return [];
    }
  }
};