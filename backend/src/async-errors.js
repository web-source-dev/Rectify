// Express 4 only catches errors thrown synchronously by a route handler. When an
// async handler's promise rejects (e.g. a database error), the rejection goes
// unhandled and Node crashes the whole server. This makes Express forward those
// rejections to the error middleware instead, so one failing request gets a 500
// and the server keeps running. (Express 5 does this natively.)
const Layer = require('express/lib/router/layer');

Layer.prototype.handle_request = function handle(req, res, next) {
  const fn = this.handle;

  if (fn.length > 3) {
    // not a standard request handler
    return next();
  }

  try {
    const result = fn(req, res, next);
    if (result && typeof result.catch === 'function') {
      result.catch(next);
    }
  } catch (err) {
    next(err);
  }
};
