export default {
  formatHex(hexStr, withOx = false) {
    if (typeof hexStr !== 'string') return hexStr;

    const hasOx = hexStr.slice(0,2) == '0x';
    if (withOx && !hasOx)
      return '0x' + hexStr;
    if (!withOx && hasOx)
      return hexStr.slice(2);
    return hexStr;
  },
  toArr(s) {
    try {
      return s.constructor === Array ? s : [s];
    } catch (e) {
      return [];
    }
  }
};

