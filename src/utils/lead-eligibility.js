function present(value) {
  return Boolean(String(value || '').trim());
}

export function hasInstagramPresence(lead) {
  const handle = String(lead?.instagram || '').trim();
  return (present(handle) && handle !== '@') || present(lead?.instagram_url);
}

export function hasUsableWebsite(lead) {
  if (!present(lead?.site)) return false;
  return lead?.websiteData?.reachable !== false;
}

export function hasDigitalPresence(lead) {
  return hasUsableWebsite(lead) || hasInstagramPresence(lead);
}
