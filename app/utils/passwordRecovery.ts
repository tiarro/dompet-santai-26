export function hasAuthCallbackParameters(url: URL) {
  const fragment = new URLSearchParams(url.hash.slice(1))
  return ['code', 'token_hash', 'access_token', 'refresh_token', 'error', 'error_code', 'error_description']
    .some(key => url.searchParams.has(key) || fragment.has(key))
}
