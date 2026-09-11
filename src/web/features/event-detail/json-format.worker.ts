self.onmessage = (event: MessageEvent<string>) => {
  try { self.postMessage(JSON.stringify(JSON.parse(event.data), null, 2)); }
  catch { self.postMessage(event.data); }
};
