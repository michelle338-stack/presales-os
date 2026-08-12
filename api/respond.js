export function sendError(res, err) {
  const status = err.status || 500;
  console.error(`[API ERROR ${status}]`, err.message);
  res.status(status).json({ error: err.message || 'Internal server error' });
}
