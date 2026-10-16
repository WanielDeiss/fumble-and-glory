// jsdom's Blob has no text(); every browser the app supports does.
// FileReader is the only way to read a jsdom Blob, hence the polyfill below.
if (!Blob.prototype.text) {
  Blob.prototype.text = function (this: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error ?? new Error("Could not read blob"));
      reader.readAsText(this); // NOSONAR: this *is* the Blob#text() polyfill
    });
  };
}
