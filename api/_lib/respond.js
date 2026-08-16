export function sendError(res, err) {
  const status = err.status || 500;
  console.error(`[API ERROR ${status}]`, err.message);
  const body = { error: err.message || 'Internal server error' };
  if (err.whopUrl) body.whopUrl = err.whopUrl;
  res.status(status).json(body);
}
