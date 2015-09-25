export default {
  toArr(s) {
    try {
      return s.constructor === Array ? s : [s];
    } catch (e) {
      return [];
    }
  }
};

